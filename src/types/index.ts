export interface WorkspaceInfo {
  name: string
  path: string
  packages: string[]
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface AnalysisResult {
  nodes: NodeDatum[]
  links: LinkDatum[]
  packages: PackageInfo[]
  workspaces: WorkspaceInfo[]
}

export interface NodeDatum {
  id: string
  name: string
  version?: string
  isRoot: boolean
  parentPath: string[]
  originalName: string
  isInstalled: boolean
  depCount: number
  inDegree: number
  type: 'root' | 'dependency' | 'leaf'
  packagePath?: string
  size?: number
  formattedSize?: string
  dependencyLevel: number
  workspaceId?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface LinkDatum {
  source: string
  target: string
  type: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency'
}

export interface DependencyGraph {
  nodes: NodeDatum[]
  links: LinkDatum[]
  packages: any[]
  workspaces: WorkspaceInfo[]
  stats: {
    totalNodes: number
    totalLinks: number
    maxLevel: number
    levelDistribution: Map<number, number>
    duplicatedPackages: Map<string, number>
  }
}

export interface PackageInfo {
  name: string
  version: string
  path: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
  optionalDependencies: Record<string, string>
}

export interface ParsedData {
  packages: PackageInfo[]
  workspaces: WorkspaceInfo[]
  installedPackages: Map<string, { version: string; size?: number }>
  dependencyTree: Map<string, Set<string>>
}

export interface PackageStats {
  name: string
  version: string
  size: number
  formattedSize: string
  isInstalled: boolean
  dependencyCount: number
  dependentCount: number
  directDependencies: string[]
  allDependencies: string[]
}

export interface ProjectStats {
  totalPackages: number
  totalSize: number
  formattedTotalSize: string
  rootPackages: number
  installedPackages: number
  missingPackages: number
  maxDependencyLevel: number
  levelDistribution: Map<number, number>
  largestPackages: PackageStats[]
  heaviestDependencies: PackageStats[]
}
