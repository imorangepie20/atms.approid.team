import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { PasswordPolicyService } = require('../dist/auth/password-policy.service.js') as typeof import('../src/auth/password-policy.service')
const { AUTH_POLICY, readMailConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { registerSchema, loginSchema } = require('../dist/auth/auth.schemas.js') as typeof import('../src/auth/auth.schemas')
const argon2 = require('argon2') as typeof import('argon2')
const { MailService } = require('../dist/mail/mail.service.js') as typeof import('../src/mail/mail.service')
const password = '  한글😀 safe test passphrase  '
const sha = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase()
const cleanRange = (value: string) => `${sha(value).slice(5)}:0\r\n${'F'.repeat(35)}:2\r\n`
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })

describe('F01 password screening', () => {
  it.each([password, '😀'.repeat(15), '😀'.repeat(128)])('preserves Unicode/space input and stores Argon2id: %s', async value => {
    const external = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(cleanRange(value)))
    const hash = await new PasswordPolicyService().hash(value)
    // PHC의 매개변수 표기 순서를 가정하지 않고 라이브러리로 실제 비용/버전을 검사한다.
    expect(hash).toMatch(/^\$argon2id\$v=19\$/)
    expect(argon2.needsRehash(hash, { memoryCost: AUTH_POLICY.argonMemoryKiB,
      timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })).toBe(false)
    expect(await argon2.verify(hash, value)).toBe(true)
    expect(external).toHaveBeenCalledTimes(1)
    expect(external.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${sha(value).slice(0, 5)}`)
    expect(external.mock.calls[0][1]?.headers).toEqual({ 'Add-Padding': 'true', 'User-Agent': 'ATMS-password-screening' })
    expect(external.mock.calls[0][1]?.redirect).toBe('error')
    expect(JSON.stringify(external.mock.calls)).not.toContain(value)
    expect(JSON.stringify(external.mock.calls)).not.toContain(sha(value))
  })
  it.each(['a'.repeat(14), '😀'.repeat(129), '\uD800'.repeat(15)])('rejects invalid length/Unicode before network', async value => {
    const external = vi.spyOn(globalThis, 'fetch')
    await expect(new PasswordPolicyService().hash(value)).rejects.toMatchObject({ status: 400 })
    expect(external).not.toHaveBeenCalled()
  })
  it('uses code points consistently in signup and existing login schemas', () => {
    const input = { email: 'test@example.invalid', password: '😀'.repeat(128) }
    expect(registerSchema.parse(input)).toEqual(input)
    expect(loginSchema.parse(input)).toEqual(input)
    expect(registerSchema.safeParse({ ...input, password: '😀'.repeat(129) }).success).toBe(false)
  })
  it('blocks a positive leaked/common match and ignores count-zero padding', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`${sha(password).slice(5)}:1`))
    await expect(new PasswordPolicyService().hash(password)).rejects.toMatchObject({ status: 400 })
  })
  it('blocks full user-email equality without transmitting it', async () => {
    const external = vi.spyOn(globalThis, 'fetch')
    await expect(new PasswordPolicyService().hash('person@example.invalid', 'person@example.invalid')).rejects.toMatchObject({ status: 400 })
    expect(external).not.toHaveBeenCalled()
  })
  it.each(['', 'not-a-range', `${'A'.repeat(35)}:9007199254740993`, `${'A'.repeat(35)}:-1`])('fails closed on malformed range: %s', async body => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body))
    await expect(new PasswordPolicyService().hash(password)).rejects.toMatchObject({ status: 503 })
  })
  it.each([302, 404, 429, 503])('fails closed on status %s', async status => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('failure', { status }))
    await expect(new PasswordPolicyService().hash(password)).rejects.toMatchObject({ status: 503 })
  })
  it('bounds streamed response size before parsing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(AUTH_POLICY.passwordLookupBytes + 1)))
    await expect(new PasswordPolicyService().hash(password)).rejects.toMatchObject({ status: 503 })
  })
  it('aborts lookup at the configured deadline without accepting the password', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('network failed')))
    }))
    const pending = expect(new PasswordPolicyService().hash(password)).rejects.toMatchObject({ status: 503 })
    await vi.advanceTimersByTimeAsync(AUTH_POLICY.passwordLookupMs)
    await pending
  })
})

describe('F01 SMTP configuration', () => {
  it('returns a safe failure on an actual SMTP protocol rejection without passing raw errors to the caller', async () => {
    const smtp = createServer(socket => { socket.end('554 Fictional SMTP rejection\r\n') })
    await new Promise<void>(resolve => smtp.listen(0, '127.0.0.1', resolve))
    const address = smtp.address()
    if (!address || typeof address === 'string') throw new Error('Expected loopback SMTP port')
    vi.stubEnv('SMTP_PORT', String(address.port))
    vi.stubEnv('SMTP_HOST', '127.0.0.1'); vi.stubEnv('SMTP_TLS', 'local'); vi.stubEnv('NODE_ENV', 'test')
    try {
      expect(await new MailService().send({ to: 'fictional@example.invalid', subject: 'fixture', text: 'fixture' })).toBe(false)
    } finally { await new Promise<void>(resolve => smtp.close(() => resolve())) }
  })
  it('defaults only to loopback capture without real credentials', () => {
    expect(readMailConfig({})).toMatchObject({ host: '127.0.0.1', port: 1025, from: 'no-reply@atms.test', secure: false, requireTLS: false })
  })
  it('requires authenticated production SMTP with TLS/STARTTLS and never falls back', () => {
    const valid = { NODE_ENV: 'production', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_TLS: 'starttls',
      SMTP_FROM: 'no-reply@example.invalid', SMTP_USER: 'fictional-user', SMTP_PASSWORD: 'fictional-secret' }
    expect(readMailConfig(valid)).toMatchObject({ requireTLS: true, secure: false })
    expect(readMailConfig({ ...valid, SMTP_TLS: 'tls', SMTP_PORT: '465' })).toMatchObject({ requireTLS: false, secure: true })
    for (const invalid of [{ NODE_ENV: 'production' }, { ...valid, SMTP_TLS: 'local' }, { ...valid, SMTP_PASSWORD: '' },
      { ...valid, SMTP_FROM: 'evil\r\nBcc:wrong' }, { SMTP_HOST: 'smtp.example.invalid', SMTP_TLS: 'local' }]) {
      expect(() => readMailConfig(invalid)).toThrow('Invalid mail configuration')
    }
  })
})
