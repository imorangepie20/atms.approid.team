import { createHash } from 'node:crypto'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { hasPermission } from '../auth/access-policy'
import { serializeAmount } from '../common/money'
import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import type { AccountLedgerInput, JournalBookInput } from './ledger.schemas'

type Cursor = { accountingDate: string; journalNumber: string; position: number; lineId: string; filterHash: string }
type RawRow = { line_id: string; position: number; journal_id: string; journal_kind: 'STANDARD' | 'OPENING'; journal_number: string;
  accounting_date: Date | string; fiscal_year_id: string; journal_memo: string; line_memo: string | null; account_id: string;
  account_code: string; account_name: string; debit: Prisma.Decimal; credit: Prisma.Decimal; posted_at: Date;
  running_balance: Prisma.Decimal }
type RawTotals = { debit: Prisma.Decimal; credit: Prisma.Decimal; net: Prisma.Decimal }
type RawOpening = { journal_id: string; line_count: number; amount: Prisma.Decimal }

const dateOnly = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const amount = (value: Prisma.Decimal) => serializeAmount(new Prisma.Decimal(value))
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

@Injectable()
export class LedgerService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private async member(companyId: string, userId: string) {
    const membership = await this.db.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true } })
    if (!membership?.active || !hasPermission(membership.roles.map(row => row.role), 'journal.read')) throw new ForbiddenException()
  }

  private filterHash(kind: 'journal-book' | 'account-ledger', companyId: string,
    input: JournalBookInput | AccountLedgerInput, accountId?: string) {
    return hash({ kind, companyId, accountId: accountId ?? null, fiscalYearId: input.fiscalYearId ?? null,
      from: input.from ?? null, to: input.to ?? null, postedThrough: input.postedThrough ?? null,
      q: input.q ?? null, bookAccountId: 'accountId' in input ? input.accountId ?? null : null })
  }

  private decode(value: string | undefined, expectedHash: string): Cursor | null {
    if (!value) return null
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>
      const keys = Object.keys(parsed).sort().join(',')
      const cursorDate = typeof parsed.accountingDate === 'string' ? new Date(`${parsed.accountingDate}T00:00:00.000Z`) : null
      if (keys !== 'accountingDate,filterHash,journalNumber,lineId,position' ||
          typeof parsed.accountingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.accountingDate) ||
          !cursorDate || !Number.isFinite(cursorDate.valueOf()) || cursorDate.toISOString().slice(0, 10) !== parsed.accountingDate ||
          typeof parsed.journalNumber !== 'string' || !parsed.journalNumber ||
          !Number.isInteger(parsed.position) || (parsed.position ?? 0) < 1 || (parsed.position ?? 0) > 100 ||
          typeof parsed.lineId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.lineId) ||
          parsed.filterHash !== expectedHash) throw new Error('invalid')
      return parsed as Cursor
    } catch { throw new BadRequestException() }
  }

  private encode(row: RawRow, filterHash: string) {
    return Buffer.from(JSON.stringify({ accountingDate: dateOnly(row.accounting_date), journalNumber: row.journal_number,
      position: Number(row.position), lineId: row.line_id, filterHash }), 'utf8').toString('base64url')
  }

  private where(companyId: string, input: JournalBookInput | AccountLedgerInput, accountId?: string, standardOnly = false) {
    const parts: Prisma.Sql[] = [Prisma.sql`j.company_id=${companyId}::uuid`, Prisma.sql`j.status='POSTED'::"JournalStatus"`]
    if (standardOnly) parts.push(Prisma.sql`j.kind='STANDARD'::"JournalKind"`)
    if (input.fiscalYearId) parts.push(Prisma.sql`j.fiscal_year_id=${input.fiscalYearId}::uuid`)
    if (input.from) parts.push(Prisma.sql`j.accounting_date>=${input.from}::date`)
    if (input.to) parts.push(Prisma.sql`j.accounting_date<=${input.to}::date`)
    if (input.postedThrough) parts.push(Prisma.sql`p.posted_at<=${input.postedThrough}::timestamptz`)
    const selectedAccount = accountId ?? ('accountId' in input ? input.accountId : undefined)
    if (selectedAccount) parts.push(Prisma.sql`l.account_id=${selectedAccount}::uuid`)
    if (input.q) parts.push(Prisma.sql`(position(lower(${input.q}) in lower(j.number))>0 OR position(lower(${input.q}) in lower(j.memo))>0)`)
    return Prisma.join(parts, ' AND ')
  }

  private async rows(companyId: string, input: JournalBookInput | AccountLedgerInput,
    fingerprint: string, accountId?: string, standardOnly = false) {
    const cursor = this.decode(input.cursor, fingerprint), where = this.where(companyId, input, accountId, standardOnly)
    const rows = await this.db.$queryRaw<RawRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT l.id AS line_id,l.position,j.id AS journal_id,j.kind AS journal_kind,j.number AS journal_number,
          j.accounting_date,j.fiscal_year_id,j.memo AS journal_memo,l.memo AS line_memo,a.id AS account_id,
          a.code AS account_code,a.name AS account_name,l.debit,l.credit,p.posted_at,
          sum(l.debit-l.credit) OVER (ORDER BY j.accounting_date,j.number,l.position,l.id ROWS UNBOUNDED PRECEDING) AS running_balance
        FROM journal_entries j
        JOIN journal_postings p ON p.company_id=j.company_id AND p.journal_id=j.id
        JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id
        JOIN company_accounts a ON a.company_id=l.company_id AND a.id=l.account_id
        WHERE ${where}
      )
      SELECT * FROM filtered f
      WHERE ${cursor ? Prisma.sql`(f.accounting_date,f.journal_number,f.position,f.line_id) >
        (${cursor.accountingDate}::date,${cursor.journalNumber},${cursor.position},${cursor.lineId}::uuid)` : Prisma.sql`TRUE`}
      ORDER BY f.accounting_date,f.journal_number,f.position,f.line_id
      LIMIT ${input.limit + 1}`)
    const page = rows.slice(0, input.limit)
    return { rows: page, nextCursor: rows.length > input.limit ? this.encode(page.at(-1)!, fingerprint) : null }
  }

  private async totals(companyId: string, input: JournalBookInput | AccountLedgerInput,
    accountId?: string, standardOnly = false) {
    const where = this.where(companyId, input, accountId, standardOnly)
    const rows = await this.db.$queryRaw<RawTotals[]>(Prisma.sql`
      SELECT coalesce(sum(l.debit),0)::numeric AS debit,coalesce(sum(l.credit),0)::numeric AS credit,
        coalesce(sum(l.debit-l.credit),0)::numeric AS net
      FROM journal_entries j
      JOIN journal_postings p ON p.company_id=j.company_id AND p.journal_id=j.id
      JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id
      WHERE ${where}`)
    return { debit: amount(rows[0].debit), credit: amount(rows[0].credit), net: amount(rows[0].net), rawNet: rows[0].net }
  }

  private item(row: RawRow, carried = new Prisma.Decimal(0)) {
    return { id: row.line_id, position: Number(row.position), journalId: row.journal_id, kind: row.journal_kind,
      journalNumber: row.journal_number, fiscalYearId: row.fiscal_year_id, accountingDate: dateOnly(row.accounting_date),
      postedAt: row.posted_at.toISOString(), journalMemo: row.journal_memo, lineMemo: row.line_memo,
      account: { id: row.account_id, code: row.account_code, name: row.account_name },
      debit: amount(row.debit), credit: amount(row.credit), net: amount(new Prisma.Decimal(row.debit).minus(row.credit)),
      runningBalance: amount(carried.plus(row.running_balance)) }
  }

  async journalBook(companyId: string, userId: string, input: JournalBookInput) {
    await this.member(companyId, userId)
    if (input.accountId && !await this.db.companyAccount.findUnique({ where: { companyId_id: { companyId, id: input.accountId } }, select: { id: true } }))
      throw new NotFoundException()
    const fingerprint = this.filterHash('journal-book', companyId, input)
    const [page, totals] = await Promise.all([this.rows(companyId, input, fingerprint), this.totals(companyId, input)])
    const { rawNet: _rawNet, ...safeTotals } = totals
    return { items: page.rows.map(row => this.item(row)), nextCursor: page.nextCursor, totals: safeTotals }
  }

  // [F04-02 O8] opening은 당기 항목과 분리하고, 늦은 from 앞의 STANDARD 움직임을 이월 잔액에 더한다.
  async accountLedger(companyId: string, accountId: string, userId: string, input: AccountLedgerInput) {
    await this.member(companyId, userId)
    const [account, year] = await Promise.all([
      this.db.companyAccount.findUnique({ where: { companyId_id: { companyId, id: accountId } },
        select: { id: true, code: true, name: true, active: true, normalBalance: true } }),
      this.db.fiscalYear.findUnique({ where: { companyId_id: { companyId, id: input.fiscalYearId } } }),
    ])
    if (!account || !year) throw new NotFoundException()
    const start = dateOnly(year.startDate), end = dateOnly(year.endDate)
    if ((input.from && input.from < start) || (input.from && input.from > end)
        || (input.to && input.to < start) || (input.to && input.to > end)) throw new BadRequestException()
    const effective: AccountLedgerInput = { ...input, from: input.from ?? start, to: input.to ?? end }
    const cutoff = effective.postedThrough ? Prisma.sql`AND p.posted_at<=${effective.postedThrough}::timestamptz` : Prisma.empty
    const search = effective.q ? Prisma.sql`AND (position(lower(${effective.q}) in lower(j.number))>0 OR position(lower(${effective.q}) in lower(j.memo))>0)` : Prisma.empty
    const openingRows = await this.db.$queryRaw<RawOpening[]>(Prisma.sql`
      SELECT j.id AS journal_id,j.line_count,coalesce(sum(l.debit-l.credit),0)::numeric AS amount
      FROM journal_entries j JOIN journal_postings p ON p.company_id=j.company_id AND p.journal_id=j.id
      LEFT JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id AND l.account_id=${accountId}::uuid
      WHERE j.company_id=${companyId}::uuid AND j.fiscal_year_id=${input.fiscalYearId}::uuid
        AND j.kind='OPENING'::"JournalKind" AND j.status='POSTED'::"JournalStatus" ${cutoff}
      GROUP BY j.id,j.line_count`)
    const priorRows = await this.db.$queryRaw<RawTotals[]>(Prisma.sql`
      SELECT coalesce(sum(l.debit),0)::numeric AS debit,coalesce(sum(l.credit),0)::numeric AS credit,
        coalesce(sum(l.debit-l.credit),0)::numeric AS net
      FROM journal_entries j JOIN journal_postings p ON p.company_id=j.company_id AND p.journal_id=j.id
      JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id
      WHERE j.company_id=${companyId}::uuid AND j.fiscal_year_id=${input.fiscalYearId}::uuid
        AND j.kind='STANDARD'::"JournalKind" AND j.status='POSTED'::"JournalStatus" AND l.account_id=${accountId}::uuid
        AND j.accounting_date<${effective.from}::date ${cutoff} ${search}`)
    const baseOpening = openingRows[0]?.amount ?? new Prisma.Decimal(0)
    const carried = new Prisma.Decimal(baseOpening).plus(priorRows[0].net)
    const fingerprint = this.filterHash('account-ledger', companyId, input, accountId)
    const [page, totals] = await Promise.all([
      this.rows(companyId, effective, fingerprint, accountId, true), this.totals(companyId, effective, accountId, true),
    ])
    const opening = openingRows[0]
    const openingBalanceStatus = !opening ? 'MISSING' : opening.line_count === 0 ? 'CONFIRMED_ZERO' : 'POSTED'
    const { rawNet, ...safeTotals } = totals
    return { account, openingBalance: amount(carried), openingBalanceStatus,
      openingBalanceJournalId: opening?.journal_id ?? null, items: page.rows.map(row => this.item(row, carried)),
      nextCursor: page.nextCursor, totals: safeTotals, closingBalance: amount(carried.plus(rawNet)) }
  }
}
