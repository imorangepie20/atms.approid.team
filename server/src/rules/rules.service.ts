import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import { toDateOnly } from '../companies/companies.schemas'
import type { RuleApplicationListInput } from './rules.schemas'

const readableRoles = ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as const
const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null

@Injectable()
export class RulesService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async list(companyId: string, userId: string, input: RuleApplicationListInput) {
    const asOf = input.asOf ? toDateOnly(input.asOf) : null
    // [F13 조회 경계] 전역 guard 뒤에도 같은 SQL 조건에서 현재 활성 소속과 조회 역할을 다시 확인한다.
    // 권한이 회수되면 행이 0개가 되며 다른 회사의 규칙 적용 ID를 cursor로 사용할 수 없다.
    const scope: Prisma.CompanyRuleApplicationWhereInput = {
      companyId,
      company: { memberships: { some: { userId, active: true,
        roles: { some: { role: { in: [...readableRoles] } } } } } },
      ...(asOf ? { effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] } : {}),
    }
    if (input.cursor && !await this.db.companyRuleApplication.findFirst({ where: { AND: [scope, { id: input.cursor }] }, select: { id: true } })) {
      throw new BadRequestException()
    }
    const rows = await this.db.companyRuleApplication.findMany({
      where: { AND: [scope, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] }, orderBy: { id: 'asc' }, take: input.limit + 1,
      include: { ruleSet: true, ruleVersion: { include: { artifacts: { orderBy: [{ kind: 'asc' }, { version: 'asc' }] } } } },
    })
    const items = rows.slice(0, input.limit).map(row => ({
      id: row.id, effectiveFrom: dateOnly(row.effectiveFrom), effectiveTo: dateOnly(row.effectiveTo),
      rule: { id: row.ruleSet.id, domain: row.ruleSet.domain, jurisdiction: row.ruleSet.jurisdiction,
        code: row.ruleSet.code, name: row.ruleSet.name },
      version: { id: row.ruleVersion.id, version: row.ruleVersion.version,
        officialSourceTitle: row.ruleVersion.officialSourceTitle, officialSourceUrl: row.ruleVersion.officialSourceUrl,
        legalProvision: row.ruleVersion.legalProvision, promulgatedOn: dateOnly(row.ruleVersion.promulgatedOn),
        effectiveFrom: dateOnly(row.ruleVersion.effectiveFrom), effectiveTo: dateOnly(row.ruleVersion.effectiveTo),
        applicableFrom: dateOnly(row.ruleVersion.applicableFrom), applicableTo: dateOnly(row.ruleVersion.applicableTo),
        companyConditions: row.ruleVersion.companyConditions, transitionalProvisions: row.ruleVersion.transitionalProvisions,
        artifacts: row.ruleVersion.artifacts.map(artifact => ({ id: artifact.id, kind: artifact.kind, version: artifact.version,
          repositoryLocator: artifact.repositoryLocator, contentSha256: artifact.contentSha256, metadata: artifact.metadata })) },
    }))
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
}
