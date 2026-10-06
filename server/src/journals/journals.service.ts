import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { hasPermission, type Permission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import { serializeAmount } from '../common/money'
import { toDateOnly } from '../companies/companies.schemas'
import type { JournalEntry, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import { journalCreationHash, normalizeJournal, type NormalizedJournal } from './journal-draft'
import type { CreateJournalInput, EvidenceJournalListInput, JournalListInput, UpdateJournalInput } from './journals.schemas'

const include = { lines: { orderBy: { position: 'asc' as const } }, evidences: { orderBy: { evidenceId: 'asc' as const } } }
type FullJournal = Prisma.JournalEntryGetPayload<{ include: typeof include }>
const date = (value: Date) => value.toISOString().slice(0, 10)
const summary = (row: JournalEntry) => ({ id: row.id, kind: row.kind, number: row.number, fiscalYearId: row.fiscalYearId,
  sourceFiscalYearId: row.openingSourceFiscalYearId,
  accountingDate: date(row.accountingDate), memo: row.memo, currency: row.currency, status: row.status, version: row.version,
  debitTotal: serializeAmount(row.debitTotal), creditTotal: serializeAmount(row.creditTotal), lineCount: row.lineCount, evidenceCount: row.evidenceCount,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
const detail = (row: FullJournal) => ({ ...summary(row), createdById: row.createdById, counterpartyId: row.counterpartyId,
  lines: row.lines.map(line => ({ id: line.id, position: line.position, accountId: line.accountId,
    debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })), evidenceIds: row.evidences.map(link => link.evidenceId) })
const editable = ['accountingDate', 'memo', 'counterpartyId', 'evidenceIds', 'lines'] as const

@Injectable()
export class JournalsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService, @Inject(AuditService) private readonly audit: AuditService) {}

  // [J5] guard의 결과를 역할 캐시처럼 신뢰하지 않는다. 현재 활성 소속/권한을 다시 읽는다.
  private async scope(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string, permission: Permission, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.id=r.membership_id AND m.company_id=r.company_id
        WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(row => row.role), permission)) throw new ForbiddenException()
  }
  private async beginWrite(tx: Prisma.TransactionClient, companyId: string, context: AuthContext) {
    // User→세션→회사→소속/역할. 계정 중지/거래처 수정도 같은 회사 잠금 아래 있으므로 참조 자격과 저장이 경합하지 않는다.
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    await this.sessions.assertCurrent(tx, context)
    await this.scope(tx, companyId, context.user.id, 'journal.draft', true)
  }
  private async row(tx: Prisma.TransactionClient | PrismaService, companyId: string, id: string) {
    const row = await tx.journalEntry.findUnique({ where: { companyId_id: { companyId, id } }, include })
    if (!row) throw new NotFoundException()
    return row
  }
  private conflict(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
    throw error
  }
  private async references(tx: Prisma.TransactionClient, companyId: string, fiscalYearId: string, content: NormalizedJournal) {
    await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${companyId}::uuid AND id=${fiscalYearId}::uuid FOR UPDATE`
    const year = await tx.fiscalYear.findUnique({ where: { companyId_id: { companyId, id: fiscalYearId } } })
    if (!year) throw new NotFoundException()
    if (content.accountingDate < date(year.startDate) || content.accountingDate > date(year.endDate)) throw new BadRequestException()
    // 정렬한 고유 ID만 잠근다. 같은 계정의 여러 분개는 입력 순서 그대로 남는다.
    for (const id of [...new Set(content.lines.map(line => line.accountId))].sort()) {
      await tx.$queryRaw`SELECT id FROM company_accounts WHERE company_id=${companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const account = await tx.companyAccount.findUnique({ where: { companyId_id: { companyId, id } } })
      if (!account) throw new NotFoundException()
      if (!account.active || !account.category || !account.normalBalance) throw new ConflictException()
    }
    if (content.counterpartyId) {
      await tx.$queryRaw`SELECT id FROM counterparties WHERE company_id=${companyId}::uuid AND id=${content.counterpartyId}::uuid FOR UPDATE`
      const party = await tx.counterparty.findUnique({ where: { companyId_id: { companyId, id: content.counterpartyId } } })
      if (!party) throw new NotFoundException()
      if (!party.active) throw new ConflictException()
    }
    for (const id of content.evidenceIds) {
      await tx.$queryRaw`SELECT id FROM evidences WHERE company_id=${companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const evidence = await tx.evidence.findUnique({ where: { companyId_id: { companyId, id } }, include: { upload: true } })
      if (!evidence) throw new NotFoundException()
      if (evidence.upload.state !== 'READY') throw new ConflictException()
    }
    return year
  }
  private async nextNumber(tx: Prisma.TransactionClient, companyId: string, fiscalYearId: string, startDate: Date) {
    const where = { companyId_fiscalYearId: { companyId, fiscalYearId } }
    const before = await tx.journalNumberSequence.findUnique({ where })
    if (before && before.lastNumber >= 999999) throw new ConflictException()
    const after = await tx.journalNumberSequence.upsert({ where, create: { companyId, fiscalYearId, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } })
    return `${date(startDate).replaceAll('-', '')}-${String(after.lastNumber).padStart(6, '0')}`
  }
  private async children(tx: Prisma.TransactionClient, row: JournalEntry, content: NormalizedJournal) {
    // [J6/J7] 지연 제약은 이 과정의 중간 빈 목록을 통과시키고 TX 커밋 시 완성된 상태를 검사한다.
    await tx.journalLine.createMany({ data: content.lines.map(line => ({ ...line, companyId: row.companyId, journalId: row.id })) })
    if (content.evidenceIds.length) await tx.journalEvidence.createMany({ data: content.evidenceIds.map(evidenceId => ({ companyId: row.companyId, journalId: row.id, evidenceId })) })
  }
  private async record(tx: Prisma.TransactionClient, context: AuthContext, requestId: string, row: JournalEntry,
    eventType: 'JOURNAL_DRAFT_CREATED' | 'JOURNAL_DRAFT_UPDATED', changedFields: string[], versionBefore: number) {
    await this.audit.record(tx, { type: eventType, actorId: context.user.id, companyId: row.companyId, requestId,
      change: { kind: 'journal-draft', eventType, journalId: row.id, changedFields, versionBefore, versionAfter: row.version,
        statusBefore: versionBefore === 0 ? null : 'DRAFT', statusAfter: 'DRAFT', lineCount: row.lineCount, evidenceCount: row.evidenceCount } })
  }
  async create(companyId: string, context: AuthContext, input: CreateJournalInput, requestId: string) {
    const content = normalizeJournal(input), inputHash = journalCreationHash(input.fiscalYearId, content)
    try {
      return await this.db.$transaction(async tx => {
        await this.beginWrite(tx, companyId, context)
        const existing = await tx.journalEntry.findUnique({ where: { companyId_creationRequestId: { companyId, creationRequestId: input.creationRequestId } }, include })
        if (existing) {
          if (existing.kind !== 'STANDARD' || existing.creationInputHash !== inputHash) throw new ConflictException()
          return detail(existing) // [J6] 최초 입력으로 식별하되 현재 저장 상태를 반환한다. 번호/감사를 새로 만들지 않는다.
        }
        const year = await this.references(tx, companyId, input.fiscalYearId, content)
        const number = await this.nextNumber(tx, companyId, year.id, year.startDate)
        const row = await tx.journalEntry.create({ data: { companyId, fiscalYearId: year.id, kind: 'STANDARD', number,
          accountingDate: toDateOnly(content.accountingDate),
          memo: content.memo, counterpartyId: content.counterpartyId, debitTotal: content.debitTotal, creditTotal: content.creditTotal,
          lineCount: content.lines.length, evidenceCount: content.evidenceIds.length, createdById: context.user.id,
          creationRequestId: input.creationRequestId, creationInputHash: inputHash } })
        await this.children(tx, row, content)
        await this.record(tx, context, requestId, row, 'JOURNAL_DRAFT_CREATED', ['fiscalYearId', ...editable], 0)
        return detail(await this.row(tx, companyId, row.id))
      }, { timeout: 15000 })
    } catch (error) { this.conflict(error) }
  }
  async update(companyId: string, context: AuthContext, id: string, input: UpdateJournalInput, requestId: string) {
    const content = normalizeJournal(input)
    try {
      return await this.db.$transaction(async tx => {
        await this.beginWrite(tx, companyId, context)
        await tx.$queryRaw`SELECT id FROM journal_entries WHERE company_id=${companyId}::uuid AND id=${id}::uuid FOR UPDATE`
        const before = await this.row(tx, companyId, id)
        if (before.kind !== 'STANDARD' || before.status !== 'DRAFT' || before.version !== input.version) throw new ConflictException()
        const year = await tx.fiscalYear.findUnique({ where: { companyId_id: { companyId, id: before.fiscalYearId } } })
        // [J2] 등록 후 다른 회계연도로 이동하지 않는다. 단순 잘못된 날짜 입력과 이 불변성 충돌을 구분한다.
        if (!year || content.accountingDate < date(year.startDate) || content.accountingDate > date(year.endDate)) throw new ConflictException()
        await this.references(tx, companyId, before.fiscalYearId, content)
        const stored = normalizeJournal({ accountingDate: date(before.accountingDate), memo: before.memo, counterpartyId: before.counterpartyId,
          evidenceIds: before.evidences.map(link => link.evidenceId), lines: before.lines.map(line => ({ accountId: line.accountId,
            debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) })
        const fields = editable.filter(field => JSON.stringify(stored[field]) !== JSON.stringify(content[field]))
        if (!fields.length) return detail(before)
        if (before.version === 2147483647) throw new ConflictException()
        // 헤더 ID/번호/최초 요청 해시/작성자는 유지하며 DRAFT 분개만 교체한다.
        await tx.journalEvidence.deleteMany({ where: { companyId, journalId: id } })
        await tx.journalLine.deleteMany({ where: { companyId, journalId: id } })
        const after = await tx.journalEntry.update({ where: { companyId_id: { companyId, id } }, data: { accountingDate: toDateOnly(content.accountingDate),
          memo: content.memo, counterpartyId: content.counterpartyId, debitTotal: content.debitTotal, creditTotal: content.creditTotal,
          lineCount: content.lines.length, evidenceCount: content.evidenceIds.length, version: { increment: 1 } } })
        await this.children(tx, after, content); await this.record(tx, context, requestId, after, 'JOURNAL_DRAFT_UPDATED', fields, before.version)
        return detail(await this.row(tx, companyId, id))
      }, { timeout: 15000 })
    } catch (error) { this.conflict(error) }
  }
  private async page(where: Prisma.JournalEntryWhereInput, input: EvidenceJournalListInput) {
    if (input.cursor && !await this.db.journalEntry.findFirst({ where: { AND: [where, { id: input.cursor }] } })) throw new BadRequestException()
    const rows = await this.db.journalEntry.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(summary)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async list(companyId: string, userId: string, input: JournalListInput) {
    await this.scope(this.db, companyId, userId, 'journal.read')
    const where: Prisma.JournalEntryWhereInput = { companyId, kind: 'STANDARD', status: 'DRAFT',
      ...(input.fiscalYearId ? { fiscalYearId: input.fiscalYearId } : {}),
      ...(input.from || input.to ? { accountingDate: { ...(input.from ? { gte: toDateOnly(input.from) } : {}), ...(input.to ? { lte: toDateOnly(input.to) } : {}) } } : {}),
      ...(input.q ? { OR: [{ number: { contains: input.q } }, { memo: { contains: input.q, mode: 'insensitive' } }] } : {}) }
    return this.page(where, input)
  }
  async detail(companyId: string, userId: string, id: string) {
    await this.scope(this.db, companyId, userId, 'journal.read'); return detail(await this.row(this.db, companyId, id))
  }
  async forEvidence(companyId: string, userId: string, evidenceId: string, input: EvidenceJournalListInput) {
    await this.scope(this.db, companyId, userId, 'journal.read'); await this.scope(this.db, companyId, userId, 'evidence.read')
    if (!await this.db.evidence.findUnique({ where: { companyId_id: { companyId, id: evidenceId } }, select: { id: true } })) throw new NotFoundException()
    return this.page({ companyId, kind: 'STANDARD', status: 'DRAFT', evidences: { some: { companyId, evidenceId } } }, input)
  }
}
