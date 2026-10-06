import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'
import { CompanyMembersController } from './company-members.controller'
import { CompanyMembersService } from './company-members.service'
import { CompanyAccessFlowsController } from './company-access-flows.controller'
import { CompanyAccessFlowsService } from './company-access-flows.service'

// [F01 추가] 공유 DB/세션/감사를 주입한다. AuthModule의 전역 guard를 별도로 중복 등록하지 않는다.
// [F01 네 번째 묶음] 기존 회사 API와 같은 guard/DB/세션/감사를 공유한다.
// [F01 다섯 번째 묶음] 소속 없는 확인 사용자의 요청/수락도 기존 인증만 공유하고 메서드별 권한을 적용한다.
@Module({ imports: [AuthModule, DatabaseModule], controllers: [CompaniesController, CompanyMembersController, CompanyAccessFlowsController],
  providers: [CompaniesService, CompanyMembersService, CompanyAccessFlowsService] })
export class CompaniesModule {}
