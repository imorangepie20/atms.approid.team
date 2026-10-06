import { z } from 'zod'
import { AUTH_POLICY } from '../config/app.config'
// [F01 추가] 정적 스키마를 공통 파이프에 전달한다. 로그인은 원문 비밀번호의 공백을 trim하지 않는다.
// [F01 수정] JS UTF-16 길이 대신 코드 포인트 수를 검사한다. 검사 과정에서 trim/normalize하지 않는다.
const password = (minimum: number) => z.string().refine(value => {
  const length = Array.from(value).length
  return length >= minimum && length <= AUTH_POLICY.passwordMax
}, { message: 'Invalid password length' })
const email = z.string().email().max(254)
export const loginSchema = z.strictObject({ email, password: password(1) })
export const reauthSchema = z.strictObject({ password: password(1) })
export const registerSchema = z.strictObject({ email, password: password(AUTH_POLICY.passwordMin) })
export const emailRequestSchema = z.strictObject({ email })
export const tokenConfirmSchema = z.strictObject({ token: z.string().regex(/^[0-9a-f]{64}$/), newPassword: password(AUTH_POLICY.passwordMin) })
export const passwordChangeSchema = z.strictObject({ newPassword: password(AUTH_POLICY.passwordMin) })
export type LoginInput = z.infer<typeof loginSchema>
export type ReauthInput = z.infer<typeof reauthSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type TokenConfirmInput = z.infer<typeof tokenConfirmSchema>
