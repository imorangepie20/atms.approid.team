import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { DatabaseModule } from '../database.module'
import { AuditService } from '../audit/audit.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { LoginRateLimitService } from './login-rate-limit.service'
import { AuthGuard } from './auth.guard'
import { CompanyAccessGuard } from './company-access.guard'
import { AccountLifecycleController } from './account-lifecycle.controller'
import { AccountLifecycleService } from './account-lifecycle.service'
import { ActionTokenService } from './action-token.service'
import { PasswordPolicyService } from './password-policy.service'
import { MailService } from '../mail/mail.service'

// [F08-13 추가] 전역 guard도 모듈 안에서 등록해 DB/서비스를 주입한다. 세션 확인 → 회사 범위 확인 순서다.
@Module({ imports: [DatabaseModule], controllers: [AuthController, AccountLifecycleController], providers: [
  AuditService, SessionService, LoginRateLimitService, AuthService,
  // [F01 두 번째 묶음] 기존 로그인/권한 guard를 공유하고 가입/복구 조립만 추가한다.
  AccountLifecycleService, ActionTokenService, PasswordPolicyService, MailService,
  { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: CompanyAccessGuard },
// [F01 초대 추가] 기존 SMTP 전송자 하나를 회사 모듈에서도 재사용한다. 인증 guard 등록은 유지한다.
], exports: [AuditService, SessionService, LoginRateLimitService, AuthService, MailService] })
export class AuthModule {}
