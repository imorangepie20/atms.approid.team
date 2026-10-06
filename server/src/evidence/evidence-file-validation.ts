import { BadRequestException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import busboy from 'busboy'
import type { Request } from 'express'
import { EVIDENCE_CONFIG as limits } from '../config/app.config'
import { ApiValidationException } from '../common/api-validation'
import { evidenceMetadataSchema, type EvidenceMetadata } from './evidence.schemas'

export interface EvidenceFile { name: string; mediaType: string; bytes: Buffer; sha256: string }
// [F03 E3] 기본 구조 검증이다. 완전한 문서 파서/악성 파일 검사는 별도 scanner가 맡는다.
export function validateEvidenceFile(name: string, mediaType: string, bytes: Buffer): EvidenceFile {
  if (bytes.length > limits.fileBytes) throw new PayloadTooLargeException()
  if (!bytes.length || [...name].length < 1 || [...name].length > limits.fileNameMax || /[\x00-\x1f\x7f/\\]/.test(name)
      || Buffer.from(name).toString('utf8') !== name) throw new UnprocessableEntityException()
  const extension = name.split('.').at(-1)?.toLowerCase()
  let valid = false
  if (mediaType === 'application/pdf' && extension === 'pdf') {
    valid = /^%PDF-1\.[0-9]|^%PDF-2\.0/.test(bytes.subarray(0, 9).toString('ascii')) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))
  } else if (mediaType === 'image/jpeg' && ['jpg', 'jpeg'].includes(extension ?? '')) {
    valid = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
  } else if (mediaType === 'image/png' && extension === 'png') {
    valid = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    let offset = 8, chunks = 0, data = false, ended = false
    while (valid && offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), kind = bytes.subarray(offset + 4, offset + 8).toString('ascii')
      if (size > bytes.length - offset - 12 || (!chunks && (kind !== 'IHDR' || size !== 13))) { valid = false; break }
      if (!chunks && (!bytes.readUInt32BE(offset + 8) || !bytes.readUInt32BE(offset + 12))) { valid = false; break }
      // CRC로 손상된 길이/내용도 거부한다. 이미지 압축을 풀어 메모리를 늘리지 않는다.
      let crc = 0xffffffff
      for (const byte of bytes.subarray(offset + 4, offset + 8 + size)) {
        crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
      }
      if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(offset + 8 + size)) { valid = false; break }
      data ||= kind === 'IDAT'; offset += size + 12; chunks++
      if (kind === 'IEND') { ended = size === 0 && offset === bytes.length; break }
    }
    valid &&= ended && data
  }
  if (!valid) throw new UnprocessableEntityException()
  return { name, mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

// Busboy는 multipart 스트림을 필드/파일로 분리하는 파서다. guard 뒤에 호출하며 수신 중 한도를 검사한다.
export function readEvidenceMultipart(req: Request): Promise<{ metadata: EvidenceMetadata; file: EvidenceFile }> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>
    try { parser = busboy({ headers: req.headers, preservePath: true, defParamCharset: 'utf8',
      // [F03 입력 수리] Busboy는 한도에 도달한 항목에서도 partsLimit을 발생시킨다.
      // 세 번째 항목에서 거부하게 설정하고 fields/files 각각 1개로 업무 한도(총 2개)를 유지한다.
      limits: { fields: 1, files: 1, parts: 3, fileSize: limits.fileBytes + 1, fieldSize: limits.metadataBytes + 1, fieldNameSize: 32 } }) }
    catch { reject(new BadRequestException()); return }
    let total = 0, metadataText: string | undefined, file: EvidenceFile | undefined, failure: unknown
    const fail = (error: unknown) => { failure ??= error }
    const count = (chunk: Buffer) => {
      total += chunk.length
      if (total > limits.bodyBytes) { fail(new PayloadTooLargeException()); req.unpipe(parser); parser.destroy(); reject(failure); req.resume() }
    }
    req.on('data', count)
    req.once('aborted', () => { parser.destroy(); reject(new BadRequestException()) })
    req.once('error', () => { parser.destroy(); reject(new BadRequestException()) })
    parser.on('field', (name, value, info) => {
      if (name !== 'metadata' || metadataText !== undefined || info.nameTruncated) fail(new BadRequestException())
      if (info.valueTruncated || Buffer.byteLength(value) > limits.metadataBytes) fail(new PayloadTooLargeException())
      metadataText = value
    })
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || file) fail(new BadRequestException())
      const chunks: Buffer[] = []
      stream.on('limit', () => fail(new PayloadTooLargeException()))
      stream.on('error', () => fail(new BadRequestException()))
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => { if (!failure) { try { file = validateEvidenceFile(info.filename, info.mimeType, Buffer.concat(chunks)) } catch (error) { fail(error) } } })
    })
    for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit'] as const) parser.on(event, () => fail(new BadRequestException()))
    parser.on('error', () => { req.removeListener('data', count); reject(failure ?? new BadRequestException()) })
    parser.on('close', () => {
      req.removeListener('data', count)
      if (failure) { reject(failure); return }
      if (metadataText === undefined || !file) { reject(new BadRequestException()); return }
      try {
        const metadata = evidenceMetadataSchema.safeParse(JSON.parse(metadataText))
        if (!metadata.success) throw new ApiValidationException([{ field: 'metadata', message: '입력 형식과 범위를 확인해 주세요.' }])
        resolve({ metadata: metadata.data, file })
      } catch (error) { reject(error instanceof ApiValidationException ? error : new BadRequestException()) }
    })
    req.pipe(parser)
  })
}
