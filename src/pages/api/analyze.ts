import * as fs from 'node:fs'
import type { NextApiRequest, NextApiResponse } from 'next'
import { GraphBuilder } from '@/libs/graph-builder'

export const config = {
  api: {
    bodyParser: true,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.query as { folder: string }
  try {
    const projectPath = Array.isArray(body.folder) ? body.folder[0] : body.folder

    if (!projectPath) {
      return res.status(400).json({ error: 'Project path is required' })
    }

    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({ error: 'Project path does not exist' })
    }

    const analyzer = new GraphBuilder(projectPath)
    const graph = await analyzer.buildGraph()

    res.status(200).json(graph)
  } catch (error) {
    console.error('Analysis error:', error)
    res.status(500).json({
      error: 'Failed to analyze project',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
