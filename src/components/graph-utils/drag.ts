import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { NodeDatum } from '@/types'

export function createDrag(simRef: RefObject<d3.Simulation<NodeDatum, d3.SimulationLinkDatum<NodeDatum>> | null>) {
  return d3
    .drag<SVGCircleElement, NodeDatum>()
    .on('start', (_event, d) => {
      // Restart the simulation only if it was stopped
      if (simRef.current && simRef.current.alpha() < 0.1) {
        simRef.current.alpha(0.1).restart()
      }
      d.fx = d.x
      d.fy = d.y
    })
    .on('drag', (event, d) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on('end', (event, d) => {
      if (!event.active && simRef.current) simRef.current.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
}
