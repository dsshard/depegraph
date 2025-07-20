import { formatSize, getSourceAndTarget } from '@/libs/utils'
import type { DependencyGraph, LinkDatum, NodeDatum, PackageInfo, PackageStats, ParsedData } from '@/types'
import { DataParser } from './data-parser'
import { StatsCalculator } from './stats-calculator'

const maxNodesPerTree = 100000
const maxDepth = 3
const maxDependenciesPerNode = 500
const maxPerNode = 100

export class GraphBuilder {
  private readonly rootPath: string
  private parsedData: ParsedData = {
    packages: [],
    workspaces: [],
    installedPackages: new Map(),
    dependencyTree: new Map(),
  }
  private packageStats: Map<string, PackageStats> | null = null

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  async buildGraph(): Promise<DependencyGraph> {
    const parser = new DataParser(this.rootPath)
    this.parsedData = await parser.parseProject()

    const statsCalculator = new StatsCalculator(this.rootPath, this.parsedData)
    const { packageStats } = await statsCalculator.calculateStats()
    this.packageStats = packageStats

    const { nodes, links } = this.buildTreeStructure()

    this.calculateNodeMetrics(nodes, links)

    const duplicatedPackages = this.calculateDuplication(nodes)

    return {
      nodes,
      links,
      packages: this.parsedData.packages,
      workspaces: this.parsedData.workspaces,
      stats: {
        totalNodes: nodes.length,
        totalLinks: links.length,
        maxLevel: nodes.length > 0 ? Math.max(...nodes.map((n) => n.dependencyLevel)) : 0,
        levelDistribution: this.calculateLevelDistribution(nodes),
        duplicatedPackages,
      },
    }
  }

  private buildTreeStructure(): { nodes: NodeDatum[]; links: LinkDatum[] } {
    if (!this.parsedData || !this.packageStats) {
      throw new Error('Data not init')
    }

    const nodes: NodeDatum[] = []
    const links: LinkDatum[] = []
    const nodeIdCounter = new Map<string, number>()
    let totalNodeCount = 0

    for (const rootPackage of this.parsedData.packages) {
      if (totalNodeCount >= maxNodesPerTree) {
        break
      }

      const treeStats = { nodeCount: 0, maxDepth: 0 }

      const rootNode = this.createNode(rootPackage.name || 'unnamed', 0, true, [], nodeIdCounter)
      nodes.push(rootNode)
      treeStats.nodeCount++
      totalNodeCount++

      // Recursively build a tree with constraints
      this.buildDependencyTreeOptimized(
        rootPackage,
        rootNode,
        nodes,
        links,
        nodeIdCounter,
        new Set([rootPackage.name || 'unnamed']),
        treeStats,
        Math.min(maxNodesPerTree - totalNodeCount, 50000),
        maxDepth,
      )

      totalNodeCount += treeStats.nodeCount - 1
    }
    return { nodes, links }
  }

  private buildDependencyTreeOptimized(
    sourcePackage: PackageInfo,
    sourceNode: NodeDatum,
    nodes: NodeDatum[],
    links: LinkDatum[],
    nodeIdCounter: Map<string, number>,
    visitedInBranch: Set<string>,
    treeStats: { nodeCount: number; maxDepth: number },
    maxNodes: number,
    currentMaxDepth: number,
  ): void {
    if (sourceNode.dependencyLevel >= currentMaxDepth) {
      return
    }

    if (treeStats.nodeCount >= maxNodes) {
      return
    }

    treeStats.maxDepth = Math.max(treeStats.maxDepth, sourceNode.dependencyLevel)
    const directDependencies = this.getDirectDependencies(sourcePackage)

    const dependencyEntries = Array.from(directDependencies.entries())
    const limitedDeps = dependencyEntries.slice(0, maxDependenciesPerNode)

    for (const [depName, depType] of limitedDeps) {
      if (visitedInBranch.has(depName)) {
        continue
      }

      if (treeStats.nodeCount >= maxNodes) {
        break
      }

      const depNode = this.createNode(
        depName,
        sourceNode.dependencyLevel + 1,
        false,
        [...sourceNode.parentPath, sourceNode.originalName],
        nodeIdCounter,
      )
      nodes.push(depNode)
      treeStats.nodeCount++

      links.push({
        source: sourceNode.id,
        target: depNode.id,
        type: depType,
      })

      const newVisited = new Set(visitedInBranch)
      newVisited.add(sourcePackage.name || sourceNode.originalName)

      const depPackageJson = this.findPackageJsonForDependency(depName)
      if (depPackageJson) {
        this.buildDependencyTreeOptimized(
          depPackageJson,
          depNode,
          nodes,
          links,
          nodeIdCounter,
          newVisited,
          treeStats,
          maxNodes,
          currentMaxDepth,
        )
      } else {
        this.buildFromLockFileOptimized(
          depName,
          depNode,
          nodes,
          links,
          nodeIdCounter,
          newVisited,
          treeStats,
          maxNodes,
          currentMaxDepth,
        )
      }
    }
  }

