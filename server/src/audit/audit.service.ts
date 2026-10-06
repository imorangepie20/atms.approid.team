import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client'

// [F01 두 번째 묶음] 이 허용 목록과 DB CHECK를 함께 갱신한다. 메일 본문·원문 토큰은 Event 입력에 없다.
export const auditTypes = ['LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'REAUTH_SUCCEEDED', 'REAUTH_FAILED', 'ACCESS_DENIED',
  'ACCOUNT_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MAIL_FAILED',
  'COMPANY_CREATED', 'COMPANY_RENAMED', 'FISCAL_YEAR_CREATED', 'MEMBER_ROLES_CHANGED', 'MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED', 'INVITATION_CANCELLED', 'INVITATION_RESENT', 'INVITATION_ACCEPTED', 'INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED', 'ACCESS_REQUEST_CANCELLED', 'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_REJECTED', 'COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED', 'COUNTERPARTY_CREATED', 'COUNTERPARTY_UPDATED', 'COUNTERPARTY_DEACTIVATED', 'EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DEACTIVATED', 'JOURNAL_DRAFT_CREATED', 'JOURNAL_DRAFT_UPDATED',
  'JOURNAL_SUBMITTED', 'JOURNAL_APPROVED', 'JOURNAL_REJECTED', 'JOURNAL_RETURNED_TO_DRAFT', 'JOURNAL_POSTED',
  'OPENING_BALANCE_CREATED', 'OPENING_BALANCE_UPDATED'] as const
