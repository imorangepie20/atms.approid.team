import { Module } from '@nestjs/common'
import { HealthModule } from './health.module'
import { AuthModule } from './auth/auth.module'
import { CompaniesModule } from './companies/companies.module'
import { RulesModule } from './rules/rules.module'
import { CounterpartiesModule } from './counterparties/counterparties.module'
import { EvidenceModule } from './evidence/evidence.module'
import { AccountsModule } from './accounts/accounts.module'
import { JournalsModule } from './journals/journals.module'

// [F08-10 수정] 루트 모듈은 기능 모듈을 연결한다. 기존 헬스와 DB 생명주기는 HealthModule이 맡는다.
// 회사·인증·장부 모듈은 확정한 후속 순서에 따라 이 imports 목록에 추가한다.
// [F01/F08-13 추가] AuthModule은 기본 보호 guard를 등록한다. 공개 헬스는 인증 없이 기존대로 동작한다.
// [F01 세 번째 묶음] 회사 API를 연결하며 공개 헬스/기존 인증의 계약은 유지한다.
// [F13-01~03 추가] RulesModule은 회사 범위의 읽기 전용 규칙 버전 조회를 연결한다.
// [F02 승인 연결] 거래처의 5개 경로를 기존 인증/공통 오류 아래에 추가한다.
// [F03 승인 E1] 첫 증빙 서버5경로를 기존 세션·회사 guard 아래에 연결한다.
// [F04-01 승인 A1] 계정 관리5경로도 같은 인증·회사·안전한 오류 경계에 연결한다.
// [F04 J1] 승인된 초안/증빙 역조회5경로를 연결한다. 승인·확정·원장은 아직 연결하지 않는다.
@Module({ imports: [HealthModule, AuthModule, CompaniesModule, RulesModule, CounterpartiesModule, EvidenceModule, AccountsModule, JournalsModule] })
export class AppModule {}