  private buildFromLockFileOptimized(
    packageName: string,
    sourceNode: NodeDatum,
    nodes: NodeDatum[],
    links: LinkDatum[],
    nodeIdCounter: Map<string, number>,
    visitedInBranch: Set<string>,
    treeStats: { nodeCount: number; maxDepth: number },
    maxNodes: number,
    currentMaxDepth: number,
  ): void {
    if (sourceNode.dependencyLevel >= currentMaxDepth || treeStats.nodeCount >= maxNodes) {
      return
    }

    const lockDependencies = this.parsedData.dependencyTree.get(packageName)
    if (!lockDependencies || lockDependencies.size === 0) return

    const dependencyArray = Array.from(lockDependencies)
    const limitedDeps = dependencyArray.slice(0, Math.min(maxDependenciesPerNode, maxPerNode))

    for (const depName of limitedDeps) {
      if (visitedInBranch.has(depName) || treeStats.nodeCount >= maxNodes) {
        continue
      }

      const depNode = this.createNode(
        depName,
        sourceNode.dependencyLevel + 1,
        false,
        [...sourceNode.parentPath, sourceNode.originalName],
        nodeIdCounter,
      )
      nodes.push(depNode)
      treeStats.nodeCount++

      links.push({
        source: sourceNode.id,
        target: depNode.id,
        type: 'dependency',
      })

      if (this.shouldContinueRecursion(depName, sourceNode.dependencyLevel)) {
        const newVisited = new Set(visitedInBranch)
        newVisited.add(packageName)

        this.buildFromLockFileOptimized(
          depName,
          depNode,
          nodes,
          links,
          nodeIdCounter,
          newVisited,
          treeStats,
          maxNodes,
          currentMaxDepth,
        )
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <json>
  private getDirectDependencies(packageJson: any): Map<string, LinkDatum['type']> {
    const deps = new Map<string, LinkDatum['type']>()

    const depTypes = [
      { source: packageJson.dependencies, type: 'dependency' as const },
      { source: packageJson.devDependencies, type: 'devDependency' as const },
      { source: packageJson.peerDependencies, type: 'peerDependency' as const },
      { source: packageJson.optionalDependencies, type: 'optionalDependency' as const },
    ]

    for (const { source, type } of depTypes) {
      if (source && typeof source === 'object') {
        for (const depName of Object.keys(source)) {
          if (!deps.has(depName) && typeof depName === 'string' && depName.trim()) {
            deps.set(depName, type)
          }
        }
      }
    }

    return deps
  }

  private shouldContinueRecursion(_packageName: string, currentLevel: number): boolean {
    return currentLevel < maxDepth
  }

  private findPackageJsonForDependency(depName: string): PackageInfo | null {
    return this.parsedData.packages.find((pkg) => pkg.name === depName) || null
  }

  private createNode(
    packageName: string,
    level: number,
    isRoot: boolean,
    parentPath: string[],
    nodeIdCounter: Map<string, number>,
  ): NodeDatum {
    const currentCount = nodeIdCounter.get(packageName) || 0
    nodeIdCounter.set(packageName, currentCount + 1)

    const uniqueId = currentCount === 0 ? packageName : `${packageName}-duplicate-${currentCount}`

    const packageStats = this.packageStats?.get(packageName)
    const installedInfo = this.parsedData.installedPackages.get(packageName)
    const rootPackage = this.parsedData.packages.find((p) => p.name === packageName)

    return {
      id: uniqueId,
      name: packageName,
      originalName: packageName,
      version: packageStats?.version || installedInfo?.version || '1.0.0',
      isRoot,
      isInstalled: !!installedInfo,
      depCount: 0,
      inDegree: 0,
      type: isRoot ? 'root' : 'dependency',
      packagePath: rootPackage?.path,
      size: packageStats?.size || installedInfo?.size || 0,
      formattedSize: packageStats?.formattedSize || formatSize(installedInfo?.size || 0),
      dependencyLevel: level,
      workspaceId: this.getWorkspaceForPackage(packageName),
      parentPath,
    }
  }

  private calculateNodeMetrics(nodes: NodeDatum[], links: LinkDatum[]): void {
    const nodeMap = new Map<string, NodeDatum>()
    const outDegreeMap = new Map<string, number>()
    const inDegreeMap = new Map<string, number>()

    for (const node of nodes) {
      nodeMap.set(node.id, node)
      outDegreeMap.set(node.id, 0)
      inDegreeMap.set(node.id, 0)
    }

    for (const link of links) {
      const { sourceId, targetId } = getSourceAndTarget(link)

      outDegreeMap.set(sourceId, (outDegreeMap.get(sourceId) || 0) + 1)

      inDegreeMap.set(targetId, (inDegreeMap.get(targetId) || 0) + 1)
    }

    for (const node of nodes) {
      node.depCount = outDegreeMap.get(node.id) || 0
      node.inDegree = inDegreeMap.get(node.id) || 0
    }
  }

  private calculateDuplication(nodes: NodeDatum[]): Map<string, number> {
    const duplicationMap = new Map<string, number>()

    for (const node of nodes) {
      const count = duplicationMap.get(node.originalName) || 0
      duplicationMap.set(node.originalName, count + 1)
    }

    const duplicated = new Map<string, number>()
    for (const [name, count] of duplicationMap.entries()) {
      if (count > 1) {
        duplicated.set(name, count)
      }
    }

    return duplicated
  }

  private calculateLevelDistribution(nodes: NodeDatum[]): Map<number, number> {
    const distribution = new Map<number, number>()

    for (const node of nodes) {
      const level = node.dependencyLevel
      distribution.set(level, (distribution.get(level) || 0) + 1)
    }

    return distribution
  }

  private getWorkspaceForPackage(packageName: string): string {
    for (const workspace of this.parsedData.workspaces) {
      if (workspace.packages.includes(packageName)) {
        return workspace.name
      }
    }
    return 'Unknown'
  }
}