export type AuditType = typeof auditTypes[number]
type CompanyChange =
  // [F05 W6] 사유·적요·금액·제출본은 이 일반 감사에 복사하지 않는다.
  | { kind: 'journal-workflow'; eventType: 'JOURNAL_SUBMITTED' | 'JOURNAL_APPROVED' | 'JOURNAL_REJECTED' | 'JOURNAL_RETURNED_TO_DRAFT' | 'JOURNAL_POSTED';
      journalId: string; actionId: string; statusBefore: 'DRAFT' | 'SUBMITTED' | 'REJECTED' | 'APPROVED';
      statusAfter: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DRAFT' | 'POSTED'; versionBefore: number; versionAfter: number }
  // [F04 J7] 적요/금액/파일/입력 해시를 받지 않는 초안 감사 계약이다.
  | { kind: 'journal-draft'; eventType: 'JOURNAL_DRAFT_CREATED' | 'JOURNAL_DRAFT_UPDATED'; journalId: string; changedFields: string[];
      versionBefore: number; versionAfter: number; statusBefore: null | 'DRAFT'; statusAfter: 'DRAFT'; lineCount: number; evidenceCount: number }
  // [F04-02 O4/O5] 금액·적요·증빙 원문 없이 연도/필드/개수와 version만 남긴다.
  | { kind: 'opening-balance'; eventType: 'OPENING_BALANCE_CREATED' | 'OPENING_BALANCE_UPDATED'; journalId: string;
      fiscalYearId: string; changedFields: string[]; versionBefore: number; versionAfter: number; lineCount: number; evidenceCount: number }
  // [F04-01 승인 A7] 이름/코드값/해시는 받지 않고 정적 필드명과 버전·상태만 기록한다.
  | { kind: 'account'; eventType: AuditType; accountId: string; changedFields: string[];
      versionBefore: number; versionAfter: number; activeBefore: boolean; activeAfter: boolean }
  // [F03 E7] 원본 내용/파일명/키/지문 없이 완료 식별자와 고정 분류만 감사한다.
  | { kind: 'evidence'; evidenceId: string; evidenceKind: 'RECEIPT' | 'TAX_INVOICE' | 'OTHER' }
  // [F02 승인 C5] 내용 대신 정적 필드명과 버전/사용 상태만 저장한다.
  | { kind: 'counterparty'; eventType: AuditType; counterpartyId: string; changedFields: string[];
      versionBefore: number; versionAfter: number; activeBefore: boolean; activeAfter: boolean }
  | { kind: 'self-approval'; allowSelfApprovalBefore: boolean; allowSelfApprovalAfter: boolean; versionBefore: number; versionAfter: number }
  | { kind: 'created'; name: string; fiscalYearId: string; startDate: string; endDate: string; version: number; otherSessionsRevoked: number }
  | { kind: 'renamed'; nameBefore: string; nameAfter: string; versionBefore: number; versionAfter: number }
  | { kind: 'fiscal-year'; fiscalYearId: string; startDate: string; endDate: string; versionBefore: number; versionAfter: number }
  | { kind: 'member-roles' | 'member-deactivated'; membershipId: string; targetUserId: string;
      rolesBefore: string[]; rolesAfter: string[]; activeBefore: boolean; activeAfter: boolean;
      versionBefore: number; versionAfter: number; revokedSessions: number }
  | { kind: 'access-flow'; eventType: AuditType; entity: 'invitation' | 'request'; flowId: string; targetUserId: string | null;
      rolesBefore: string[]; rolesAfter: string[]; statusBefore: string | null; statusAfter: string;
      versionBefore: number; versionAfter: number; expiresAt: string; revokedSessions: number }
interface Event { type: AuditType; requestId: string; actorId?: string; companyId?: string; reason?: 'SESSION' | 'ORIGIN' | 'CSRF' | 'ROLE' | 'COMPANY' | 'REAUTH' | 'RATE'; change?: CompanyChange }

@Injectable()
export class AuditService {
  // [F08-13 추가] 호출자가 시작한 트랜잭션에만 쓴다. 임의 details나 요청 본문을 복사하는 API는 제공하지 않는다.
  // 실패하면 세션 변경도 함께 롤백한다. 접근 거부는 별도 트랜잭션에 기록한 다음 요청을 거부한다.
  async record(tx: Prisma.TransactionClient, event: Event): Promise<void> {
    if (!auditTypes.includes(event.type)) throw new Error('Invalid audit event type')
    if (event.reason && !['SESSION', 'ORIGIN', 'CSRF', 'ROLE', 'COMPANY', 'REAUTH', 'RATE'].includes(event.reason)) throw new Error('Invalid audit reason')
    // [F01 회사 기반 추가] 스프레드나 임의 details 대신 사건마다 명시한 필드만 새로 구성한다.
    // 타입 검사뿐 아니라 런타임에서도 사건/변경 종류를 일치시켜 잘못된 호출은 전체 TX를 롤백한다.
    let details: Prisma.InputJsonObject = event.reason ? { reason: event.reason } : {}
    const change = event.change
    if (event.type.startsWith('JOURNAL_') && !['JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED'].includes(event.type)) {
      if (!event.actorId || !event.companyId || change?.kind !== 'journal-workflow' || change.eventType !== event.type
          || !change.journalId || !change.actionId || !Number.isInteger(change.versionBefore) || change.versionBefore < 1
          || change.versionAfter !== change.versionBefore + 1
          || !({ JOURNAL_SUBMITTED: change.statusBefore === 'DRAFT' && change.statusAfter === 'SUBMITTED',
            JOURNAL_APPROVED: change.statusBefore === 'SUBMITTED' && change.statusAfter === 'APPROVED',
            JOURNAL_REJECTED: change.statusBefore === 'SUBMITTED' && change.statusAfter === 'REJECTED',
            JOURNAL_RETURNED_TO_DRAFT: change.statusBefore === 'REJECTED' && change.statusAfter === 'DRAFT',
            JOURNAL_POSTED: change.statusBefore === 'APPROVED' && change.statusAfter === 'POSTED' } as Record<string, boolean>)[event.type])
        throw new Error('Invalid journal workflow audit change')
      details = { journalId: change.journalId, actionId: change.actionId, statusBefore: change.statusBefore,
        statusAfter: change.statusAfter, versionBefore: change.versionBefore, versionAfter: change.versionAfter }
    } else if (event.type === 'JOURNAL_DRAFT_CREATED' || event.type === 'JOURNAL_DRAFT_UPDATED') {
      const created = event.type === 'JOURNAL_DRAFT_CREATED'
      const fields = ['accountingDate', 'memo', 'counterpartyId', 'evidenceIds', 'lines', ...(created ? ['fiscalYearId'] : [])]
      if (!event.actorId || !event.companyId || change?.kind !== 'journal-draft' || change.eventType !== event.type || !change.journalId
          || !Array.isArray(change.changedFields) || !change.changedFields.length || change.changedFields.some(field => !fields.includes(field))
          || new Set(change.changedFields).size !== change.changedFields.length
          || !Number.isInteger(change.versionBefore) || change.versionBefore < (created ? 0 : 1) || (created && change.versionBefore !== 0)
          || !Number.isInteger(change.versionAfter) || change.versionAfter !== change.versionBefore + 1 || change.versionAfter > 2147483647
          || change.statusBefore !== (created ? null : 'DRAFT') || change.statusAfter !== 'DRAFT'
          || !Number.isInteger(change.lineCount) || change.lineCount < 2 || change.lineCount > 100
          || !Number.isInteger(change.evidenceCount) || change.evidenceCount < 0 || change.evidenceCount > 20) throw new Error('Invalid journal draft audit change')
      details = { journalId: change.journalId, changedFields: [...change.changedFields], versionBefore: change.versionBefore, versionAfter: change.versionAfter,
        statusBefore: change.statusBefore, statusAfter: change.statusAfter, lineCount: change.lineCount, evidenceCount: change.evidenceCount }
    } else if (event.type === 'OPENING_BALANCE_CREATED' || event.type === 'OPENING_BALANCE_UPDATED') {
      const created = event.type === 'OPENING_BALANCE_CREATED'
      const fields = created ? ['fiscalYearId', 'sourceFiscalYearId', 'evidenceIds', 'lines'] : ['sourceFiscalYearId', 'evidenceIds', 'lines']
      if (!event.actorId || !event.companyId || change?.kind !== 'opening-balance' || change.eventType !== event.type
          || !change.journalId || !change.fiscalYearId || !Array.isArray(change.changedFields) || !change.changedFields.length
          || change.changedFields.some(field => !fields.includes(field)) || new Set(change.changedFields).size !== change.changedFields.length
          || !Number.isInteger(change.versionBefore) || change.versionBefore < (created ? 0 : 1) || (created && change.versionBefore !== 0)
          || !Number.isInteger(change.versionAfter) || change.versionAfter !== change.versionBefore + 1 || change.versionAfter > 2147483647
          || !Number.isInteger(change.lineCount) || !(change.lineCount === 0 || (change.lineCount >= 2 && change.lineCount <= 100))
          || !Number.isInteger(change.evidenceCount) || change.evidenceCount < (change.lineCount === 0 ? 0 : 1) || change.evidenceCount > 20)
        throw new Error('Invalid opening balance audit change')
      details = { journalId: change.journalId, fiscalYearId: change.fiscalYearId, changedFields: [...change.changedFields],
        versionBefore: change.versionBefore, versionAfter: change.versionAfter,
        lineCount: change.lineCount, evidenceCount: change.evidenceCount }
    } else if (event.type.startsWith('ACCOUNT_') && ['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DEACTIVATED'].includes(event.type)) {
      const created = event.type === 'ACCOUNT_CREATED', deactivated = event.type === 'ACCOUNT_DEACTIVATED'
      const fields = created ? ['code', 'name', 'category', 'normalBalance'] : deactivated ? ['active'] : ['name', 'category', 'normalBalance']
      if (!event.actorId || !event.companyId || change?.kind !== 'account' || change.eventType !== event.type || !change.accountId
          || !Array.isArray(change.changedFields) || !change.changedFields.length
          || change.changedFields.some(field => !fields.includes(field)) || new Set(change.changedFields).size !== change.changedFields.length
          || (change.changedFields.includes('category') !== change.changedFields.includes('normalBalance'))
          || !Number.isInteger(change.versionBefore) || change.versionBefore < (created ? 0 : 1)
          || (created && change.versionBefore !== 0) || !Number.isInteger(change.versionAfter) || change.versionAfter > 2147483647
          || change.versionAfter !== change.versionBefore + 1
          || typeof change.activeBefore !== 'boolean' || typeof change.activeAfter !== 'boolean'
          || (created ? (change.activeBefore || !change.activeAfter) : (!change.activeBefore || change.activeAfter === deactivated))) throw new Error('Invalid account audit change')
      details = { accountId: change.accountId, changedFields: [...change.changedFields], versionBefore: change.versionBefore,
        versionAfter: change.versionAfter, activeBefore: change.activeBefore, activeAfter: change.activeAfter }
    } else if (event.type === 'EVIDENCE_REGISTERED') {
      if (!event.actorId || !event.companyId || change?.kind !== 'evidence' || !change.evidenceId
          || !['RECEIPT', 'TAX_INVOICE', 'OTHER'].includes(change.evidenceKind)) throw new Error('Invalid evidence audit change')
      details = { evidenceId: change.evidenceId, kind: change.evidenceKind }
    } else if (event.type.startsWith('COUNTERPARTY_')) {
      const fields = ['name', 'kind', 'businessNumber', 'contactName', 'email', 'phone', 'address', 'memo', 'active']
      if (!event.actorId || !event.companyId || change?.kind !== 'counterparty' || change.eventType !== event.type
          || !change.counterpartyId || !Array.isArray(change.changedFields) || !change.changedFields.length
          || change.changedFields.some(field => !fields.includes(field)) || new Set(change.changedFields).size !== change.changedFields.length
          || !Number.isInteger(change.versionBefore) || change.versionBefore < 0
          || !Number.isInteger(change.versionAfter) || change.versionAfter !== change.versionBefore + 1
          || typeof change.activeBefore !== 'boolean' || typeof change.activeAfter !== 'boolean') throw new Error('Invalid counterparty audit change')
      const created = event.type === 'COUNTERPARTY_CREATED', deactivated = event.type === 'COUNTERPARTY_DEACTIVATED'
      if (created ? (change.versionBefore !== 0 || change.activeBefore || !change.activeAfter || change.changedFields.includes('active'))
        : (change.versionBefore < 1 || !change.activeBefore || change.activeAfter === deactivated
          || (deactivated ? change.changedFields.join(',') !== 'active' : change.changedFields.includes('active')))) throw new Error('Invalid counterparty audit change')
      // 외부 change 객체 전체를 직렬화하지 않는다. 실수로 전달한 번호/연락처/해시도 복사되지 않는다.
      details = { counterpartyId: change.counterpartyId, changedFields: [...change.changedFields],
        versionBefore: change.versionBefore, versionAfter: change.versionAfter, activeBefore: change.activeBefore, activeAfter: change.activeAfter }
    } else if (event.type === 'COMPANY_CREATED') {
      if (!event.actorId || !event.companyId || change?.kind !== 'created') throw new Error('Invalid company audit change')
      details = { name: change.name, fiscalYearId: change.fiscalYearId, startDate: change.startDate, endDate: change.endDate,
        version: change.version, creatorRole: 'COMPANY_ADMIN', otherSessionsRevoked: change.otherSessionsRevoked }
    } else if (event.type === 'COMPANY_RENAMED') {
      if (!event.actorId || !event.companyId || change?.kind !== 'renamed') throw new Error('Invalid company audit change')
      details = { nameBefore: change.nameBefore, nameAfter: change.nameAfter, versionBefore: change.versionBefore, versionAfter: change.versionAfter }
    } else if (event.type === 'FISCAL_YEAR_CREATED') {
      if (!event.actorId || !event.companyId || change?.kind !== 'fiscal-year') throw new Error('Invalid company audit change')
      details = { fiscalYearId: change.fiscalYearId, startDate: change.startDate, endDate: change.endDate,
        versionBefore: change.versionBefore, versionAfter: change.versionAfter }
    } else if (event.type === 'COMPANY_SELF_APPROVAL_CHANGED') {
      // [F01 본인 승인 감사 추가] 사건과 변경 종류/Boolean을 맞춘다. 요청 본문 전체나 임의 details를 복사하지 않는다.
      // 이 쓰기는 설정/version과 같은 TX에 속한다. 실패를 전파하여 부분 설정 변경을 취소한다.
      if (!event.actorId || !event.companyId || change?.kind !== 'self-approval'
          || typeof change.allowSelfApprovalBefore !== 'boolean' || typeof change.allowSelfApprovalAfter !== 'boolean') throw new Error('Invalid self approval audit change')
      details = { allowSelfApprovalBefore: change.allowSelfApprovalBefore, allowSelfApprovalAfter: change.allowSelfApprovalAfter,
        versionBefore: change.versionBefore, versionAfter: change.versionAfter }
    } else if (event.type === 'MEMBER_ROLES_CHANGED' || event.type === 'MEMBERSHIP_DEACTIVATED') {
      // [F01 구성원 감사 추가] 사건과 변경 종류를 맞추고 허용한 전후 상태만 직접 구성한다.
      const kind = event.type === 'MEMBER_ROLES_CHANGED' ? 'member-roles' : 'member-deactivated'
      if (!event.actorId || !event.companyId || (change?.kind !== 'member-roles' && change?.kind !== 'member-deactivated')
          || change.kind !== kind) throw new Error('Invalid membership audit change')
      details = { membershipId: change.membershipId, targetUserId: change.targetUserId,
        rolesBefore: [...change.rolesBefore], rolesAfter: [...change.rolesAfter], activeBefore: change.activeBefore, activeAfter: change.activeAfter,
        versionBefore: change.versionBefore, versionAfter: change.versionAfter, revokedSessions: change.revokedSessions }
    } else if (event.type.startsWith('INVITATION_') || event.type.startsWith('ACCESS_REQUEST_') || event.type === 'COMPANY_ACCESS_EXPIRED') {
      // [F01 초대/요청 감사] 이벤트/엔티티를 맞추고 ID·상태·역할·버전만 복사한다. 이메일/해시/원문은 제외한다.
      if (!event.actorId || !event.companyId || change?.kind !== 'access-flow' || change.eventType !== event.type
          || (event.type.startsWith('INVITATION_') && change.entity !== 'invitation')
          || (event.type.startsWith('ACCESS_REQUEST_') && change.entity !== 'request')
          || !['invitation', 'request'].includes(change.entity)) throw new Error('Invalid access flow audit change')
      details = { entity: change.entity, flowId: change.flowId, targetUserId: change.targetUserId,
        rolesBefore: [...change.rolesBefore], rolesAfter: [...change.rolesAfter], statusBefore: change.statusBefore, statusAfter: change.statusAfter,
        versionBefore: change.versionBefore, versionAfter: change.versionAfter, expiresAt: change.expiresAt, revokedSessions: change.revokedSessions }
    } else if (change) throw new Error('Unexpected company audit change')
    await tx.auditEvent.create({ data: {
      type: event.type, requestId: event.requestId, actorId: event.actorId ?? null, companyId: event.companyId ?? null,
      details,
    } })
  }
}
