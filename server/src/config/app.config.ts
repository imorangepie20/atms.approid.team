/* [F08-10 추가: 변경 가능한 공통 설정의 기준 파일]
 * API 기동과 F08-12 금액 기본값을 이 파일에서 관리한다.
 * 인증과 금액 설정도 같은 파일을 참조한다. 서비스에서 시간값을 다시 정의하지 않는다.
 */
const defaults = Object.freeze({ port: 4300, host: '127.0.0.1', apiPrefix: 'api' })

// [F08-12 추가] P-10 확정값. 회사별 계정·회계연도와 승인된 세무 규칙은 DB 업무 데이터다.
export const MONEY_CONFIG = Object.freeze({
  currency: 'KRW', inputScale: 6, journalScale: 0,
  storagePrecision: 24, storageScale: 6, integerDigits: 18,
  // 기술 선택: 24자리 피연산자의 곱(최대 48자리)과 중간 합계에 여유를 둔다.
  // 무한 소수 나눗셈은 이 유효 자릿수로 계산하고 저장 시점의 별도 범위 검사를 거친다.
  calculationPrecision: 80, rounding: 'HALF_UP' as const,
})

// [F01 세 번째 묶음 추가: 회사 입력 정책의 단일 기준]
// 이름 길이는 UTF-16 길이가 아니라 Unicode 코드 포인트 수다. 날짜는 양끝 포함 일수다.
// 366일은 제품의 입력 상한이며 법적 사업연도 적합성 판정을 대신하지 않는다.
// 기본 월/일은 입력 안내만 제공한다. 실제 시작/종료일은 사용자가 보내고 DB에 보존한다.
export const COMPANY_CONFIG = Object.freeze({
  nameMin: 1, nameMax: 200, listDefault: 25, listMax: 100, fiscalYearMaxDays: 366,
  accountingStandard: 'K_GAAP', currency: MONEY_CONFIG.currency,
  defaultStartMonth: 1, defaultStartDay: 1, defaultEndMonth: 12, defaultEndDay: 31,
})

// [F02 승인 C2/C7] 거래처 길이는 Unicode 코드 포인트 수. 기능마다 상한을 재정의하지 않는다.
export const COUNTERPARTY_CONFIG = Object.freeze({
  nameMax: 100, contactNameMax: 100, emailMax: 254, phoneMax: 40, addressMax: 300, memoMax: 1000,
  queryMax: 100, listDefault: 20, listMax: 100,
})

// [F03 승인 E2~E7] P-07 파일 상한과 외부 I/O/잠금/정리 시간을 한 곳에서 관리한다.
export const EVIDENCE_CONFIG = Object.freeze({
  fileBytes: 10 * 1024 * 1024, bodyBytes: 12 * 1024 * 1024, metadataBytes: 8 * 1024,
  titleMax: 100, fileNameMax: 200, listDefault: 20, listMax: 100,
  ioMs: 20_000, scanMs: 30_000, leaseMs: 120_000,
  expiryMs: 24 * 60 * 60 * 1000, cleanupMs: 5 * 60 * 1000, signatureMaxAgeMs: 24 * 60 * 60 * 1000,
})
export function readEvidenceConfig(env: NodeJS.ProcessEnv = process.env) {
  const accountId = env.R2_ACCOUNT_ID, bucket = env.R2_BUCKET, accessKeyId = env.R2_ACCESS_KEY_ID, secretAccessKey = env.R2_SECRET_ACCESS_KEY
  // 미설정은 기존 API 기동을 막지 않는다. 잘못되거나 일부만 설정된 값도 증빙 I/O를503로 막는다.
  const storage = !!accountId && /^[a-f0-9]{32}$/.test(accountId) && !!bucket && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    && !!accessKeyId && !!secretAccessKey ? { endpoint: `https://${accountId}.r2.cloudflarestorage.com`, bucket, accessKeyId, secretAccessKey } : null
  const host = env.CLAMAV_HOST ?? (env.NODE_ENV === 'production' ? 'clamav' : '127.0.0.1')
  const port = Number(env.CLAMAV_PORT ?? (env.NODE_ENV === 'production' ? '3310' : '13310'))
  const scanner = (env.NODE_ENV === 'production' ? host === 'clamav' : ['127.0.0.1', 'localhost', 'clamav'].includes(host))
    && Number.isInteger(port) && port > 0 && port <= 65535 ? { host, port } : null
  return { storage, scanner }
}

export interface AppConfig {
  readonly port: number
  readonly host: string
  readonly apiPrefix: string
}

// 입력: 프로세스 환경 변수. 출력: 검증을 마친 읽기 전용 설정.
// 인수를 받을 수 있어 테스트가 실제 환경 변수를 바꾸지 않고 같은 로직을 검증한다.
export function readAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(environment.PORT ?? defaults.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  const host = environment.HOST ?? defaults.host
  if (!host.trim()) throw new Error('Invalid HOST')
  // 실패 메시지에는 잘못된 원본 설정값을 붙이지 않는다.
  return Object.freeze({ port, host, apiPrefix: defaults.apiPrefix })
}

