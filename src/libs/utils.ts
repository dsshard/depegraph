import type { LinkDatum, NodeDatum } from '@/types'

export function getSourceAndTarget(link: LinkDatum) {
  const sourceId = typeof link.source === 'string' ? link.source : (link.source as NodeDatum).id
  const targetId = typeof link.target === 'string' ? link.target : (link.target as NodeDatum).id

  return { sourceId, targetId }
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}
