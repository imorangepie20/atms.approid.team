import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { connect } from 'node:net'
import { EVIDENCE_CONFIG as limits, readEvidenceConfig } from '../config/app.config'

@Injectable()
export class EvidenceScannerService {
  // [F03 E3] 고정 내부/루프백 clamd만 접속한다. 원문 응답/악성 서명은 오류/로그에 복사하지 않는다.
  private command(command: string, bytes?: Buffer): Promise<string> {
    const config = readEvidenceConfig().scanner
    if (!config) return Promise.reject(new ServiceUnavailableException())
    return new Promise((resolve, reject) => {
      const socket = connect(config), chunks: Buffer[] = []; let size = 0, settled = false
      const timer = setTimeout(() => finish(), limits.scanMs)
      const finish = (value?: string) => {
        if (settled) return; settled = true; clearTimeout(timer); socket.destroy()
        if (value === undefined) reject(new ServiceUnavailableException()); else resolve(value)
      }
      socket.once('error', () => finish()); socket.once('end', () => finish())
      socket.once('connect', () => {
        socket.write(Buffer.from(`z${command}\0`))
        if (bytes) {
          const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length)
          socket.write(header); socket.write(bytes); socket.write(Buffer.alloc(4))
        }
      })
      socket.on('data', (chunk: Buffer) => {
        size += chunk.length; if (size > 4096) { finish(); return }
        chunks.push(chunk); const response = Buffer.concat(chunks), end = response.indexOf(0)
        if (end !== -1) finish(response.subarray(0, end).toString('utf8'))
      })
    })
  }
  async ready(): Promise<void> {
    const response = await this.command('VERSION')
    const parts = response.split('/'), updated = Date.parse(parts.slice(2).join('/') + ' UTC'), age = Date.now() - updated
    // VERSION의 엔진/서명 시각이 유효하지 않거나24시간 지난 DB이면 완료를 허용하지 않는다.
    if (!/^ClamAV [0-9]+\.[0-9]+\.[0-9]+$/.test(parts[0]) || !/^\d+$/.test(parts[1] ?? '')
        || !Number.isFinite(age) || age < -limits.ioMs || age > limits.signatureMaxAgeMs) throw new ServiceUnavailableException()
  }
  async scan(bytes: Buffer): Promise<void> {
    if (!bytes.length || bytes.length > limits.fileBytes) throw new UnprocessableEntityException()
    await this.ready()
    const response = await this.command('INSTREAM', bytes)
    if (response === 'stream: OK') return
    if (/^stream: .+ FOUND$/.test(response)) throw new UnprocessableEntityException()
    throw new ServiceUnavailableException()
  }
}
