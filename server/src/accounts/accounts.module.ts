import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

// [F04-01 추가] 기존 DB/세션/감사를 공유한다. 전역 guard나 새 인증 설정을 만들지 않는다.
@Module({ imports: [AuthModule, DatabaseModule], controllers: [AccountsController], providers: [AccountsService] })
export class AccountsModule {}
