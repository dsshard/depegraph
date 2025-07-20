import * as fs from 'node:fs'
import * as path from 'node:path'
import Arborist from '@npmcli/arborist'
import * as lockfile from '@yarnpkg/lockfile'
import { glob } from 'glob'

import type { PackageInfo, ParsedData, WorkspaceInfo } from '@/types'

export class DataParser {
  private rootPath: string

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  async parseProject(): Promise<ParsedData> {
    const packages = await this.findPackages()
    const workspaces = this.detectWorkspaces(packages)
    const installedPackages = new Map<string, { version: string; size?: number }>()
    const dependencyTree = new Map<string, Set<string>>()

    await this.analyzeLockFiles(installedPackages, dependencyTree)
    await this.scanNodeModules(installedPackages, dependencyTree)
    return {
      packages,
      workspaces,
      installedPackages,
      dependencyTree,
    }
  }

  private async findPackages(): Promise<PackageInfo[]> {
    const packageJsonFiles = await glob('**/package.json', {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/coverage/**'],
    })

    const packages: PackageInfo[] = []

    for (const file of packageJsonFiles) {
      const fullPath = path.join(this.rootPath, file)
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        const pkg = JSON.parse(content)

        packages.push({
          name: pkg.name || path.basename(path.dirname(fullPath)),
          version: pkg.version || '1.0.0',
          path: fullPath,
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {},
          peerDependencies: pkg.peerDependencies || {},
          optionalDependencies: pkg.optionalDependencies || {},
        })
      } catch (error) {
        console.warn(`⚠️ Parse error ${fullPath}:`, error)
      }
    }

    return packages
  }

  private detectWorkspaces(packages: PackageInfo[]): WorkspaceInfo[] {
    const workspaceMap = new Map<string, PackageInfo[]>()

    for (const pkg of packages) {
      const pkgDir = path.dirname(pkg.path)
      const relativePath = path.relative(this.rootPath, pkgDir)

      let workspaceKey = ''
      if (relativePath === '') {
        workspaceKey = 'root'
      } else {
        const pathParts = relativePath.split(path.sep)
        if (pathParts.length === 1) {
          workspaceKey = 'root'
        } else {
          workspaceKey = pathParts[0]
        }
      }

      if (!workspaceMap.has(workspaceKey)) {
        workspaceMap.set(workspaceKey, [])
      }
      workspaceMap.get(workspaceKey)?.push(pkg)
    }

    return Array.from(workspaceMap.entries()).map(([key, packages]) => ({
      name: key === 'root' ? 'Root' : key.charAt(0).toUpperCase() + key.slice(1),
      path: key === 'root' ? this.rootPath : path.join(this.rootPath, key),
      packages: packages.map((p) => p.name),
    }))
  }

  private async analyzeLockFiles(
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    const lockFiles = await this.findLockFiles()

    for (const lockFile of lockFiles) {
      if (lockFile.type === 'yarn') {
        await this.analyzeYarnLockWithLibrary(lockFile.path, installedPackages, dependencyTree)
      } else if (lockFile.type === 'npm') {
        await this.analyzePackageLockWithArborist(lockFile.path, installedPackages, dependencyTree)
      }
    }
  }

  private async findLockFiles(): Promise<Array<{ path: string; type: 'yarn' | 'npm' }>> {
    const lockFiles: Array<{ path: string; type: 'yarn' | 'npm' }> = []

    const yarnLocks = await glob('**/yarn.lock', {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**'],
    })

    for (const yarnLock of yarnLocks) {
      lockFiles.push({
        path: path.join(this.rootPath, yarnLock),
        type: 'yarn',
      })
    }

    const npmLocks = await glob('**/package-lock.json', {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**'],
    })

