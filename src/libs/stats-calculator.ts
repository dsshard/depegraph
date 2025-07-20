import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'fast-glob'
import { formatSize } from '@/libs/utils'
import type { PackageStats, ParsedData, ProjectStats } from '@/types'

export class StatsCalculator {
  private readonly rootPath: string
  private parsedData: ParsedData

  constructor(rootPath: string, parsedData: ParsedData) {
    this.rootPath = rootPath
    this.parsedData = parsedData
  }

  async calculateStats(): Promise<{
    packageStats: Map<string, PackageStats>
    projectStats: ProjectStats
  }> {
    await this.calculatePackageSizes()
    const packageStats = this.buildPackageStats()
    const projectStats = this.buildProjectStats(packageStats)

    return {
      packageStats,
      projectStats,
    }
  }

  private async calculatePackageSizes(): Promise<void> {
    const nodeModulesPaths = await glob('**/node_modules', {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**/node_modules/**'],
    })

    if (nodeModulesPaths.length === 0) {
      const rootNodeModules = path.join(this.rootPath, 'node_modules')
      if (fs.existsSync(rootNodeModules)) {
        await this.calculateNodeModulesSizes(rootNodeModules)
      }
    } else {
      for (const nodeModulesPath of nodeModulesPaths) {
        const fullNodeModulesPath = path.join(this.rootPath, nodeModulesPath)
        await this.calculateNodeModulesSizes(fullNodeModulesPath)
      }
    }

    await this.calculateRootPackagesSizes()
  }

  private async calculateNodeModulesSizes(nodeModulesPath: string): Promise<void> {
    try {
      if (!fs.existsSync(nodeModulesPath)) return

      const packages = fs.readdirSync(nodeModulesPath, { withFileTypes: true })

      for (const pkg of packages) {
        if (pkg.isDirectory() && !pkg.name.startsWith('.')) {
          const pkgPath = path.join(nodeModulesPath, pkg.name)

          if (pkg.name.startsWith('@')) {
            // Scoped packages
            await this.calculateScopedPackagesSizes(pkgPath, pkg.name)
          } else {
            // Regular packages
            const size = await this.calculatePackageSize(pkgPath)
            this.updatePackageSize(pkg.name, size)
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error node_modules ${nodeModulesPath}:`, error)
    }
  }

  private async calculateScopedPackagesSizes(scopePath: string, scopeName: string): Promise<void> {
    try {
      if (!fs.existsSync(scopePath)) return

      const scopedPackages = fs.readdirSync(scopePath, { withFileTypes: true })

      for (const scopedPkg of scopedPackages) {
        if (scopedPkg.isDirectory()) {
          const scopedPkgPath = path.join(scopePath, scopedPkg.name)
          const fullName = `${scopeName}/${scopedPkg.name}`
          const size = await this.calculatePackageSize(scopedPkgPath)
          this.updatePackageSize(fullName, size)
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error scoped packages in ${scopePath}:`, error)
    }
  }

  private async calculatePackageSize(packagePath: string): Promise<number> {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json')

      if (!fs.existsSync(packageJsonPath)) {
        return await this.getFolderSize(packagePath)
      }

      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageJsonContent)

      return await this.calculateUniversalPackageSize(packagePath, packageJson)
    } catch (_error) {
      return await this.getFolderSize(packagePath)
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <json>
  private async calculateUniversalPackageSize(packagePath: string, packageJson: any): Promise<number> {
    let totalSize = 0

    const packageJsonPath = path.join(packagePath, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      totalSize += fs.statSync(packageJsonPath).size
    }

    if (Array.isArray(packageJson.files) && packageJson.files.length > 0) {
      for (const file of packageJson.files) {
        if (typeof file === 'string') {
          const filePath = path.join(packagePath, file)
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath)
            if (stats.isDirectory()) {
              totalSize += await this.getFolderSize(filePath)
            } else {
              totalSize += stats.size
            }
          }
        }
      }
      return totalSize
    }

    const productionDirs = ['dist', 'lib', 'build', 'es', 'cjs', 'esm', 'umd']

    for (const dir of productionDirs) {
      const dirPath = path.join(packagePath, dir)
      if (fs.existsSync(dirPath)) {
        totalSize += await this.getFolderSize(dirPath)
        return totalSize
      }
    }

    const entryPoints = [packageJson.main, packageJson.module, packageJson.browser].filter(Boolean)

    for (const entry of entryPoints) {
      if (typeof entry === 'string') {
        const entryPath = path.join(packagePath, entry)
        if (fs.existsSync(entryPath)) {
          const stats = fs.statSync(entryPath)
          if (stats.isFile()) {
            totalSize += stats.size
          } else if (stats.isDirectory()) {
            totalSize += await this.getFolderSize(entryPath)
          }
        }
      }
    }

    if (totalSize > 0) {
      return totalSize
    }

    const srcPath = path.join(packagePath, 'src')
    if (fs.existsSync(srcPath)) {
      totalSize += await this.getFolderSize(srcPath)
    } else {
      const indexFiles = ['index.js', 'index.mjs', 'index.cjs', 'index.ts']
      for (const indexFile of indexFiles) {
        const indexPath = path.join(packagePath, indexFile)
        if (fs.existsSync(indexPath)) {
          totalSize += fs.statSync(indexPath).size
        }
      }
    }

    return totalSize
  }

  private async getFolderSize(folderPath: string): Promise<number> {
    try {
      let totalSize = 0
      const items = fs.readdirSync(folderPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = path.join(folderPath, item.name)

        if (item.isDirectory()) {
          const excludeDirs = [
            'node_modules',
            '.git',
            '__tests__',
            'test',
            'tests',
            'spec',
            'specs',
            'docs',
            'doc',
            'documentation',
            'examples',
            'example',
            'demo',
            'demos',
            'coverage',
            '.nyc_output',
            'bench',
            'benchmark',
            'benchmarks',
            'fixtures',
            'fixture',
            'mocks',
            'mock',
            '__mocks__',
            '__snapshots__',
            '.github',
            '.vscode',
            '.idea',
            '__pycache__',
            '.cache',
            'stories',
            'story',
            '.storybook',
            'cypress',
            'e2e',
            'tmp',
            'temp',
            '.tmp',
            '.temp',
            'logs',
            'log',
            'locale',
            'locales',
            'lang',
            'languages',
            'i18n',
            'intl',
            'samples',
            'sample',
            'tutorials',
            'tutorial',
            'playground',
          ]

          const itemNameLower = item.name.toLowerCase()
          const shouldExclude = excludeDirs.some((dir) => itemNameLower === dir || itemNameLower.includes(dir))

          if (!shouldExclude) {
            totalSize += await this.getFolderSize(fullPath)
          }
        } else if (item.isFile()) {
          const fileName = item.name.toLowerCase()

          const shouldExclude =
            fileName.startsWith('.') ||
            fileName.endsWith('.config.js') ||
            fileName.endsWith('.config.ts') ||
            fileName.endsWith('.config.json') ||
            fileName.includes('.test.') ||
            fileName.includes('.spec.') ||
            fileName.includes('-test.') ||
            fileName.includes('-spec.') ||
            fileName.includes('.dev.') ||
            fileName.includes('.development.') ||
            fileName.includes('-dev.') ||
            fileName.includes('-development.') ||
            fileName.endsWith('.md') ||
            fileName.endsWith('.txt') ||
            fileName.endsWith('.yml') ||
            fileName.endsWith('.yaml') ||
            fileName.endsWith('.map') ||
            /^[a-z]{2}(-[a-z]{2})?\.js$/.test(fileName) ||
            /^[a-z]{2}(_[a-z]{2})?\.js$/.test(fileName) ||
            fileName.includes('locale')

          if (!shouldExclude) {
            try {
              const stats = fs.statSync(fullPath)
              totalSize += stats.size
            } catch (_error) {}
          }
        }
      }

      return totalSize
    } catch (_error) {
      return 0
    }
  }

  private async calculateRootPackagesSizes(): Promise<void> {
    for (const pkg of this.parsedData.packages) {
      const pkgDir = path.dirname(pkg.path)
      const size = await this.getSourceCodeSize(pkgDir)
      this.updatePackageSize(pkg.name, size)
    }
  }

  private updatePackageSize(packageName: string, size: number): void {
    const existing = this.parsedData.installedPackages.get(packageName)
    if (existing) {
      this.parsedData.installedPackages.set(packageName, {
        ...existing,
        size,
      })
    } else {
      this.parsedData.installedPackages.set(packageName, {
        version: '1.0.0',
        size,
      })
    }
  }

  private async getSourceCodeSize(folderPath: string): Promise<number> {
    try {
      let totalSize = 0
      const items = fs.readdirSync(folderPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = path.join(folderPath, item.name)

        if (item.isDirectory()) {
          if (
            ['app', 'source', 'src', 'lib', 'components', 'pages', 'utils', 'hooks', 'types', 'styles'].includes(
              item.name,
            )
          ) {
            totalSize += await this.getFolderSize(fullPath)
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name)
          if (['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.less', '.vue', '.proto'].includes(ext)) {
            try {
              const stats = fs.statSync(fullPath)
              totalSize += stats.size
            } catch (_error) {}
          }
        }
      }

      return Math.max(totalSize, 1024)
    } catch (_error) {
      return 1024
    }
  }

  private buildPackageStats(): Map<string, PackageStats> {
    const packageStats = new Map<string, PackageStats>()
    const allPackageNames = new Set<string>()

    this.parsedData.packages.forEach((pkg) => allPackageNames.add(pkg.name))
    this.parsedData.installedPackages.forEach((_, name) => allPackageNames.add(name))
    this.parsedData.dependencyTree.forEach((deps, name) => {
      allPackageNames.add(name)
      deps.forEach((dep) => allPackageNames.add(dep))
    })

    for (const packageName of allPackageNames) {
      const installedInfo = this.parsedData.installedPackages.get(packageName)
      const isInstalled = installedInfo !== undefined
      const size = installedInfo?.size || 0
      const version = installedInfo?.version || '1.0.0'

      const directDependencies = Array.from(this.parsedData.dependencyTree.get(packageName) || [])

      const allDependencies = this.getAllDependencies(packageName)

      const dependentCount = this.countDependents(packageName)

      packageStats.set(packageName, {
        name: packageName,
        version,
        size,
        formattedSize: formatSize(size),
        isInstalled,
        dependencyCount: directDependencies.length,
        dependentCount,
        directDependencies,
        allDependencies,
      })
    }

    return packageStats
  }

  private getAllDependencies(packageName: string, visited = new Set<string>()): string[] {
    if (visited.has(packageName)) return []
    visited.add(packageName)

    const directDeps = this.parsedData.dependencyTree.get(packageName) || new Set()
    const allDeps = new Set(directDeps)

    for (const dep of directDeps) {
      const subDeps = this.getAllDependencies(dep, new Set(visited))
      subDeps.forEach((subDep) => allDeps.add(subDep))
    }

    return Array.from(allDeps)
  }

  private countDependents(packageName: string): number {
    let count = 0
    for (const [, deps] of this.parsedData.dependencyTree.entries()) {
      if (deps.has(packageName)) {
        count++
      }
    }
    return count
  }

  private buildProjectStats(packageStats: Map<string, PackageStats>): ProjectStats {
    const rootPackageNames = new Set(this.parsedData.packages.map((p) => p.name))
    let totalSize = 0
    let installedCount = 0
    let missingCount = 0
    const levelDistribution = new Map<number, number>()

    const packageLevels = this.calculateDependencyLevels()
    let maxLevel = 0

    for (const [packageName, stats] of packageStats.entries()) {
      totalSize += stats.size

      if (stats.isInstalled) {
        installedCount++
      } else {
        missingCount++
      }

      const level = packageLevels.get(packageName) || 0
      maxLevel = Math.max(maxLevel, level)
      levelDistribution.set(level, (levelDistribution.get(level) || 0) + 1)
    }

    const largestPackages = Array.from(packageStats.values())
      .filter((pkg) => pkg.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)

    const heaviestDependencies = Array.from(packageStats.values())
      .sort((a, b) => b.dependencyCount - a.dependencyCount)
      .slice(0, 10)

    return {
      totalPackages: packageStats.size,
      totalSize,
      formattedTotalSize: formatSize(totalSize),
      rootPackages: rootPackageNames.size,
      installedPackages: installedCount,
      missingPackages: missingCount,
      maxDependencyLevel: maxLevel,
      levelDistribution,
      largestPackages,
      heaviestDependencies,
    }
  }

  private calculateDependencyLevels(): Map<string, number> {
    const levels = new Map<string, number>()
    const queue: { packageName: string; level: number }[] = []

    for (const pkg of this.parsedData.packages) {
      levels.set(pkg.name, 0)
      queue.push({ packageName: pkg.name, level: 0 })
    }

    while (queue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: <test>
      const { packageName, level } = queue.shift()!
      const deps = this.parsedData.dependencyTree.get(packageName)

      if (deps) {
        for (const dep of deps) {
          const currentLevel = levels.get(dep)
          const newLevel = level + 1

          if (currentLevel === undefined || newLevel < currentLevel) {
            levels.set(dep, newLevel)
            queue.push({ packageName: dep, level: newLevel })
          }
        }
      }
    }

    return levels
  }
}
