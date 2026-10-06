import { Injectable } from '@nestjs/common'
import nodemailer from 'nodemailer'
import { AUTH_POLICY, readMailConfig } from '../config/app.config'
import type { MailMessage } from './mail.templates'

@Injectable()
export class MailService {
  readonly config = readMailConfig()
  private readonly transport = nodemailer.createTransport({
    host: this.config.host, port: this.config.port, secure: this.config.secure, requireTLS: this.config.requireTLS,
    ...(this.config.user ? { auth: { user: this.config.user, pass: this.config.password! } } : {}),
    tls: { rejectUnauthorized: true }, connectionTimeout: AUTH_POLICY.mailTimeoutMs,
    greetingTimeout: AUTH_POLICY.mailTimeoutMs, socketTimeout: AUTH_POLICY.mailTimeoutMs,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  })
  // [F01 추가] 전송은 commit 후 호출한다. SMTP 원본 오류/자격 증명/메일을 로그에 전달하지 않는다.
  // 성공은 SMTP 수락만 뜻하며 실제 수신함 배달을 보장하지 않는다. 로컬은 릴레이 없는 캡처 서버다.
  async send(message: MailMessage): Promise<boolean> {
    try {
      const result = await this.transport.sendMail({ from: this.config.from, ...message })
      return result.accepted.length === 1 && result.rejected.length === 0
    } catch { return false }
  }
}
