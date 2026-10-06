import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { CounterpartiesController } from './counterparties.controller'
import { CounterpartiesService } from './counterparties.service'

// [F02 모듈] DB/세션/감사를 주입하고 전역 guard를 중복 등록하지 않는다.
@Module({ imports: [AuthModule, DatabaseModule], controllers: [CounterpartiesController], providers: [CounterpartiesService] })
export class CounterpartiesModule {}
