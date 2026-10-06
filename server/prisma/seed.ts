import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/* [F08-11 추가: 개발 데이터]
 * 명시적 허용 + 로컬 주소 + 전용 개발/검증 DB 이름을 모두 확인한 뒤에만 연결한다.
 * 기본 atms DB·홈서버·운영 환경에는 실행하지 않는다. 원문 비밀번호·유효 세션을 만들지 않는다.
 */
export function assertSeedTarget(environment: NodeJS.ProcessEnv): string {
  if (!['development', 'test'].includes(environment.NODE_ENV ?? '') || environment.ATMS_ALLOW_DEV_SEED !== '1') {
    throw new Error('Development seed requires explicit local development authorization.')
  }
  let url: URL
  try { url = new URL(environment.DATABASE_URL ?? '') }
  catch { throw new Error('Invalid development database target.') }
  const database = url.pathname.slice(1)
  if (url.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432'
      || !(database === 'atms_dev_seed' || /^atms_verify_f081112_[a-f0-9]{16}$/.test(database))) {
    throw new Error('Development seed requires an isolated local database.')
  }
  return url.toString()
}

export async function seedDevelopment(client: PrismaClient): Promise<void> {
  // 하나의 트랜잭션으로 예시 데이터 전체를 저장한다. 실패하면 부분 생성이 없다.
  // 고정된 예시 식별자와 upsert(update 없음)로 재실행 시 사용자 수정값·기존 자료를 덮어쓰지 않는다.
  await client.$transaction(async tx => {
    const template = await tx.accountTemplate.upsert({
      where: { code_version: { code: 'ATMS-DEVELOPMENT-ONLY', version: 1 } }, update: {},
      create: { code: 'ATMS-DEVELOPMENT-ONLY', version: 1, name: '검증 전용 계정 예시', isDevelopmentOnly: true },
    })
    const items = []
    for (const [code, name] of [['1100', '개발 예시 현금'], ['4100', '개발 예시 매출']]) {
      items.push(await tx.accountTemplateItem.upsert({
        where: { templateId_code: { templateId: template.id, code } }, update: {},
        create: { templateId: template.id, code, name },
      }))
    }
    const fixtures = [
      { id: 'a0000000-0000-4000-8000-000000000001', name: '개발 회사 A', email: 'a@example.invalid',
        start: '2026-01-01', end: '2026-12-31', roles: ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER'] as const },
      { id: 'a0000000-0000-4000-8000-000000000002', name: '개발 회사 B', email: 'b@example.invalid',
        start: '2026-07-01', end: '2027-06-30', roles: ['READ_ONLY', 'EXTERNAL_TAX'] as const },
    ]
    for (const fixture of fixtures) {
      const company = await tx.company.upsert({ where: { id: fixture.id }, update: {}, create: { id: fixture.id, name: fixture.name } })
      const user = await tx.user.upsert({
        where: { emailNormalized: fixture.email }, update: {},
        // 중지 계정·해시 없음. 기능 검증용 데이터이며 로그인 가능한 데모 계정이 아니다.
        create: { email: fixture.email, emailNormalized: fixture.email, disabledAt: new Date('2026-01-01T00:00:00Z') },
      })
      const membership = await tx.companyMembership.upsert({
        where: { companyId_userId: { companyId: company.id, userId: user.id } }, update: {},
        create: { companyId: company.id, userId: user.id },
      })
      for (const role of fixture.roles) {
        await tx.companyMemberRole.upsert({
          where: { companyId_membershipId_role: { companyId: company.id, membershipId: membership.id, role } }, update: {},
          create: { companyId: company.id, membershipId: membership.id, role },
        })
      }
      await tx.fiscalYear.upsert({
        where: { companyId_startDate: { companyId: company.id, startDate: new Date(fixture.start) } }, update: {},
        create: { companyId: company.id, startDate: new Date(fixture.start), endDate: new Date(fixture.end) },
      })
      for (const item of items) {
        await tx.companyAccount.upsert({
          where: { companyId_code: { companyId: company.id, code: item.code } }, update: {},
          create: { companyId: company.id, code: item.code, name: item.name, sourceTemplateItemId: item.id },
        })
      }
    }
  })
}

// tsx가 실행한 CommonJS 진입점에서만 CLI를 시작한다. 함수 import는 DB 연결을 일으키지 않는다.
if (typeof require !== 'undefined' && require.main === module) {
  let client: PrismaClient | undefined
  ;(async () => {
    const connectionString = assertSeedTarget(process.env)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) })
    await seedDevelopment(client)
    console.log('Isolated development seed completed. No login credentials or sessions were created.')
  })().catch(() => {
    // 원본 연결 정보·DB 예외를 출력하지 않는다.
    console.error('Development seed failed. Check the isolated target and explicit authorization.')
    process.exitCode = 1
  }).finally(async () => { if (client) await client.$disconnect() })
}
