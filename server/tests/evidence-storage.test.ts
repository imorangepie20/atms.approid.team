import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { EvidenceScannerService } = require('../dist/evidence/evidence-scanner.service.js') as typeof import('../src/evidence/evidence-scanner.service')
const { EvidenceStorageService } = require('../dist/evidence/evidence-storage.service.js') as typeof import('../src/evidence/evidence-storage.service')
const { EVIDENCE_CONFIG: limits } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const server = fileURLToPath(new URL('../', import.meta.url)), proof = resolve(server, '../.artifacts/implementation-f03-evidence')
loadEnv({ path: resolve(server, '.env'), quiet: true })
const configured = new EvidenceStorageService().configured(), storage = new EvidenceStorageService(), scanner = new EvidenceScannerService()
const bytes = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n'), sha256 = createHash('sha256').update(bytes).digest('hex')
const report: Record<string, unknown> = { realR2Configured: configured, realR2Verified: false, actualClamavVerified: false }
const cleanup: string[] = []
afterAll(async () => {
  for (const key of cleanup) await storage.remove(key)
  report.ownedR2FixturesRemoved = configured && cleanup.length > 0
  mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'storage-evidence.json'), JSON.stringify(report, null, 2))
})
describe('F03 scanner and real storage', () => {
  it('V3 scans clean content and rejects official EICAR test bytes using actual clamd', async () => {
    await scanner.scan(bytes)
    const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
    await expect(scanner.scan(eicar)).rejects.toMatchObject({ status: 422 })
    report.actualClamavVerified = true
  }, 90000)
  it.each(['error', 'old-signatures', 'unexpected', 'size-limit', 'timeout'])('V3 fails closed on %s protocol', async scenario => {
    const sockets = new Set<import('node:net').Socket>(), oldPort = process.env.CLAMAV_PORT, oldHost = process.env.CLAMAV_HOST
    const daemon = createServer(socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket))
      let data = Buffer.alloc(0), replied = false
      socket.on('data', chunk => {
        // [F08-16 IDE 수리] 이 socket은 setEncoding을 호출하지 않아 data 이벤트가 Buffer 바이트를 전달한다.
        data = Buffer.concat([data, chunk as Buffer]); if (replied) return
        const command = data.subarray(0, data.indexOf(0)).toString()
        if (command === 'zVERSION') {
          replied = true
          if (scenario === 'timeout') return
          const updated = new Date(Date.now() - (scenario === 'old-signatures' ? limits.signatureMaxAgeMs + 1000 : 0)).toUTCString().replace(' GMT', '')
          socket.write(`ClamAV 1.4.6/1/${updated}\0`)
        } else if (command === 'zINSTREAM' && data.length >= 14 + bytes.length) {
          replied = true; socket.write(scenario === 'error' ? 'stream: private-path ERROR\0' : scenario === 'size-limit' ? 'INSTREAM size limit exceeded. ERROR\0' : 'unrecognized reply\0')
        }
      })
    })
    await new Promise<void>(resolve => daemon.listen(0, '127.0.0.1', resolve))
    process.env.CLAMAV_HOST = '127.0.0.1'; process.env.CLAMAV_PORT = String((daemon.address() as import('node:net').AddressInfo).port)
    try { await expect(scanner.scan(bytes)).rejects.toMatchObject({ status: 503 }) }
    finally {
      for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => daemon.close(() => resolve()))
      if (oldPort === undefined) delete process.env.CLAMAV_PORT; else process.env.CLAMAV_PORT = oldPort
      if (oldHost === undefined) delete process.env.CLAMAV_HOST; else process.env.CLAMAV_HOST = oldHost
    }
  }, 45000)
  it('V6 blocks unknown keys before issuing storage I/O', async () => {
    await expect(storage.read('../../private', 1, sha256)).rejects.toMatchObject({ status: 503 })
    await expect(storage.remove('originals/foreign/path')).rejects.toMatchObject({ status: 503 })
  })
  it.skipIf(!configured)('V7 verifies actual private R2 Put Head Copy Get integrity and owned temporary removal', async () => {
    const company = randomUUID(), upload = randomUUID(), attempt = randomUUID()
    const tmp = `tmp/${company}/${upload}/${attempt}`, original = `originals/${company}/${upload}/${attempt}`
    // 이 시험의 난수 namespace만 제거한다. 완료 업무 원본의 삭제 경로가 아니다.
    cleanup.push(tmp, original)
    await scanner.scan(bytes); await storage.put(tmp, bytes, 'application/pdf', sha256); await storage.copy(tmp, original)
    await storage.verify(original, bytes.length, sha256); expect(await storage.read(original, bytes.length, sha256)).toEqual(bytes)
    await expect(storage.read(original, bytes.length, 'a'.repeat(64))).rejects.toMatchObject({ status: 503 })
    await expect(storage.read(original, bytes.length - 1, sha256)).rejects.toMatchObject({ status: 503 })
    await storage.remove(tmp); await expect(storage.read(tmp, bytes.length, sha256)).rejects.toMatchObject({ status: 503 })
    report.realR2Verified = true
  }, 180000)
})
