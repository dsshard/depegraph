import * as d3 from 'd3'

export function createZoom(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  return d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 5])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })
}
