/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <need> */
import { useEffect, useMemo, useState } from 'react'
import { Graph } from '@/components/graph'
import { getSourceAndTarget } from '@/components/graph-utils/utils'
import type { LinkDatum, NodeDatum, WorkspaceInfo } from '@/types'

interface DependencyGraphProps {
  nodes: NodeDatum[]
  links: LinkDatum[]
  workspaces?: WorkspaceInfo[]
}

export default function DependencyGraph({ nodes, links, workspaces = [] }: DependencyGraphProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredNodes, setFilteredNodes] = useState<NodeDatum[]>(nodes)
  const [showLegend, setShowLegend] = useState(false)
  const [filteredLinks, setFilteredLinks] = useState<LinkDatum[]>(links)
  const [hoveredNode, setHoveredNode] = useState<NodeDatum | null>(null)

  const calculateTotalSize = useMemo(() => {
    const getSizeInBytes = (formattedSize: string | undefined): number => {
      if (!formattedSize) return 0

      const size = formattedSize.toLowerCase()
      const num = parseFloat(size)

      if (size.includes('kb')) return num * 1024
      if (size.includes('mb')) return num * 1024 * 1024
      if (size.includes('gb')) return num * 1024 * 1024 * 1024
      if (size.includes('b')) return num

      return 0
    }

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B'

      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))

      return parseFloat((bytes / k ** i).toFixed(1)) + ' ' + sizes[i]
    }

    const getAllDependencies = (nodeId: string, visited = new Set<string>()): Set<string> => {
      if (visited.has(nodeId)) return visited

      visited.add(nodeId)

      links.forEach((link) => {
        const { sourceId, targetId } = getSourceAndTarget(link)
        if (sourceId === nodeId && !visited.has(targetId)) {
          getAllDependencies(targetId, visited)
        }
      })

      return visited
    }

    return (nodeId: string): string => {
      const allDependencies = getAllDependencies(nodeId)
      let totalBytes = 0

      allDependencies.forEach((depId) => {
        const node = nodes.find((n) => n.id === depId)
        if (node?.formattedSize) {
          totalBytes += getSizeInBytes(node.formattedSize)
        }
      })

      return formatBytes(totalBytes)
    }
  }, [nodes, links])

  // Improved search logic based on parentPath
  useEffect(() => {
    if (searchTerm.trim()) {
      const relatedNodes = new Set<string>()

      // 1. Find nodes that match the search
      const matchingNodes = nodes.filter((node) => node.name.toLowerCase().includes(searchTerm.toLowerCase()))

      // 2. Add found nodes
      matchingNodes.forEach((node) => relatedNodes.add(node.id))

      // 3. For each node found, add its dependencies (what it uses)
      const addDependencies = (nodeId: string, maxDepth: number = 10) => {
        if (maxDepth <= 0) return

        links.forEach((link) => {
          if (link.source === nodeId && !relatedNodes.has(link.target)) {
            relatedNodes.add(link.target)
            addDependencies(link.target, maxDepth - 1)
          }
        })
      }

      // 4. For each node found, find who is using it (via links)
      const addUsedByLinks = (nodeId: string, maxDepth: number = 10) => {
        if (maxDepth <= 0) return

        links.forEach((link) => {
          if (link.target === nodeId && !relatedNodes.has(link.source)) {
            relatedNodes.add(link.source)
            addUsedByLinks(link.source, maxDepth - 1)
          }
        })
      }

      // 5. Add parents via parentPath
      const addParentPath = (node: NodeDatum) => {
        if (node.parentPath && node.parentPath.length > 0) {
          // parentPath contains the path from root to this node
          node.parentPath.forEach((parentName) => {
            // Find node by name from parentPath
            const parentNode = nodes.find((n) => n.name === parentName)
            if (parentNode) {
              relatedNodes.add(parentNode.id)
              // Recursively add parents of this parent
              addParentPath(parentNode)
            }
          })
        }
      }

      // 6. Find nodes that have found in their parentPath
      const addChildrenByParentPath = (searchNode: NodeDatum) => {
        nodes.forEach((node) => {
          if (node.parentPath?.includes(searchNode.name)) {
            relatedNodes.add(node.id)
          }
        })
      }

      // Apply logic to all found nodes
      matchingNodes.forEach((node) => {
        addDependencies(node.id, 5) // Dependencies 5 levels down
        addUsedByLinks(node.id, 5) // Who uses via links 5 levels up
        addParentPath(node) // Parents via parentPath
        addChildrenByParentPath(node) // Children who have this node in parentPath
      })

      // Filtering the results
      const filtered = nodes.filter((node) => relatedNodes.has(node.id))

      const filteredLinksList = links.filter((link) => {
        const { sourceId, targetId } = getSourceAndTarget(link)

        return relatedNodes.has(sourceId) && relatedNodes.has(targetId)
      })

      setFilteredNodes(filtered)
      setFilteredLinks(filteredLinksList)
    } else {
      setFilteredNodes(nodes)
      setFilteredLinks(links)
    }
  }, [searchTerm, nodes, links])

  // Eye icon for toggle legends
  const EyeIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {isOpen ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white shadow-sm"
        />

        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors shadow-sm flex items-center gap-2"
          title={showLegend ? 'Hide legend' : 'Show legend'}
        >
          <EyeIcon isOpen={showLegend} />
          {showLegend ? 'Show' : 'Legend'}
        </button>

        {/* Search statistics */}
        {searchTerm.trim() && (
          <div className="text-xs text-gray-600 bg-white px-2 py-1 rounded shadow">
            Showed: {filteredNodes.length} from {nodes.length} pkgs
          </div>
        )}
      </div>

      <Graph
        filteredLinks={filteredLinks}
        filteredNodes={filteredNodes}
        nodes={nodes}
        workspaces={workspaces}
        setHoveredNode={setHoveredNode}
      />

      {/* Improved hover node information */}
      {hoveredNode && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md border border-gray-200/10 p-4 rounded-lg shadow-lg max-w-sm pointer-events-none">
          <h3 className="font-bold text-lg text-white/70 mb-2">{hoveredNode.name}</h3>

          <div className="space-y-2 text-sm">
            {hoveredNode.version && (
              <div className="flex justify-between">
                <span className="text-gray-600">Version:</span>
                <span className="font-mono text-blue-600">{hoveredNode.version}</span>
              </div>
            )}

            {hoveredNode.formattedSize && (
              <div className="flex justify-between">
                <span className="text-gray-600">Size:</span>
                <span className="font-semibold text-purple-600">{hoveredNode.formattedSize}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-600">Total size:</span>
              <span className="font-semibold text-pink-600">{calculateTotalSize(hoveredNode.id)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Level:</span>
              <span
                className={`font-semibold ${
                  hoveredNode.dependencyLevel === 0
                    ? 'text-slate-700'
                    : hoveredNode.dependencyLevel === 1
                      ? 'text-green-600'
                      : hoveredNode.dependencyLevel === 2
                        ? 'text-red-600'
                        : 'text-gray-500'
                }`}
              >
                {hoveredNode.dependencyLevel === 0
                  ? 'Root'
                  : hoveredNode.dependencyLevel === 1
                    ? 'Direct'
                    : hoveredNode.dependencyLevel === 2
                      ? 'Secondary'
                      : `Level ${hoveredNode.dependencyLevel}`}
              </span>
            </div>

            {hoveredNode.workspaceId && (
              <div className="flex justify-between">
                <span className="text-gray-600">Workspace:</span>
                <span className="font-mono text-indigo-600 text-xs">{hoveredNode.workspaceId}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-600">Installed:</span>
              <span className={`font-semibold ${hoveredNode.isInstalled ? 'text-green-600' : 'text-red-600'}`}>
                {hoveredNode.isInstalled ? '✓ Yes' : '✗ No'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Deps:</span>
              <span className="font-semibold text-blue-600">{hoveredNode.depCount}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Used:</span>
              <span className="font-semibold text-orange-600">{hoveredNode.inDegree}</span>
            </div>
          </div>
        </div>
      )}

      {showLegend && (
        <div className="absolute bottom-4 right-4 bg-black/50 border border-gray-200/10 backdrop-blur-md p-4 rounded-lg shadow-lg text-white/50">
          <h4 className="font-bold mb-3 text-white">Legend</h4>

          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-2 text-white">Level deps:</p>
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <div className="w-6 h-6 bg-slate-800 rounded-full mr-3 flex-shrink-0"></div>
                  <span className="">Root pkgs</span>
                </div>
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-green-500 rounded-full mr-3 flex-shrink-0"></div>
                  <span className="">Direct deps</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-red-500 rounded-full mr-3 flex-shrink-0"></div>
                  <span className="">Second deps</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-400 rounded-full mr-3 flex-shrink-0"></div>
                  <span className="">Deep deps</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200/10 pt-2">
              <p className="font-semibold mb-2 text-white">Status:</p>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gray-500 rounded-full border-2 border-red-600 mr-3 flex-shrink-0"></div>
                <span className="">Not installed</span>
              </div>
            </div>

            <div className="border-t border-gray-200/10 pt-2">
              <p className="font-semibold mb-2 text-white">Types of dependencies:</p>
              <div className="space-y-1">
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-gray-500 mr-3"></div>
                  <span className="text-xs">dependencies</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-orange-500 mr-3"></div>
                  <span className="text-xs">devDependencies</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-purple-500 mr-3"></div>
                  <span className="text-xs">peerDependencies</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-teal-500 mr-3"></div>
                  <span className="text-xs">optionalDependencies</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
