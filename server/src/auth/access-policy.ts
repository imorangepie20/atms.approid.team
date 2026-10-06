// [F01 추가] 확정한 역할표만 코드로 표현한다. 회사 관리자 포함 권한과 겸임 합산은 같은 회사 안에서만 적용한다.
export const permissions = [
  'company.read', 'company.manage', 'company.members.manage', 'evidence.read', 'evidence.create',
  'reports.read', 'journal.read', 'journal.draft', 'journal.request', 'journal.approve', 'journal.confirm',
  'closing.close', 'closing.reopen', 'correction.draft', 'correction.approve',
  // [F02 승인 C4] 기존 역할표는 유지하며 거래처의 읽기/쓰기만 명시적으로 추가한다.
  'counterparties.read', 'counterparties.write',
  // [F04-01 승인 A2] 모든 소속 역할은 조회, 회사 관리자만 계정 체계를 변경한다.
  'accounts.read', 'accounts.manage',
] as const
export type Permission = typeof permissions[number]
const common: Permission[] = ['company.read', 'evidence.read', 'reports.read', 'journal.read', 'counterparties.read', 'accounts.read']
const accountant: Permission[] = [...common, 'evidence.create', 'journal.draft', 'journal.request', 'correction.draft', 'counterparties.write']
const approver: Permission[] = [...common, 'journal.approve', 'journal.confirm', 'closing.close', 'correction.approve']
const rolePermissions: Readonly<Record<string, readonly Permission[]>> = {
  COMPANY_ADMIN: permissions, ACCOUNTANT: accountant, APPROVER: approver, READ_ONLY: common,
  EXTERNAL_TAX: [...common, 'evidence.create', 'journal.draft', 'counterparties.write'],
}
export function hasPermission(roles: readonly string[], permission: string): boolean {
  return roles.some(role => Object.hasOwn(rolePermissions, role) && rolePermissions[role].some(p => p === permission))
}
export interface Restrictions { stateAllowed: boolean; userId: string; authorId?: string; allowSelfApproval: boolean }
export function canPerform(roles: readonly string[], permission: string, restrictions: Restrictions): boolean {
  // 업무 서비스가 DB에서 읽은 작성자·현재 업무 상태를 전달한다. 입력 본문의 작성자 값을 쓰지 않는다.
  if (!restrictions.stateAllowed || !hasPermission(roles, permission)) return false
  const approval = ['journal.approve', 'journal.confirm', 'correction.approve'].includes(permission)
  if (approval && (!restrictions.authorId || (restrictions.authorId === restrictions.userId && !restrictions.allowSelfApproval))) return false
  return true
}
