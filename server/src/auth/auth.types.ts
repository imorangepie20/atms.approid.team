import type { Request } from 'express'
import type { UserSession } from '../generated/prisma/client'

// [F01 추가] guard가 확인한 자료만 이 컨텍스트에 넣는다. 요청 본문이나 쿠키의 회사/역할을 신뢰하지 않는다.
export interface AuthContext {
  user: { id: string; email: string }
  session: UserSession
  rawToken: string
}
export interface AuthRequest extends Request {
  requestId: string
  auth?: AuthContext
  companyScope?: { id: string; membershipId: string; roles: string[]; allowSelfApproval: boolean }
}
