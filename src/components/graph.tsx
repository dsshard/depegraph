import * as d3 from 'd3'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createDrag } from '@/components/graph-utils/drag'
import {
  createLabelHover,
  setHoverLabelsAttr,
  setPermanentLabelsAttr,
  updateHoverLabelSizes,
  updateLabelBackgrounds,
} from '@/components/graph-utils/label-hover'
import {
  createFindAllConnectedNodes,
  getLinkColor,
  getNodeColor,
  getNodeRadius,
  getSourceAndTarget,
  getStrokeColor,
  getStrokeWidth,
  truncateText,
} from '@/components/graph-utils/utils'
import { createZoom } from '@/components/graph-utils/zoom'
import type { LinkDatum, NodeDatum, WorkspaceInfo } from '@/types'

export const Graph = memo(function GraphMemo(props: {
  filteredNodes: NodeDatum[]
  nodes: NodeDatum[]
  filteredLinks: LinkDatum[]
  workspaces: WorkspaceInfo[]
  setHoveredNode: (node: NodeDatum | null) => void
}) {
  const [size, setSize] = useState<[number, number]>([800, 600])
  const { filteredNodes, filteredLinks, workspaces, setHoveredNode } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<NodeDatum, d3.SimulationLinkDatum<NodeDatum>> | null>(null)

  // Measuring the size of the container
  const measure = useCallback(() => {
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    if (width && height) setSize([width, height])
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // Function to find all linked nodes
  const findAllConnectedNodes = createFindAllConnectedNodes()

  // Basic graph rendering
  useEffect(() => {
    if (!svgRef.current || filteredNodes.length === 0) return

    const [width, height] = size
    const svg = d3.select(svgRef.current).style('width', '100%').style('height', '100%')

    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g')

    const zoom = createZoom(g)
    svg.call(zoom)

    // Creating a node map by workspace
    const workspaceNodeMap = new Map<string, NodeDatum[]>()
    filteredNodes.forEach((node) => {
      const workspaceName = node.workspaceId || 'default'
      if (!workspaceNodeMap.has(workspaceName)) {
        workspaceNodeMap.set(workspaceName, [])
      }
      workspaceNodeMap.get(workspaceName)?.push(node)
    })

    // Calculate positions for workspace with better centering
    const workspacePositions = new Map<string, { x: number; y: number; width: number; height: number }>()
    const workspaceNames = Array.from(workspaceNodeMap.keys())
    const workspaceSpacing = 1
    const workspacesPerRow = Math.max(1, Math.ceil(Math.sqrt(workspaceNames.length)))

    // Calculate the overall dimensions of the grid
    const totalRows = Math.ceil(workspaceNames.length / workspacesPerRow)
    const gridWidth = workspacesPerRow * workspaceSpacing
    const gridHeight = totalRows * workspaceSpacing

    // Offset to center the grid on the screen
    const offsetX = (width - gridWidth) / 2 + workspaceSpacing / 2
    const offsetY = (height - gridHeight) / 2 + workspaceSpacing / 2

    workspaceNames.forEach((name, index) => {
      const row = Math.floor(index / workspacesPerRow)
      const col = index % workspacesPerRow
      const centerX = offsetX + col * workspaceSpacing
      const centerY = offsetY + row * workspaceSpacing

      workspacePositions.set(name, {
        x: centerX,
        y: centerY,
        width: workspaceSpacing * 0.1,
        height: workspaceSpacing * 0.1,
      })
    })

    // Creating workspace areas
    const workspaceGroup = g.append('g').attr('class', 'workspaces')

    const updateWorkspaceAreas = () => {
      if (workspaces.length === 0) return

      const areas = workspaceGroup
        .selectAll<SVGGElement, WorkspaceInfo>('.workspace-area')
        .data(workspaces, (d) => d.name)

      areas.exit().remove()

      const areasEnter = areas.enter().append('g').attr('class', 'workspace-area')

      const allAreas = areasEnter.merge(areas)

      allAreas
        .select('.workspace-label')
        .attr('x', (d) => {
          const pos = workspacePositions.get(d.name)
          return pos ? pos.x : 0
        })
        .attr('y', (d) => {
          const pos = workspacePositions.get(d.name)
          return pos ? pos.y - pos.height / 2 + 20 : 0
        })
        .text((d) => d.name)
    }

    // Create links
    const linkGroup = g.append('g')
    const linkSelection = linkGroup
      .selectAll('line')
      .style('z-index', -1)
      .data(filteredLinks)
      .join('line')
      .attr('stroke', getLinkColor)
      .attr('stroke-opacity', 0.4) // Reduced opacity for a less confusing look
      .attr('stroke-width', 1.5)

    // Create nodes with increased area for hover
    const nodeGroup = g.append('g')

    // Create invisible big circles for better hover
    const nodeHoverAreas = nodeGroup
      .selectAll('.node-hover-area')
      .data(filteredNodes)
      .join('circle')
      .style('z-index', 10)
      .attr('class', 'node-hover-area')
      .attr('r', (d) => getNodeRadius(d) + 3)
      .attr('fill', 'transparent')
      .attr('stroke', 'none')
      .style('cursor', 'pointer')

    const nodeSelection = nodeGroup
      .selectAll('.node-visual')
      .data(filteredNodes)
      .join('circle')
      .attr('class', 'node-visual')
      .attr('r', getNodeRadius)
      .attr('fill', getNodeColor)
      .attr('stroke', getStrokeColor)
      .attr('stroke-width', getStrokeWidth)
      .style('pointer-events', 'none')

    // Handling events on invisible areas
    nodeHoverAreas
      .on('mouseenter', (_event, d) => {
        setHoveredNode(d)

        // Enlarge the visual node
        nodeSelection
          .filter((nodeD) => nodeD.id === d.id)
          .transition()
          .duration(200)
          .attr('r', getNodeRadius(d) * 1.5)

        // Find all linked nodes
        const connectedNodeIds = findAllConnectedNodes(d.id, filteredLinks)

        // Highlight connected lines
        linkSelection
          .transition()
          .duration(200)
          .attr('stroke-opacity', (link: LinkDatum) => {
            const { sourceId, targetId } = getSourceAndTarget(link)
            // Check if this line is connected to any of the connected nodes
            return connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId) ? 1 : 0.1
          })
          .attr('stroke-width', (link: LinkDatum) => {
            const { sourceId, targetId } = getSourceAndTarget(link)

            // Make lines thicker for linked nodes
            return connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId) ? 3 : 1.5
          })

        // Additionally highlight all related nodes
        nodeSelection
          .transition()
          .duration(200)
          .attr('opacity', (nodeD) => {
            return connectedNodeIds.has(nodeD.id) ? 1 : 0.3
          })
      })
      .on('mouseleave', (_event, d) => {
        setHoveredNode(null)

        // Return the size of the node
        nodeSelection
          .filter((nodeD) => nodeD.id === d.id)
          .transition()
          .duration(200)
          .attr('r', getNodeRadius(d))

        // Return the transparency of the lines
        linkSelection.transition().duration(200).attr('stroke-opacity', 0.4).attr('stroke-width', 1.5)

        // Return the transparency of the nodes
        nodeSelection.transition().duration(200).attr('opacity', 1)
      })

    // Create persistent labels with animated unfolding
    const permanentLabelGroup = g.append('g')
    const permanentLabels = permanentLabelGroup
      .selectAll('g')
      .data(filteredNodes.filter((d) => d.isRoot || d.dependencyLevel <= 2))
      .join('g')
      .attr('class', 'label-group')

    setPermanentLabelsAttr(permanentLabels)

    nodeHoverAreas
      .on('mouseenter.expand', (_event, d) => {
        // Find the corresponding label
        const labelGroup = permanentLabels.filter((labelD) => labelD.id === d.id)
        const labelText = labelGroup.select('.label-text')
        const labelBg = labelGroup.select('.label-bg')

        if (!labelText.empty()) {
          const originalText = truncateText(d.name, d.isRoot ? 20 : 12)
          const fullText = d.name

          // If the text was shortened, expand it
          if (originalText !== fullText) {
            labelGroup.style('z-index', 1000)
            const node = labelGroup.node()
            const group = labelGroup.node()
            if (node && 'parentNode' in node && group) {
              node.parentNode?.appendChild(group as Document)
            }

            labelText.text(fullText)

            setTimeout(() => {
              try {
                const node = labelText?.node() as SVGTextElement | null
                if (!node) return
                const textBBox = node.getBBox()
                labelBg
                  .transition()
                  .duration(200)
                  .attr('x', textBBox.x - 4)
                  .attr('y', textBBox.y - 2)
                  .attr('width', textBBox.width + 8)
                  .attr('height', textBBox.height + 4)
              } catch (_e) {
                const estimatedWidth = fullText.length * (d.isRoot ? 12 : 9) * 0.6
                const estimatedHeight = (d.isRoot ? 12 : 9) + 2
                labelBg
                  .transition()
                  .duration(200)
                  .attr('x', -estimatedWidth / 2 - 4)
                  .attr('y', -estimatedHeight / 2 - 2)
                  .attr('width', estimatedWidth + 8)
                  .attr('height', estimatedHeight + 4)
              }
            }, 10)
          }
        }
      })
      .on('mouseleave.expand', (_event, d) => {
        const labelGroup = permanentLabels.filter((labelD) => labelD.id === d.id)
        const labelText = labelGroup.select('.label-text')
        const labelBg = labelGroup.select('.label-bg')

        if (!labelText.empty()) {
          const originalText = truncateText(d.name, d.isRoot ? 20 : 12)
          const fullText = d.name

          if (originalText !== fullText) {
            labelGroup.style('z-index', null)
            labelText.text(originalText)
            setTimeout(() => {
              try {
                const node = labelText?.node() as SVGTextElement | null
                if (!node) return
                const textBBox = node.getBBox()
                labelBg
                  .transition()
                  .duration(200)
                  .attr('x', textBBox.x - 4)
                  .attr('y', textBBox.y - 2)
                  .attr('width', textBBox.width + 8)
                  .attr('height', textBBox.height + 4)
              } catch (_e) {
                const estimatedWidth = originalText.length * (d.isRoot ? 12 : 9) * 0.6
                const estimatedHeight = (d.isRoot ? 12 : 9) + 2
                labelBg
                  .transition()
                  .duration(200)
                  .attr('x', -estimatedWidth / 2 - 4)
                  .attr('y', -estimatedHeight / 2 - 2)
                  .attr('width', estimatedWidth + 8)
                  .attr('height', estimatedHeight + 4)
              }
            }, 10)
          }
        }
      })

    // Create hover labels with animated appearance
    const hoverLabelGroup = g.append('g')
    const hoverLabels = hoverLabelGroup
      .selectAll('g')
      .data(filteredNodes.filter((d) => !d.isRoot && d.dependencyLevel > 2))
      .join('g')
      .attr('class', 'hover-label-group')

    setHoverLabelsAttr(hoverLabels)

    // Hover handling for labels with simple animation
    createLabelHover(nodeHoverAreas, hoverLabels)

    // Setting drag behavior on hover areas
    const drag = createDrag(simRef)
    // @ts-ignore
    nodeHoverAreas.call(drag)

    // Build a workspace map for each node
    const nodeWorkspaceMap = new Map<string, string>()
    filteredNodes.forEach((node) => {
      nodeWorkspaceMap.set(node.id, node.workspaceId || 'default')
    })

    // Building a map of root nodes for clustering
    const rootMap = new Map<string, string>()
    const idToNode = new Map(filteredNodes.map((n) => [n.id, n] as [string, NodeDatum]))

    // Find root for each node
    filteredNodes.forEach((n) => {
      if (n.dependencyLevel === 0 || n.isRoot) {
        rootMap.set(n.id, n.id)
      }
    })

    // BFS to assign each node its root
    const queue = [...filteredNodes.filter((n) => n.isRoot || n.dependencyLevel === 0)]
    const visited = new Set(queue.map((n) => n.id))

    while (queue.length > 0) {
      const current = queue.shift() as NodeDatum
      const currentRootId = rootMap.get(current?.id) as string

      filteredLinks.forEach((link) => {
        const { sourceId, targetId } = getSourceAndTarget(link)

        if (sourceId === current?.id && !visited.has(targetId)) {
          rootMap.set(targetId, currentRootId)
          visited.add(targetId)
          const targetNode = idToNode.get(targetId)
          if (targetNode) queue.push(targetNode)
        }
      })
    }

    // Simulation setup
    const simulation = d3
      .forceSimulation<NodeDatum>(filteredNodes)
      .alpha(1)
      .velocityDecay(0.1)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(filteredLinks)
          .id((d: NodeDatum) => d.id)
          .distance(() => {
            return 200
          })
          .strength(1),
      )
      .force(
        'charge',
        d3.forceManyBody<NodeDatum>().strength((d: NodeDatum) => {
          if (d.isRoot) return -900 // Root nodes are weakly repelled
          if (d.dependencyLevel === 0) return -700
          if (d.dependencyLevel === 1) return -500
          return -100
        }),
      )
      .force(
        'collide',
        d3
          .forceCollide<NodeDatum>()
          .radius((d: NodeDatum) => getNodeRadius(d) + 3)
          .strength(0.9),
      )
      .force(
        'rootCenterX',
        d3
          .forceX<NodeDatum>((d) => {
            if (d.isRoot || d.dependencyLevel === 0) {
              const workspaceName = d.workspaceId || 'default'
              const pos = workspacePositions.get(workspaceName)
              return pos ? pos.x : width / 4
            }
            return d.x || 0
          })
          .strength((d) => (d.isRoot || d.dependencyLevel === 0 ? 0.8 : 0)),
      )
      .force(
        'rootCenterY',
        d3
          .forceY<NodeDatum>((d) => {
            if (d.isRoot || d.dependencyLevel === 0) {
              const workspaceName = d.workspaceId || 'default'
              const pos = workspacePositions.get(workspaceName)
              return pos ? pos.y : height / 4
            }
            return d.y || 0
          })
          .strength((d) => (d.isRoot ? 0.8 : 0)),
      )
      .force(
        'workspaceBounds',
        d3
          .forceX<NodeDatum>((d) => {
            const workspaceName = d.workspaceId || 'default'
            const pos = workspacePositions.get(workspaceName)
            return pos ? pos.x : width / 2
          })
          .strength((d) => (d.isRoot ? 0.2 : 0.02)),
      )
      .force(
        'workspaceBoundsY',
        d3
          .forceY<NodeDatum>((d) => {
            const workspaceName = d.workspaceId || 'default'
            const pos = workspacePositions.get(workspaceName)
            return pos ? pos.y : height / 2
          })
          .strength((d) => (d.isRoot ? 0.2 : 0.02)),
      )

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d: any) => (d.source as NodeDatum).x || 0)
        .attr('y1', (d: any) => (d.source as NodeDatum).y || 0)
        .attr('x2', (d: any) => (d.target as NodeDatum).x || 0)
        .attr('y2', (d: any) => (d.target as NodeDatum).y || 0)

      nodeHoverAreas.attr('cx', (d: NodeDatum) => d.x || 0).attr('cy', (d: NodeDatum) => d.y || 0)
      nodeSelection.attr('cx', (d: NodeDatum) => d.x || 0).attr('cy', (d: NodeDatum) => d.y || 0)

      permanentLabels.attr(
        'transform',
        (d: NodeDatum) => `translate(${d.x || 0}, ${(d.y || 0) + getNodeRadius(d) + 15})`,
      )

      hoverLabels.attr('transform', (d: NodeDatum) => `translate(${d.x || 0}, ${(d.y || 0) - getNodeRadius(d) - 20})`)

      updateWorkspaceAreas()
    })

    setTimeout(() => {
      updateLabelBackgrounds(permanentLabels)
      updateHoverLabelSizes(hoverLabels)
    }, 100)

    updateWorkspaceAreas()

    simRef.current = simulation

    return () => {
      if (simRef.current) {
        simRef.current.stop()
      }
    }
  }, [filteredNodes, filteredLinks, workspaces, size])

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="border-0 rounded-none" />
    </div>
  )
})
