/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <test> */

import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import type { AnalysisResult } from '@/types'
import DependencyGraph from '../components/DependencyGraph'

export default function Home() {
  const router = useRouter()
  const [projectPath, setProjectPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const analyzeProject = useCallback(
    async (pathToAnalyze?: string) => {
      const targetPath = pathToAnalyze || projectPath

      if (!targetPath.trim()) {
        setError('Please enter a project path')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/analyze?folder=${targetPath}`, {
          method: 'POST',
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to analyze project')
        }

        const data: AnalysisResult = await response.json()
        setResult(data)

        if (pathToAnalyze) {
          setProjectPath(pathToAnalyze)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    },
    [projectPath],
  )

  const resetAnalysis = useCallback(() => {
    setResult(null)
    setError(null)
    setProjectPath('')
    void router.push('/')
  }, [])

  useEffect(() => {
    if (router.isReady) {
      const { folder } = router.query

      if (folder && typeof folder === 'string') {
        const decodedPath = decodeURIComponent(folder)
        setProjectPath(decodedPath)
        void analyzeProject(decodedPath)
      }
    }
  }, [router.isReady, router.query])

  return (
    <div className="min-h-screen bg-black">
      {!result ? (
        <>
          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-2xl mx-auto">
              {/* Input Form */}
              <div className="bg-white/10 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-white/80 mb-4">Analyze Project</h2>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="projectPath" className="block text-sm font-medium text-white/20 mb-2">
                      Project Path
                    </label>
                    <input
                      type="text"
                      id="projectPath"
                      value={projectPath}
                      onChange={(e) => setProjectPath(e.target.value)}
                      placeholder="/path/to/your/project"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the full path to your Node.js project or monorepo
                    </p>
                  </div>

                  <button
                    onClick={() => analyzeProject()}
                    type="button"
                    disabled={loading || !projectPath.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Analyzing...
                      </>
                    ) : (
                      'Analyze Dependencies'
                    )}
                  </button>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Analysis Error</h3>
                      <div className="mt-2 text-sm text-red-700">{error}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </>
      ) : (
        <div className="fixed inset-0 bg-black flex flex-col">
          <div className="flex-shrink-0 bg-black border-b border-white/10 px-4 py-3 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={resetAnalysis}
                  className="px-3 py-2 bg-gray-600  rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  ← New
                </button>
                <div>
                  <h2 className="text-lg font-semibold whitespace-nowrap ">Dependency Graph</h2>
                  <p className="text-xs">
                    {result.packages.length} pkgs, {result.nodes.length} nodes, {result.links.length} deps
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 text-xs text-white/60">
                <span>Workspaces: {result.workspaces?.length || 0}</span>
                <span>Root: {result.nodes.filter((n) => n.isRoot).length}</span>
                <span>Dependencies: {result.nodes.filter((n) => !n.isRoot && n.isInstalled).length}</span>
                <span>Missing: {result.nodes.filter((n) => !n.isInstalled).length}</span>
                <span>Level 1: {result.nodes.filter((n) => n.dependencyLevel === 1).length}</span>
                <span>Level 2: {result.nodes.filter((n) => n.dependencyLevel === 2).length}</span>
                <span>Level 3: {result.nodes.filter((n) => n.dependencyLevel === 3).length}</span>
                <span className="text-gray-500">
                  Project: <span className="font-mono">{projectPath}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <DependencyGraph nodes={result.nodes} links={result.links} workspaces={result.workspaces} />
          </div>
        </div>
      )}
    </div>
  )
}
