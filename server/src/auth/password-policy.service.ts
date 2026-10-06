import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import * as argon2 from 'argon2'
import { AUTH_POLICY, readAuthConfig } from '../config/app.config'

@Injectable()
export class PasswordPolicyService {
  // [F01 추가] 조회 대상은 코드에 고정한 HTTPS 주소다. 사용자 입력으로 URL/프록시를 선택하지 않는다.
  // 테스트는 fetch를 교체해 실제 응답 파서·크기/시간 제한을 검증하며 운영 우회 환경 변수는 없다.
  async fetchRange(prefix: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AUTH_POLICY.passwordLookupMs)
    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal, redirect: 'error', headers: { 'Add-Padding': 'true', 'User-Agent': 'ATMS-password-screening' },
      })
      if (response.status !== 200 || !response.body) throw new Error('Password lookup unavailable')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > AUTH_POLICY.passwordLookupBytes) throw new Error('Password lookup oversized')
          chunks.push(part.value)
        }
      } finally { await reader.cancel().catch(() => undefined) }
      return Buffer.concat(chunks).toString('utf8')
    } catch { throw new ServiceUnavailableException() }
    finally { clearTimeout(timer) }
  }
  async hash(password: string, email?: string): Promise<string> {
    const length = Array.from(password).length
    if (length < AUTH_POLICY.passwordMin || length > AUTH_POLICY.passwordMax || Buffer.from(password, 'utf8').toString('utf8') !== password) {
      throw new BadRequestException()
    }
    // 비교용 복사본만 대소문자를 통일한다. 실제 조회/저장 입력의 Unicode와 앞뒤 공백은 그대로다.
    const comparison = password.toLowerCase()
    const domain = new URL(readAuthConfig().origin).hostname
    if (['atms', domain, email?.toLowerCase()].includes(comparison)) throw new BadRequestException()
    const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const body = await this.fetchRange(hash.slice(0, 5))
    const lines = body.trim().split(/\r?\n/)
    let exposed = false
    // [F01 실패 흐름] 잘못된/빈 응답은 안전하다고 판단하지 않는다. 패딩의 count=0만 무시한다.
    if (!body.trim()) throw new ServiceUnavailableException()
    for (const line of lines) {
      const match = /^([0-9A-F]{35}):(\d+)$/.exec(line)
      if (!match || !Number.isSafeInteger(Number(match[2]))) throw new ServiceUnavailableException()
      if (match[1] === hash.slice(5) && Number(match[2]) > 0) exposed = true
    }
    if (exposed) throw new BadRequestException()
    // SHA-1은 공개 자료 조회에만 사용한다. 사용자 저장값은 사용자별 salt를 포함한 Argon2id다.
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB,
      timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  }
}
