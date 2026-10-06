import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { EVIDENCE_CONFIG as limits, readEvidenceConfig } from '../config/app.config'

export interface UploadAttempt { id: string; tmp: string; original: string }
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
@Injectable()
export class EvidenceStorageService {
  // [F03 E5/E6] R2 SDK는 서버가 정한 키만 쓴다. 자격 증명은 환경에서 읽고 응답/로그로 내보내지 않는다.
  configured() { return readEvidenceConfig().storage !== null }
  private key(key: string) {
    if (!new RegExp(`^(tmp|originals)/${uuid}/${uuid}/${uuid}$`).test(key)) throw new ServiceUnavailableException()
  }
  private async io<T>(action: (client: S3Client, bucket: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const config = readEvidenceConfig().storage
    if (!config) throw new ServiceUnavailableException()
    const client = new S3Client({ region: 'auto', endpoint: config.endpoint, maxAttempts: 1,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED' })
    const controller = new AbortController(); let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ServiceUnavailableException()) }, limits.ioMs) })
    try { return await Promise.race([action(client, config.bucket, controller.signal), deadline]) }
    catch { throw new ServiceUnavailableException() }
    finally { if (timer) clearTimeout(timer); client.destroy() }
  }
  async put(key: string, bytes: Buffer, mediaType: string, sha256: string) {
    this.key(key)
    await this.io((client, Bucket, abortSignal) => client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes,
      ContentType: mediaType, Metadata: { sha256 }, IfNoneMatch: '*' }), { abortSignal }))
  }
  async copy(source: string, target: string) {
    this.key(source); this.key(target)
    // 각 시도 UUID의 원본 후보만 쓴다. 완료 원본 키를 재사용/교체하지 않는다.
    await this.io((client, Bucket, abortSignal) => client.send(new CopyObjectCommand({ Bucket, Key: target,
      CopySource: `${Bucket}/${source.split('/').map(encodeURIComponent).join('/')}` }), { abortSignal }))
  }
  async read(key: string, byteSize: number, sha256: string): Promise<Buffer> {
    this.key(key)
    return this.io(async (client, Bucket, abortSignal) => {
      const response = await client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal })
      const body = response.Body as (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined
      if (!response.Body || byteSize < 1 || byteSize > limits.fileBytes || response.ContentLength !== byteSize) {
        body?.destroy?.(); throw new Error('Invalid stored content')
      }
      // transformToByteArray는 전체 객체를 무제한 읽을 수 있으므로 스트림의 실제 길이도 제한한다.
      const chunks: Buffer[] = []; let size = 0
      try {
        for await (const chunk of body!) {
          const value = Buffer.from(chunk); size += value.length
          if (size > byteSize) throw new Error('Stored content too large')
          chunks.push(value)
        }
      } finally { body?.destroy?.() }
      const bytes = Buffer.concat(chunks)
      if (size !== byteSize || createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Stored content mismatch')
      return bytes
    })
  }
  async verify(key: string, byteSize: number, sha256: string) {
    this.key(key)
    await this.io(async (client, Bucket, abortSignal) => {
      const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }), { abortSignal })
      if (head.ContentLength !== byteSize || head.Metadata?.sha256 !== sha256) throw new Error('Stored metadata mismatch')
    })
    await this.read(key, byteSize, sha256)
  }
  async remove(key: string) {
    this.key(key)
    // 호출자는 DB 예약 키/완료 참조를 검사한다. 광범위 prefix 삭제나 사용자 입력 키 삭제는 없다.
    await this.io((client, Bucket, abortSignal) => client.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal }))
  }
}
