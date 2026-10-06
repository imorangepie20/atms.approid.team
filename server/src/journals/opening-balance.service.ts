import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { hasPermission, type Permission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import { serializeAmount } from '../common/money'
import type { JournalEntry, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import { normalizeOpeningBalance, openingBalanceCreationHash, type NormalizedOpeningBalance } from './opening-balance'
import type { CreateOpeningBalanceInput, UpdateOpeningBalanceInput } from './opening-balance.schemas'

const include = { lines: { orderBy: { position: 'asc' as const } }, evidences: { orderBy: { evidenceId: 'asc' as const } } }
type FullOpening = Prisma.JournalEntryGetPayload<{ include: typeof include }>
const date = (value: Date) => value.toISOString().slice(0, 10)
const view = (row: FullOpening) => ({ id: row.id, kind: row.kind, number: row.number, fiscalYearId: row.fiscalYearId,
  sourceFiscalYearId: row.openingSourceFiscalYearId, accountingDate: date(row.accountingDate), memo: row.memo,
  currency: row.currency, status: row.status, version: row.version, isZero: row.lineCount === 0,
  debitTotal: serializeAmount(row.debitTotal), creditTotal: serializeAmount(row.creditTotal), lineCount: row.lineCount,
  evidenceCount: row.evidenceCount, createdById: row.createdById, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  lines: row.lines.map(line => ({ id: line.id, position: line.position, accountId: line.accountId,
    debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })),
  evidenceIds: row.evidences.map(link => link.evidenceId) })

@Injectable()
export class OpeningBalanceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService, @Inject(AuditService) private readonly audit: AuditService) {}

  private async scope(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string,
    permission: Permission, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m
        ON m.id=r.membership_id AND m.company_id=r.company_id
        WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(row => row.role), permission)) throw new ForbiddenException()
  }

  private async beginWrite(tx: Prisma.TransactionClient, companyId: string, context: AuthContext) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    await this.sessions.assertCurrent(tx, context)
    await this.scope(tx, companyId, context.user.id, 'journal.draft', true)
  }

  private async row(tx: Prisma.TransactionClient | PrismaService, companyId: string, fiscalYearId: string) {
    const row = await tx.journalEntry.findFirst({ where: { companyId, fiscalYearId, kind: 'OPENING' }, include })
    if (!row) throw new NotFoundException()
    return row
  }

  // [F04-02 O3/O5/O6] 회사 잠금 아래 대상 연도, 가장 가까운 전기, 계정과 READY 근거를 고정 순서로 검사한다.
  private async references(tx: Prisma.TransactionClient, companyId: string, fiscalYearId: string,
    content: NormalizedOpeningBalance) {
    await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${companyId}::uuid AND id=${fiscalYearId}::uuid FOR UPDATE`
    const year = await tx.fiscalYear.findUnique({ where: { companyId_id: { companyId, id: fiscalYearId } } })
    if (!year) throw new NotFoundException()
    const previous = await tx.fiscalYear.findFirst({ where: { companyId, endDate: { lt: year.startDate } }, orderBy: { endDate: 'desc' } })
    if ((previous?.id ?? null) !== content.sourceFiscalYearId) throw new ConflictException()
    if (content.sourceFiscalYearId)
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE company_id=${companyId}::uuid AND id=${content.sourceFiscalYearId}::uuid FOR UPDATE`
    for (const id of [...new Set(content.lines.map(line => line.accountId))].sort()) {
      await tx.$queryRaw`SELECT id FROM company_accounts WHERE company_id=${companyId}::uuid AND id=${id}::uuid FOR UPDATE`
      const account = await tx.companyAccount.findUnique({ where: { companyId_id: { companyId, id } } })
      if (!account) throw new NotFoundException()
      if (!account.active || !account.category || !account.normalBalance) throw new ConflictException()
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
    const after = await tx.journalNumberSequence.upsert({ where, create: { companyId, fiscalYearId, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } } })
    return `${date(startDate).replaceAll('-', '')}-${String(after.lastNumber).padStart(6, '0')}`
  }

  private async children(tx: Prisma.TransactionClient, row: JournalEntry, content: NormalizedOpeningBalance) {
    if (content.lines.length) await tx.journalLine.createMany({ data: content.lines.map(line => ({ ...line,
      companyId: row.companyId, journalId: row.id })) })
    if (content.evidenceIds.length) await tx.journalEvidence.createMany({ data: content.evidenceIds.map(evidenceId => ({
      companyId: row.companyId, journalId: row.id, evidenceId })) })
  }

  private async record(tx: Prisma.TransactionClient, context: AuthContext, requestId: string, row: JournalEntry,
    eventType: 'OPENING_BALANCE_CREATED' | 'OPENING_BALANCE_UPDATED', changedFields: string[], versionBefore: number) {
    await this.audit.record(tx, { type: eventType, actorId: context.user.id, companyId: row.companyId, requestId,
      change: { kind: 'opening-balance', eventType, journalId: row.id, fiscalYearId: row.fiscalYearId,
        changedFields, versionBefore, versionAfter: row.version, lineCount: row.lineCount, evidenceCount: row.evidenceCount } })
  }

  private conflict(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
    throw error
  }

  async get(companyId: string, fiscalYearId: string, userId: string) {
    await this.scope(this.db, companyId, userId, 'journal.read')
    return view(await this.row(this.db, companyId, fiscalYearId))
  }

  async create(companyId: string, fiscalYearId: string, context: AuthContext,
    input: CreateOpeningBalanceInput, requestId: string) {
    const content = normalizeOpeningBalance(input), inputHash = openingBalanceCreationHash(fiscalYearId, content)
    try {
      return await this.db.$transaction(async tx => {
        await this.beginWrite(tx, companyId, context)
        const repeated = await tx.journalEntry.findUnique({ where: { companyId_creationRequestId: {
          companyId, creationRequestId: input.creationRequestId } }, include })
        if (repeated) {
          if (repeated.kind !== 'OPENING' || repeated.fiscalYearId !== fiscalYearId || repeated.creationInputHash !== inputHash)
            throw new ConflictException()
          return view(repeated)
        }
        if (await tx.journalEntry.findFirst({ where: { companyId, fiscalYearId, kind: 'OPENING' }, select: { id: true } }))
          throw new ConflictException()
        const year = await this.references(tx, companyId, fiscalYearId, content)
        const number = await this.nextNumber(tx, companyId, fiscalYearId, year.startDate)
        const row = await tx.journalEntry.create({ data: { companyId, fiscalYearId, kind: 'OPENING',
          openingSourceFiscalYearId: content.sourceFiscalYearId, number, accountingDate: year.startDate, memo: '기초 잔액',
          counterpartyId: null, debitTotal: content.debitTotal, creditTotal: content.creditTotal,
          lineCount: content.lines.length, evidenceCount: content.evidenceIds.length, createdById: context.user.id,
          creationRequestId: input.creationRequestId, creationInputHash: inputHash } })
        await this.children(tx, row, content)
        await this.record(tx, context, requestId, row, 'OPENING_BALANCE_CREATED',
          ['fiscalYearId', 'sourceFiscalYearId', 'evidenceIds', 'lines'], 0)
        return view(await this.row(tx, companyId, fiscalYearId))
      }, { timeout: 15000 })
    } catch (error) { this.conflict(error) }
  }

  async update(companyId: string, fiscalYearId: string, context: AuthContext,
    input: UpdateOpeningBalanceInput, requestId: string) {
    const content = normalizeOpeningBalance(input)
    try {
      return await this.db.$transaction(async tx => {
        await this.beginWrite(tx, companyId, context)
        await tx.$queryRaw`SELECT id FROM journal_entries WHERE company_id=${companyId}::uuid
          AND fiscal_year_id=${fiscalYearId}::uuid AND kind='OPENING'::"JournalKind" FOR UPDATE`
        const before = await this.row(tx, companyId, fiscalYearId)
        if (before.status !== 'DRAFT' || before.version !== input.version) throw new ConflictException()
        await this.references(tx, companyId, fiscalYearId, content)
        const stored = normalizeOpeningBalance({ sourceFiscalYearId: before.openingSourceFiscalYearId,
          evidenceIds: before.evidences.map(link => link.evidenceId), lines: before.lines.map(line => ({
            accountId: line.accountId, debit: serializeAmount(line.debit), credit: serializeAmount(line.credit), memo: line.memo })) })
        const editable = ['sourceFiscalYearId', 'evidenceIds', 'lines'] as const
        const fields = editable.filter(field => JSON.stringify(stored[field]) !== JSON.stringify(content[field]))
        if (!fields.length) return view(before)
        if (before.version === 2147483647) throw new ConflictException()
        await tx.journalEvidence.deleteMany({ where: { companyId, journalId: before.id } })
        await tx.journalLine.deleteMany({ where: { companyId, journalId: before.id } })
        const after = await tx.journalEntry.update({ where: { companyId_id: { companyId, id: before.id } }, data: {
          openingSourceFiscalYearId: content.sourceFiscalYearId, debitTotal: content.debitTotal, creditTotal: content.creditTotal,
          lineCount: content.lines.length, evidenceCount: content.evidenceIds.length, version: { increment: 1 } } })
        await this.children(tx, after, content)
        await this.record(tx, context, requestId, after, 'OPENING_BALANCE_UPDATED', fields, before.version)
        return view(await this.row(tx, companyId, fiscalYearId))
      }, { timeout: 15000 })
    } catch (error) { this.conflict(error) }
  }
}
