import { useCallback } from 'react'
import { getSourceAndTarget } from '@/libs/utils'
import type { LinkDatum, NodeDatum } from '@/types'

export { getSourceAndTarget } from '@/libs/utils'

// Function to find all linked nodes
export const createFindAllConnectedNodes = () =>
  useCallback((nodeId: string, links: LinkDatum[]): Set<string> => {
    const relatedNodes = new Set<string>()

    // Adding a source node
    relatedNodes.add(nodeId)

    // 1. Find all parents (one level up)
    links.forEach((link) => {
      const { sourceId, targetId } = getSourceAndTarget(link)
      // If the current node is the target, add the source (parent)
      if (targetId === nodeId) {
        relatedNodes.add(sourceId)
      }
    })

    // 2. Find all children recursively (all levels down)
    const findAllChildren = (currentNodeId: string, visited: Set<string>) => {
      links.forEach((link) => {
        const { sourceId, targetId } = getSourceAndTarget(link)

        // If the current node is the source and the target has not been visited yet
        if (sourceId === currentNodeId && !visited.has(targetId)) {
          relatedNodes.add(targetId)
          visited.add(targetId)
          // Recursively find children of this child
          findAllChildren(targetId, visited)
        }
      })
    }

    // Run search for children with many visited nodes to avoid cycles
    const visitedForChildren = new Set<string>([nodeId])
    findAllChildren(nodeId, visitedForChildren)

    return relatedNodes
  }, [])

export const getNodeRadius = (d: NodeDatum) => {
  if (d.isRoot) {
    const size = d.size || 1024
    const minRadius = 30
    const maxRadius = 50
    const minSize = 1024
    const maxSize = 50 * 1024 * 1024

    const logSize = Math.log(Math.max(size, minSize))
    const logMin = Math.log(minSize)
    const logMax = Math.log(maxSize)

    const ratio = (logSize - logMin) / (logMax - logMin)
    return minRadius + (maxRadius - minRadius) * Math.min(ratio, 1)
  } else if (d.dependencyLevel === 1) {
    const size = d.size || 1024
    const minRadius = 4
    const maxRadius = 30
    const minSize = 1024
    const maxSize = 10 * 1024 * 1024

    const logSize = Math.log(Math.max(size, minSize))
    const logMin = Math.log(minSize)
    const logMax = Math.log(maxSize)

    const ratio = (logSize - logMin) / (logMax - logMin)
    return minRadius + (maxRadius - minRadius) * Math.min(ratio, 1)
  } else {
    const size = d.size || 0
    if (size === 0) return 4

    const minRadius = 4
    const maxRadius = 20
    const minSize = 1024
    const maxSize = 10 * 1024 * 1024

    const logSize = Math.log(Math.max(size, minSize))
    const logMin = Math.log(minSize)
    const logMax = Math.log(maxSize)

    const ratio = (logSize - logMin) / (logMax - logMin)
    return minRadius + (maxRadius - minRadius) * Math.min(ratio, 1)
  }
}

export const getNodeColor = (d: NodeDatum) => {
  switch (d.dependencyLevel) {
    case 0:
      return '#ffb500'
    case 1:
      return '#27ae60'
    case 2:
      return '#e74c3c'
    default:
      return '#95a5a6'
  }
}

export const getStrokeColor = (d: NodeDatum) => {
  if (d.isRoot) return '#ffcd5e'
  if (d.dependencyLevel === 1) return '#24ff4c'
  if (d.dependencyLevel === 2) return '#e77b6f'
  if (!d.isInstalled) return '#dc2626'
  return '#9ba4b4'
}

export const getStrokeWidth = (d: NodeDatum) => {
  if (d.isRoot) return 3
  if (!d.isInstalled) return 2
  return 1
}

export const getLinkColor = (d: LinkDatum) => {
  switch (d.type) {
    case 'devDependency':
      return '#f39c12'
    case 'peerDependency':
      return '#9b59b6'
    case 'optionalDependency':
      return '#1abc9c'
    default:
      return '#7f8c8d'
  }
}

export const truncateText = (text: string, maxLength: number = 15) => {
  if (text.length <= maxLength) return text

  const withoutScope = text.replace(/^@[^/]+\//, '')
  if (withoutScope.length <= maxLength) return withoutScope

  return withoutScope.substring(0, maxLength - 1) + '…'
}