    for (const npmLock of npmLocks) {
      lockFiles.push({
        path: path.join(this.rootPath, npmLock),
        type: 'npm',
      })
    }
    return lockFiles
  }

  private async analyzeYarnLockWithLibrary(
    lockPath: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    try {
      const content = fs.readFileSync(lockPath, 'utf8')
      const parsed = lockfile.parse(content)

      if (parsed.type !== 'success') {
        return
      }

      for (const [key, packageInfo] of Object.entries(parsed.object)) {
        const packageName = this.extractPackageNameFromYarnKey(key)
        if (!packageName) continue

        // biome-ignore lint/suspicious/noExplicitAny: <json>
        const version = (packageInfo as any).version || '1.0.0'

        if (!installedPackages.has(packageName)) {
          installedPackages.set(packageName, { version })
        }

        // biome-ignore lint/suspicious/noExplicitAny: <json>
        const dependencies = (packageInfo as any).dependencies || {}
        if (Object.keys(dependencies).length > 0) {
          const deps = new Set<string>()
          for (const depName of Object.keys(dependencies)) {
            const cleanDepName = this.cleanPackageName(depName)
            if (cleanDepName && cleanDepName !== packageName) {
              deps.add(cleanDepName)
            }
          }

          if (deps.size > 0) {
            dependencyTree.set(packageName, deps)
          }
        }

        // biome-ignore lint/suspicious/noExplicitAny: <json>
        const optionalDependencies = (packageInfo as any).optionalDependencies || {}
        if (Object.keys(optionalDependencies).length > 0) {
          const existingDeps = dependencyTree.get(packageName) || new Set()
          for (const depName of Object.keys(optionalDependencies)) {
            const cleanDepName = this.cleanPackageName(depName)
            if (cleanDepName && cleanDepName !== packageName) {
              existingDeps.add(cleanDepName)
            }
          }
          dependencyTree.set(packageName, existingDeps)
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error yarn.lock ${lockPath}:`, error)
    }
  }

  private async analyzePackageLockWithArborist(
    lockPath: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    try {
      const projectRoot = path.dirname(lockPath)
      const arb = new Arborist({ path: projectRoot })

      const tree = await arb.loadActual()

      for (const node of tree.inventory.values()) {
        if (!node.name || node.name === tree.name) continue // Skip the root package

        const packageName = node.name
        const version = node.version || '1.0.0'

        if (!installedPackages.has(packageName)) {
          installedPackages.set(packageName, { version })
        }

        const deps = new Set<string>()

        // Direct
        for (const edge of node.edgesOut.values()) {
          if (edge?.to?.name && edge.to.name !== packageName) {
            deps.add(edge.to.name)
          }
        }

        if (deps.size > 0) {
          dependencyTree.set(packageName, deps)
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error ${lockPath}:`, error)
    }
  }

  private extractPackageNameFromYarnKey(key: string): string | null {
    try {
      const cleaned = key.replace(/"/g, '')

      if (cleaned.startsWith('@')) {
        const match = cleaned.match(/^(@[^/]+\/[^@]+)@/)
        return match ? match[1] : null
      }

      const atIndex = cleaned.indexOf('@')
      if (atIndex > 0) {
        return cleaned.substring(0, atIndex)
      }

      return cleaned.includes('@') ? null : cleaned
    } catch (_error) {
      return null
    }
  }

  private cleanPackageName(name: string): string {
    return name.replace(/[<>=^~].*$/, '').trim()
  }

  private async scanNodeModules(
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    const nodeModulesPaths = await glob('**/node_modules', {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**/node_modules/**'],
    })

    for (const nodeModulesPath of nodeModulesPaths) {
      const fullNodeModulesPath = path.join(this.rootPath, nodeModulesPath)
      await this.scanSingleNodeModules(fullNodeModulesPath, installedPackages, dependencyTree)
    }
  }

  private async scanSingleNodeModules(
    nodeModulesPath: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    try {
      const packages = fs.readdirSync(nodeModulesPath, { withFileTypes: true })

      for (const pkg of packages) {
        if (pkg.isDirectory() && !pkg.name.startsWith('.')) {
          if (pkg.name.startsWith('@')) {
            // Scoped packages
            await this.processScopedPackage(nodeModulesPath, pkg.name, installedPackages, dependencyTree)
          } else {
            // Regular packages
            await this.processRegularPackage(nodeModulesPath, pkg.name, installedPackages, dependencyTree)
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error node_modules ${nodeModulesPath}:`, error)
    }
  }

  private async processScopedPackage(
    nodeModulesPath: string,
    scopeName: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    const scopePath = path.join(nodeModulesPath, scopeName)
    try {
      const scopedPackages = fs.readdirSync(scopePath, { withFileTypes: true })
      for (const scopedPkg of scopedPackages) {
        if (scopedPkg.isDirectory()) {
          const fullName = `${scopeName}/${scopedPkg.name}`
          const packagePath = path.join(scopePath, scopedPkg.name)
          await this.processPackageJson(fullName, packagePath, installedPackages, dependencyTree)
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error scoped packages in ${scopePath}:`, error)
    }
  }

  private async processRegularPackage(
    nodeModulesPath: string,
    packageName: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    const packagePath = path.join(nodeModulesPath, packageName)
    await this.processPackageJson(packageName, packagePath, installedPackages, dependencyTree)
  }

  private async processPackageJson(
    packageName: string,
    packagePath: string,
    installedPackages: Map<string, { version: string; size?: number }>,
    dependencyTree: Map<string, Set<string>>,
  ): Promise<void> {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json')

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        const version = packageJson.version || '1.0.0'

        if (!installedPackages.has(packageName)) {
          installedPackages.set(packageName, { version })
        }

        if (!dependencyTree.has(packageName)) {
          const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.optionalDependencies,
          }

          if (Object.keys(allDeps).length > 0) {
            const deps = new Set<string>()
            Object.keys(allDeps).forEach((depName) => {
              const cleanName = this.cleanPackageName(depName)
              if (cleanName) {
                deps.add(cleanName)
              }
            })

            if (deps.size > 0) {
              dependencyTree.set(packageName, deps)
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error parse ${packageName}:`, error)
    }
  }
}
