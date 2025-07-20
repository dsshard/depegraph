#!/usr/bin/env node

const { Command } = require('commander')
const path = require('node:path')
const { spawn } = require('node:child_process')

const program = new Command()

program
  .name('deepgraph')
  .description('Analyze dependencies')
  .argument('[folder]', 'Path', process.cwd())
  .option('-p, --port <port>', 'Port', '8831')
  .action(async (folder, options) => {
    const folderPath = path.resolve(folder)
    const port = options.port

    const server = spawn('npx', ['next', 'start', '--port', '8831'], {
      cwd: path.join(__dirname, '../'),
      stdio: 'inherit',
      detached: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_ENABLE_LOGGING: '0',
        NEXT_TELEMETRY_DISABLED: '1',
        CI: '1',
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 3000))

    try {
      const url = `http://localhost:${port}?folder=${encodeURIComponent(folderPath)}`
      console.log(`Open browser: ${url}`)

      const { default: open } = await import('open')
      await open(url)
    } catch (error) {
      console.log(error)
    }

    process.on('SIGINT', () => {
      server.kill()
      process.exit(0)
    })
  })

program.parse()
