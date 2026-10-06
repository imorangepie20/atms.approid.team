import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { canPerform, hasPermission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import { serializeAmount } from '../common/money'
import type { JournalEntry, JournalWorkflowActionKind, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import { normalizeJournal } from './journal-draft'
import { workflowInputHash, workflowTransitions } from './journal-workflow'
import type { WorkflowActionInput, WorkflowHistoryInput, WorkflowListInput, WorkflowRejectInput } from './journal-workflow.schemas'
import { normalizeOpeningBalance } from './opening-balance'

const date = (value: Date) => value.toISOString().slice(0, 10)
const full = { lines: { orderBy: { position: 'asc' as const } }, evidences: { orderBy: { evidenceId: 'asc' as const } } }
type FullJournal = Prisma.JournalEntryGetPayload<{ include: typeof full }>
const summary = (row: JournalEntry) => ({ id: row.id, kind: row.kind, number: row.number, fiscalYearId: row.fiscalYearId,
  sourceFiscalYearId: row.openingSourceFiscalYearId,
  accountingDate: date(row.accountingDate), memo: row.memo, currency: row.currency, status: row.status, version: row.version,
  debitTotal: serializeAmount(row.debitTotal), creditTotal: serializeAmount(row.creditTotal), lineCount: row.lineCount,
  evidenceCount: row.evidenceCount, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
const view = (row: FullJournal) => ({ ...summary(row), createdById: row.createdById, counterpartyId: row.counterpartyId,
  evidenceIds: row.evidences.map(link => link.evidenceId),
  lines: row.lines.map(line => ({ id: line.id, position: line.position, accountId: line.accountId,
    debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) })
const permission = (action: JournalWorkflowActionKind) => action === 'SUBMIT' ? 'journal.request' as const
  : action === 'RETURN_TO_DRAFT' ? 'journal.draft' as const
    : action === 'CONFIRM' ? 'journal.confirm' as const : 'journal.approve' as const
const auditType = { SUBMIT: 'JOURNAL_SUBMITTED', APPROVE: 'JOURNAL_APPROVED', REJECT: 'JOURNAL_REJECTED',
  RETURN_TO_DRAFT: 'JOURNAL_RETURNED_TO_DRAFT', CONFIRM: 'JOURNAL_POSTED' } as const

@Injectable()
export class JournalWorkflowService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService) {}

  // [F05 W3/W6] guard 통과 이후에도 쓰기 안에서 사용자→세션→회사→소속/역할 순서로 재검사한다.
  private async member(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.id=r.membership_id AND m.company_id=r.company_id
        WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } },
      include: { company: true, roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(row => row.role), 'journal.read')) throw new ForbiddenException()
    return member
  }

  private async row(tx: Prisma.TransactionClient | PrismaService, companyId: string, journalId: string) {
    const row = await tx.journalEntry.findUnique({ where: { companyId_id: { companyId, id: journalId } }, include: full })
    if (!row) throw new NotFoundException()
    return row
  }

  // [F04-02 O6/O7] OPENING도 같은 workflow를 쓰되 제출 직전에 연도·출처·0원/근거 규칙을 다시 잠가 동결한다.
  private async openingSubmissionContent(tx: Prisma.TransactionClient, row: FullJournal): Promise<Prisma.InputJsonObject> {
    const content = normalizeOpeningBalance({ sourceFiscalYearId: row.openingSourceFiscalYearId,
      evidenceIds: row.evidences.map(link => link.evidenceId), lines: row.lines.map(line => ({ accountId: line.accountId,
        debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) })
    if (row.memo !== '기초 잔액' || row.currency !== 'KRW' || row.counterpartyId !== null
        || content.debitTotal !== serializeAmount(row.debitTotal) || content.creditTotal !== serializeAmount(row.creditTotal)
        || content.lines.length !== row.lineCount || content.evidenceIds.length !== row.evidenceCount) throw new ConflictException()
    await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${row.companyId}::uuid AND id=${row.fiscalYearId}::uuid FOR UPDATE`
    const year = await tx.fiscalYear.findUnique({ where: { companyId_id: { companyId: row.companyId, id: row.fiscalYearId } } })
    if (!year || date(row.accountingDate) !== date(year.startDate)) throw new ConflictException()
    const previous = await tx.fiscalYear.findFirst({ where: { companyId: row.companyId, endDate: { lt: year.startDate } },
      orderBy: { endDate: 'desc' } })
    if ((previous?.id ?? null) !== content.sourceFiscalYearId) throw new ConflictException()
    if (content.sourceFiscalYearId)
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${row.companyId}::uuid AND id=${content.sourceFiscalYearId}::uuid FOR UPDATE`
    for (const id of [...new Set(content.lines.map(line => line.accountId))].sort()) {
      await tx.$queryRaw`SELECT id FROM company_accounts WHERE company_id=${row.companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const account = await tx.companyAccount.findUnique({ where: { companyId_id: { companyId: row.companyId, id } } })
      if (!account || !account.active || !account.category || !account.normalBalance) throw new ConflictException()
    }
    for (const id of content.evidenceIds) {
      await tx.$queryRaw`SELECT id FROM evidences WHERE company_id=${row.companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const evidence = await tx.evidence.findUnique({ where: { companyId_id: { companyId: row.companyId, id } }, include: { upload: true } })
      if (!evidence || evidence.upload.state !== 'READY') throw new ConflictException()
    }
    return { kind: 'OPENING', sourceFiscalYearId: content.sourceFiscalYearId, isZero: content.isZero,
      evidenceIds: content.evidenceIds, lines: row.lines.map(line => ({ id: line.id, position: line.position,
        accountId: line.accountId, debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) }
  }

  // [F05 W4] 제출 때 저장된 분개를 다시 정규화하고 모든 업무 참조의 현재 자격을 잠금 아래 확인한다.
  private async submissionContent(tx: Prisma.TransactionClient, row: FullJournal): Promise<Prisma.InputJsonObject> {
    if (row.kind === 'OPENING') return this.openingSubmissionContent(tx, row)
    const content = normalizeJournal({ accountingDate: date(row.accountingDate), memo: row.memo,
      counterpartyId: row.counterpartyId, evidenceIds: row.evidences.map(link => link.evidenceId),
      lines: row.lines.map(line => ({ accountId: line.accountId, debit: serializeAmount(line.debit),
        credit: serializeAmount(line.credit), memo: line.memo })) })
    if (content.debitTotal !== serializeAmount(row.debitTotal) || content.creditTotal !== serializeAmount(row.creditTotal)
        || content.lines.length !== row.lineCount || content.evidenceIds.length !== row.evidenceCount) throw new ConflictException()
    await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${row.companyId}::uuid AND id=${row.fiscalYearId}::uuid FOR UPDATE`
    const year = await tx.fiscalYear.findUnique({ where: { companyId_id: { companyId: row.companyId, id: row.fiscalYearId } } })
    if (!year || content.accountingDate < date(year.startDate) || content.accountingDate > date(year.endDate)) throw new ConflictException()
    for (const id of [...new Set(content.lines.map(line => line.accountId))].sort()) {
      await tx.$queryRaw`SELECT id FROM company_accounts WHERE company_id=${row.companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const account = await tx.companyAccount.findUnique({ where: { companyId_id: { companyId: row.companyId, id } } })
      if (!account || !account.active || !account.category || !account.normalBalance) throw new ConflictException()
    }
    if (content.counterpartyId) {
      await tx.$queryRaw`SELECT id FROM counterparties WHERE company_id=${row.companyId}::uuid AND id=${content.counterpartyId}::uuid FOR UPDATE`
      const party = await tx.counterparty.findUnique({ where: { companyId_id: { companyId: row.companyId, id: content.counterpartyId } } })
      if (!party || !party.active) throw new ConflictException()
    }
    for (const id of content.evidenceIds) {
      await tx.$queryRaw`SELECT id FROM evidences WHERE company_id=${row.companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const evidence = await tx.evidence.findUnique({ where: { companyId_id: { companyId: row.companyId, id } }, include: { upload: true } })
      if (!evidence || evidence.upload.state !== 'READY') throw new ConflictException()
    }
    return { accountingDate: content.accountingDate, memo: content.memo, counterpartyId: content.counterpartyId,
      evidenceIds: content.evidenceIds, lines: row.lines.map(line => ({ id: line.id, position: line.position,
        accountId: line.accountId, debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) }
  }

  async transition(companyId: string, journalId: string, context: AuthContext, action: JournalWorkflowActionKind,
    input: WorkflowActionInput | WorkflowRejectInput, requestId: string) {
    const hash = workflowInputHash(journalId, action, input)
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
        await this.sessions.assertCurrent(tx, context)
        const member = await this.member(tx, companyId, context.user.id, true)
        await tx.$queryRaw`SELECT id FROM journal_entries WHERE company_id=${companyId}::uuid AND id=${journalId}::uuid FOR UPDATE`
        const row = await this.row(tx, companyId, journalId)
        const roles = member.roles.map(item => item.role)
        if (!canPerform(roles, permission(action), { stateAllowed: true, userId: context.user.id,
          authorId: row.createdById, allowSelfApproval: member.company.allowSelfApproval })) throw new ForbiddenException()
        const repeated = await tx.journalWorkflowAction.findUnique({ where: { companyId_actionRequestId: { companyId, actionRequestId: input.actionRequestId } } })
        if (repeated) {
          if (repeated.journalId !== journalId || repeated.action !== action || repeated.inputHash !== hash) throw new ConflictException()
          return { id: repeated.id, status: repeated.statusAfter, version: repeated.versionAfter }
        }
        const { before, after } = workflowTransitions[action]
        if (row.status !== before || row.version !== input.version || row.version === 2147483647) throw new ConflictException()
        const latest = await tx.journalSubmission.findFirst({ where: { companyId, journalId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
        let submissionId = latest?.id
        if (action === 'SUBMIT') {
          const content = await this.submissionContent(tx, row)
          const submission = await tx.journalSubmission.create({ data: { companyId, journalId, content, createdById: context.user.id } })
          submissionId = submission.id
        }
        if (!submissionId) throw new ConflictException()
        const updated = await tx.journalEntry.update({ where: { companyId_id: { companyId, id: journalId } },
          data: { status: after, version: { increment: 1 } } })
        const recorded = await tx.journalWorkflowAction.create({ data: { companyId, journalId, submissionId,
          actionRequestId: input.actionRequestId, action, inputHash: hash, statusBefore: before, statusAfter: after,
          versionBefore: row.version, versionAfter: updated.version, actorId: context.user.id,
          reason: action === 'REJECT' ? (input as WorkflowRejectInput).reason : null } })
        // [F05-01 확정] action과 같은 트랜잭션/시각으로 불변 posting을 만든다. 실패하면 상태·이력·감사도 함께 롤백된다.
        if (action === 'CONFIRM') await tx.journalPosting.create({ data: { companyId, journalId, submissionId,
          actionId: recorded.id, actorId: context.user.id, postedAt: recorded.createdAt } })
        await this.audit.record(tx, { type: auditType[action], actorId: context.user.id, companyId, requestId,
          change: { kind: 'journal-workflow', eventType: auditType[action], journalId, actionId: recorded.id,
            statusBefore: before as 'DRAFT' | 'SUBMITTED' | 'REJECTED' | 'APPROVED', statusAfter: after,
            versionBefore: row.version, versionAfter: updated.version } })
        return { id: recorded.id, status: after, version: updated.version }
      }, { timeout: 15000 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
      throw error
    }
  }

  async list(companyId: string, userId: string, input: WorkflowListInput) {
    await this.member(this.db, companyId, userId)
    const where: Prisma.JournalEntryWhereInput = { companyId, status: input.status,
      ...(input.fiscalYearId ? { fiscalYearId: input.fiscalYearId } : {}),
      ...(input.from || input.to ? { accountingDate: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00.000Z`) } : {}),
        ...(input.to ? { lte: new Date(`${input.to}T00:00:00.000Z`) } : {}) } } : {}),
      ...(input.q ? { OR: [{ number: { contains: input.q } }, { memo: { contains: input.q, mode: 'insensitive' } }] } : {}) }
    if (input.cursor && !await this.db.journalEntry.findFirst({ where: { AND: [where, { id: input.cursor }] } })) throw new BadRequestException()
    const rows = await this.db.journalEntry.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] },
      orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(summary)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }

  async detail(companyId: string, journalId: string, userId: string, input: WorkflowHistoryInput) {
    const member = await this.member(this.db, companyId, userId)
    const row = await this.row(this.db, companyId, journalId)
    const cursor = input.cursor ? await this.db.journalWorkflowAction.findFirst({ where: { companyId, journalId, id: input.cursor } }) : null
    if (input.cursor && !cursor) throw new BadRequestException()
    const rows = await this.db.journalWorkflowAction.findMany({ where: { companyId, journalId,
      ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) },
      include: { submission: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(item => ({ id: item.id, action: item.action, statusBefore: item.statusBefore,
      statusAfter: item.statusAfter, versionBefore: item.versionBefore, versionAfter: item.versionAfter,
      actorId: item.actorId, reason: item.reason, createdAt: item.createdAt.toISOString(),
      submission: { id: item.submission.id, content: item.submission.content,
        createdById: item.submission.createdById, createdAt: item.submission.createdAt.toISOString() } }))
    const roles = member.roles.map(item => item.role)
    // [F05 B4 확정 화면] 화면이 역할이나 상태를 추론하지 않도록 CONFIRM도 현재 DB 권한·본인 승인 설정을 통과한 경우에만 반환한다.
    const allowedActions = (Object.keys(workflowTransitions) as JournalWorkflowActionKind[]).filter(action =>
      row.status === workflowTransitions[action].before && canPerform(roles, permission(action), {
        stateAllowed: true, userId, authorId: row.createdById, allowSelfApproval: member.company.allowSelfApproval }))
    return { journal: view(row), allowedActions, history: { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null } }
  }
}
