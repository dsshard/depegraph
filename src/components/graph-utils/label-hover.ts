import * as d3 from 'd3'
import { truncateText } from '@/components/graph-utils/utils'
import type { NodeDatum } from '@/types'

type LocalNode = d3.Selection<d3.BaseType | SVGGElement, NodeDatum, SVGGElement, unknown>

export function createLabelHover(nodeHoverAreas: LocalNode, hoverLabels: LocalNode) {
  // Hover handling for labels with simple animation
  nodeHoverAreas
    .on('mouseenter.label', (_event, d) => {
      if (!d.isRoot && d.dependencyLevel > 2) {
        const targetGroup = hoverLabels.filter((labelD) => labelD.id === d.id)

        const node = targetGroup.node()
        if (node && 'parentNode' in node) {
          node.parentNode?.appendChild(targetGroup.node() as Document)
        }

        targetGroup.select('.hover-label-bg').transition().duration(200).ease(d3.easeQuadOut).style('opacity', 1)
        targetGroup.select('.hover-label-text').transition().duration(200).ease(d3.easeQuadOut).style('opacity', 1)
      }
    })
    .on('mouseleave.label', (_event, d) => {
      if (!d.isRoot && d.dependencyLevel > 2) {
        const targetGroup = hoverLabels.filter((labelD) => labelD.id === d.id)

        targetGroup.select('.hover-label-bg').transition().duration(150).ease(d3.easeQuadIn).style('opacity', 0)
        targetGroup.select('.hover-label-text').transition().duration(150).ease(d3.easeQuadIn).style('opacity', 0)
      }
    })
}

// Function for updating the sizes of hover labels
export const updateHoverLabelSizes = (hoverLabels: LocalNode) => {
  hoverLabels.each(function (d) {
    const textElement = d3.select(this).select('.hover-label-text').node() as SVGTextElement
    if (textElement) {
      setTimeout(() => {
        try {
          const textBBox = textElement.getBBox()
          d3.select(this)
            .select('.hover-label-bg')
            .attr('x', textBBox.x - 4)
            .attr('y', textBBox.y - 2)
            .attr('width', textBBox.width + 8)
            .attr('height', textBBox.height + 4)
        } catch (_e) {
          const estimatedWidth = d.name.length * Math.max(8, 11 - d.dependencyLevel) * 0.6
          const estimatedHeight = Math.max(8, 11 - d.dependencyLevel) + 2
          d3.select(this)
            .select('.hover-label-bg')
            .attr('x', -estimatedWidth / 2 - 4)
            .attr('y', -estimatedHeight / 2 - 2)
            .attr('width', estimatedWidth + 8)
            .attr('height', estimatedHeight + 4)
        }
      }, 0)
    }
  })
}

// Function to update background sizes
export const updateLabelBackgrounds = (permanentLabels: LocalNode) => {
  permanentLabels.each(function (d) {
    const textElement = d3.select(this).select('.label-text').node() as SVGTextElement
    if (textElement) {
      setTimeout(() => {
        try {
          const textBBox = textElement.getBBox()
          d3.select(this)
            .select('.label-bg')
            .attr('x', textBBox.x - 4)
            .attr('y', textBBox.y - 2)
            .attr('width', textBBox.width + 8)
            .attr('height', textBBox.height + 4)
        } catch (_e) {
          const textLength = d.name.length
          const fontSize = d.isRoot ? 12 : 9
          const estimatedWidth = textLength * fontSize * 0.6
          const estimatedHeight = fontSize + 2

          d3.select(this)
            .select('.label-bg')
            .attr('x', -estimatedWidth / 2 - 4)
            .attr('y', -estimatedHeight / 2 - 2)
            .attr('width', estimatedWidth + 8)
            .attr('height', estimatedHeight + 4)
        }
      }, 0)
    }
  })
}

export function setHoverLabelsAttr(hoverLabels: LocalNode) {
  // Background for hover labels
  hoverLabels
    .append('rect')
    .attr('class', 'hover-label-bg')
    .attr('fill', 'rgba(0, 0, 0, 0.9)')
    .attr('rx', 3)
    .attr('ry', 3)
    .style('opacity', 0)
    .attr('pointer-events', 'none')

  hoverLabels
    .append('text')
    .attr('class', 'hover-label-text')
    .text((d) => d.name)
    .attr('fill', '#fff')
    .attr('font-size', (d) => Math.max(8, 11 - d.dependencyLevel))
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .style('opacity', 0)
}

export function setPermanentLabelsAttr(permanentLabels: LocalNode) {
  // Add text first
  permanentLabels
    .append('text')
    .attr('class', 'label-text')
    .style('z-index', 0)
    .text((d) => truncateText(d.name, d.isRoot ? 20 : 12))
    .attr('fill', '#fff')
    .attr('font-size', (d) => (d.isRoot ? 12 : 9))
    .attr('font-weight', (d) => (d.isRoot ? 'bold' : 'normal'))
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')

  // Adding background to labels
  permanentLabels
    .insert('rect', '.label-text')
    .attr('class', 'label-bg')
    .attr('pointer-events', 'none')
    .attr('fill', 'rgba(0, 0, 0, 0.8)')
    .attr('rx', 4)
    .attr('ry', 4)
}
