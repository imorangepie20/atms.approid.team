import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const secrets = resolve(root, 'infra/secrets/dev.env')
const api = resolve(root, 'server/.env')
mkdirSync(resolve(root, 'infra/secrets'), { recursive: true })
if (!existsSync(secrets)) writeFileSync(secrets, `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' })
const password = readFileSync(secrets, 'utf8').match(/^POSTGRES_PASSWORD=([a-f0-9]{64})$/m)?.[1]
if (!password) throw new Error('Invalid local DB secret. Refusing to overwrite it.')
if (!existsSync(api)) {
  writeFileSync(api, `HOST=127.0.0.1\nPORT=4300\nDATABASE_URL=postgresql://atms:${password}@127.0.0.1:55432/atms?schema=public\n`, { mode: 0o600, flag: 'wx' })
}
console.log('Local environment files are ready. Existing files were preserved; secrets are not printed.')
