import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
if (!existsSync(resolve(root, 'server/dist/main.js')) || !existsSync(resolve(root, 'server/.env'))) {
  throw new Error('Run env:init, db:up, api:build and db:deploy before dev:all. See docs/ENVIRONMENT_SETUP.md.')
}
const commands = [
  { cwd: root, args: ['node_modules/vite/bin/vite.js'] },
  { cwd: resolve(root, 'server'), args: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--watch'] },
  { cwd: resolve(root, 'server'), args: ['--env-file=.env', '--watch', 'dist/main.js'] },
]
const children = commands.map(({ cwd, args }) => spawn(process.execPath, args, { cwd, stdio: 'inherit' }))
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
for (const child of children) child.on('exit', code => stop(code ?? 1))
