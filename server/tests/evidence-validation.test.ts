import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { Request } from 'express'
const require = createRequire(import.meta.url)
const { evidenceMetadataSchema, evidenceListSchema } = require('../dist/evidence/evidence.schemas.js') as typeof import('../src/evidence/evidence.schemas')
const { validateEvidenceFile, readEvidenceMultipart } = require('../dist/evidence/evidence-file-validation.js') as typeof import('../src/evidence/evidence-file-validation')
const { EVIDENCE_CONFIG: limits, readEvidenceConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const metadata = () => ({ creationRequestId: randomUUID(), title: ' Receipt ', kind: 'RECEIPT' })
const pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n')
// [F03 시험 준비 수리] Node zlib.crc32로 확인한 IDAT CRC가 유효한 1픽셀 픽스처다.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
function multipart(parts: { name: string; value: Buffer | string; file?: string; mime?: string }[]) {
  const boundary = 'evidence-verification-boundary'
  const bytes = Buffer.concat([...parts.flatMap(part => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.file ? `; filename="${part.file}"` : ''}\r\n${part.file ? `Content-Type: ${part.mime ?? 'application/pdf'}\r\n` : ''}\r\n`), Buffer.from(part.value), Buffer.from('\r\n')]), Buffer.from(`--${boundary}--\r\n`)])
  const req = Readable.from([bytes]) as unknown as Request
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` }; return req
}
describe('F03 evidence validation', () => {
  it('normalizes approved metadata and measures Unicode code points', () => {
    const value = evidenceMetadataSchema.parse({ ...metadata(), title: '😀'.repeat(100), occurredOn: '2024-02-29' })
    expect(value.title).toHaveLength(200); expect(value.counterpartyId).toBeNull()
    expect(evidenceMetadataSchema.parse(metadata()).title).toBe('Receipt')
  })
  it.each([{ title: '' }, { title: ' ' }, { title: 'x'.repeat(101) }, { title: '\0' }, { title: '\ud800' },
    { kind: 'ZIP' }, { occurredOn: '2023-02-29' }, { occurredOn: '2026-04-31' }, { occurredOn: '0000-01-01' },
    { occurredOn: '2026-1-01' }, { creationRequestId: 'id' }, { companyId: randomUUID() }, { ownerId: randomUUID() }, { key: 'originals/x' }])('rejects invalid metadata %#', invalid => {
    expect(evidenceMetadataSchema.safeParse({ ...metadata(), ...invalid }).success).toBe(false)
  })
  it.each([{ limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: 20 }, { q: '' }, { cursor: 'other' }, { active: 'all' }, { counterpartyId: 'id' }])('rejects invalid list input %#', input => {
    expect(evidenceListSchema.safeParse(input).success).toBe(false)
  })
  it('accepts approved list limits and bounded PDF/JPEG/PNG structure', () => {
    expect(evidenceListSchema.parse({})).toEqual({ limit: 20 })
    expect(evidenceListSchema.parse({ limit: '100' }).limit).toBe(100)
    expect(validateEvidenceFile('receipt.pdf', 'application/pdf', pdf).sha256).toHaveLength(64)
    expect(validateEvidenceFile('receipt.jpeg', 'image/jpeg', Buffer.from([255, 216, 255, 224, 255, 217])).bytes.length).toBe(6)
    expect(validateEvidenceFile('receipt.png', 'image/png', png).mediaType).toBe('image/png')
  })
  it.each([['receipt.exe', 'application/pdf', pdf], ['receipt.pdf', 'image/png', pdf], ['../receipt.pdf', 'application/pdf', pdf],
    ['receipt.pdf\r\n', 'application/pdf', pdf], ['receipt.pdf', 'application/pdf', Buffer.alloc(0)],
    ['receipt.pdf', 'application/pdf', Buffer.from('%PDF-1.7 no EOF')], ['receipt.svg', 'image/svg+xml', Buffer.from('<svg/>')],
    ['receipt.png', 'image/png', Buffer.concat([png, Buffer.from('trailing')])], ['receipt.jpg', 'image/jpeg', Buffer.from([255, 216, 255])]])('rejects spoofed/broken file %#', (name, mime, bytes) => {
    expect(() => validateEvidenceFile(name as string, mime as string, bytes as Buffer)).toThrow()
  })
  it('accepts exactly10MiB and rejects one extra byte', () => {
    const bytes = Buffer.alloc(limits.fileBytes, 32); pdf.copy(bytes); bytes.write('%%EOF', bytes.length - 5)
    expect(validateEvidenceFile('receipt.pdf', 'application/pdf', bytes).bytes.length).toBe(limits.fileBytes)
    expect(() => validateEvidenceFile('receipt.pdf', 'application/pdf', Buffer.concat([bytes, Buffer.from('x')]))).toThrow()
  })
  it('parses one metadata and original without trusting Content-Length', async () => {
    const result = await readEvidenceMultipart(multipart([{ name: 'metadata', value: JSON.stringify(metadata()) }, { name: 'file', file: 'receipt.pdf', value: pdf }]))
    expect(result.metadata.title).toBe('Receipt'); expect(result.file.bytes).toEqual(pdf)
  })
  // [F03 입력 회귀] 순서와 정확한 상한에서도 정상 두 항목은 처리하고 세 번째 항목은 거부한다.
  it('accepts file-first multipart at exactly10MiB and metadata at exactly8KiB', async () => {
    const bytes = Buffer.alloc(limits.fileBytes, 32); pdf.copy(bytes); bytes.write('%%EOF', bytes.length - 5)
    const json = JSON.stringify(metadata()), value = json + ' '.repeat(limits.metadataBytes - Buffer.byteLength(json))
    const result = await readEvidenceMultipart(multipart([{ name: 'file', file: 'receipt.pdf', value: bytes }, { name: 'metadata', value }]))
    expect(result.file.bytes.length).toBe(limits.fileBytes); expect(result.metadata.title).toBe('Receipt')
    await expect(readEvidenceMultipart(multipart([{ name: 'file', file: 'receipt.pdf', value: pdf }, { name: 'metadata', value: json }, { name: 'metadata', value: json }]))).rejects.toThrow()
  })
  it('rejects a PNG whose IDAT content no longer matches its CRC', () => {
    const corrupted = Buffer.from(png); corrupted[41] ^= 1
    expect(() => validateEvidenceFile('receipt.png', 'image/png', corrupted)).toThrow()
  })
  it.each(['duplicate-metadata', 'duplicate-file', 'unknown-field', 'missing-file', 'invalid-json', 'path-name', 'large-file', 'large-metadata'])('rejects multipart %s', async scenario => {
    let parts = [{ name: 'metadata', value: JSON.stringify(metadata()) }, { name: 'file', file: 'receipt.pdf', value: pdf }]
    if (scenario === 'duplicate-metadata') parts.push(parts[0])
    if (scenario === 'duplicate-file') parts.push(parts[1])
    if (scenario === 'unknown-field') parts[0].name = 'companyId'
    if (scenario === 'missing-file') parts = [parts[0]]
    if (scenario === 'invalid-json') parts[0].value = '{'
    if (scenario === 'path-name') parts[1].file = '../receipt.pdf'
    if (scenario === 'large-file') parts[1].value = Buffer.alloc(limits.fileBytes + 1)
    if (scenario === 'large-metadata') parts[0].value = 'x'.repeat(limits.metadataBytes + 1)
    await expect(readEvidenceMultipart(multipart(parts))).rejects.toThrow()
  })
  it('does not treat absent/partial/unsafe R2 and scanner configuration as usable', () => {
    expect(readEvidenceConfig({}).storage).toBeNull()
    expect(readEvidenceConfig({ R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'bucket' }).storage).toBeNull()
    expect(readEvidenceConfig({ CLAMAV_HOST: 'external.example' }).scanner).toBeNull()
    expect(readEvidenceConfig({ NODE_ENV: 'production', CLAMAV_HOST: '127.0.0.1' }).scanner).toBeNull()
  })
})