// [F01/F08-13 추가: 인증 정책의 단일 기준] 시간은 모두 밀리초, Argon2 메모리는 KiB다.
// 기존 API 설정의 반환 형태와 MONEY_CONFIG는 유지한다. 기능에서 숫자를 다시 정의하지 않는다.
export const AUTH_POLICY = Object.freeze({
  idleMs: 60 * 60 * 1000, absoluteMs: 8 * 60 * 60 * 1000, reauthMs: 5 * 60 * 1000,
  loginWindowMs: 15 * 60 * 1000, accountFailures: 5, accountWaitMs: 15 * 60 * 1000, ipRequests: 30,
  argonMemoryKiB: 19 * 1024, argonIterations: 2, argonParallelism: 1,
  // [F01 두 번째 묶음 추가] 확인/복구와 발송 한도는 AUTH-04/05 확정값이다.
  verificationMs: 24 * 60 * 60 * 1000, resetMs: 30 * 60 * 1000,
  emailWindowMs: 15 * 60 * 1000, emailAccountRequests: 3, emailIpRequests: 20,
  passwordMin: 15, passwordMax: 128,
  // HIBP는 새 비밀번호를 저장하기 전에만 조회한다. 장애 때 로그인 자체를 막지 않는다.
  passwordLookupMs: 3000, passwordLookupBytes: 256 * 1024,
  mailTimeoutMs: 5000,
  // 접수 응답에서 SMTP 지연/실패를 기다리지 않는다. 짧은 DB 경로 차이는 최소 응답 대기로 완화한다.
  emailResponseMinMs: 100,
})
export interface AuthConfig { readonly origin: string; readonly secure: boolean; readonly cookieName: string }
// [F01 다섯 번째 묶음] 시간/한도는 이 파일 한 곳에서 정의한다. 초대 발송은 AUTH_POLICY 메일 버킷을 공유한다.
// 신청 버킷만 사용자 ID/IP 별도로 분리하며 설정은 기존 15분/3회/20회를 참조한다.
export const COMPANY_ACCESS_POLICY = Object.freeze({
  invitationMs: 7 * 24 * 60 * 60 * 1000, requestMs: 7 * 24 * 60 * 60 * 1000,
  requestWindowMs: AUTH_POLICY.emailWindowMs, requestUserRequests: AUTH_POLICY.emailAccountRequests,
  requestIpRequests: AUTH_POLICY.emailIpRequests,
})
export function readAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = environment.NODE_ENV === 'production'
  const value = environment.AUTH_WEB_ORIGIN ?? (production ? '' : 'http://127.0.0.1:4173')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid authentication origin') }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  const localBinding = ['127.0.0.1', 'localhost', '::1'].includes(environment.HOST ?? '127.0.0.1')
  // Origin은 경로가 없는 완전 일치 값이다. 운영은 HTTPS, 개발 HTTP는 로컬 주소만 허용한다.
  if (value !== url.origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)
      || (production && url.protocol !== 'https:') || (url.protocol === 'http:' && (!local || !localBinding))) {
    throw new Error('Invalid authentication origin')
  }
  return Object.freeze({ origin: url.origin, secure: url.protocol === 'https:',
    cookieName: url.protocol === 'https:' ? '__Host-atms_session' : 'atms_dev_session' })
}

// [F04-01 승인 A3/API-1] 계정 입력/조회 한도는 업무 서비스와 스키마가 함께 사용한다.
export const ACCOUNT_CONFIG = Object.freeze({ codeMax: 20, nameMax: 100, queryMax: 100, listDefault: 20, listMax: 100 })

export interface MailConfig {
  readonly host: string; readonly port: number; readonly secure: boolean; readonly requireTLS: boolean
  readonly from: string; readonly user?: string; readonly password?: string
}
// [F01 추가] 개발은 루프백 캡처 메일함만 기본 허용한다. 운영에는 발신자/인증/TLS가 반드시 필요하다.
// 실패 메시지는 비밀값을 포함하지 않는다. 실제 .env를 수정하지 않고 예시와 환경 변수로 설정한다.
export function readMailConfig(environment: NodeJS.ProcessEnv = process.env): MailConfig {
  const production = environment.NODE_ENV === 'production'
  const host = environment.SMTP_HOST ?? (production ? '' : '127.0.0.1')
  const port = Number(environment.SMTP_PORT ?? (production ? '' : '1025'))
  const from = environment.SMTP_FROM ?? (production ? '' : 'no-reply@atms.test')
  const mode = environment.SMTP_TLS ?? (production ? '' : 'local')
  const user = environment.SMTP_USER, password = environment.SMTP_PASSWORD
  if (!host || /[\s/@]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535
      || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)
      || !['tls', 'starttls', 'local'].includes(mode)
      || (!!user !== !!password)
      || (production && (!user || !password || mode === 'local'))
      || (mode === 'local' && !['127.0.0.1', 'localhost', '::1'].includes(host))) {
    throw new Error('Invalid mail configuration')
  }
  return Object.freeze({ host, port, from, user, password, secure: mode === 'tls', requireTLS: mode === 'starttls' })
}
