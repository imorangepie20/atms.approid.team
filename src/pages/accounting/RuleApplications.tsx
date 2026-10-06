import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Filter, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import AsyncState from '../../components/common/AsyncState'
import RuleApplicationTable from '../../components/rules/RuleApplicationTable'
import { useAuth } from '../../context/AuthContext'
import { ApiError, companyApi, listRuleApplications } from '../../lib/api'

type DomainFilter = 'ALL' | 'ACCOUNTING' | 'TAX'

export default function RuleApplications() {
    const { expire } = useAuth()
    const [companyId, setCompanyId] = useState('')
    const [asOf, setAsOf] = useState('')
    const [domain, setDomain] = useState<DomainFilter>('ALL')
    const [search, setSearch] = useState('')
    const [cursorStack, setCursorStack] = useState<string[]>([])
    const cursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined

    useEffect(() => { document.title = '규칙 적용 현황 · ATMS' }, [])
    const companies = useQuery({
        queryKey: ['companies'],
        queryFn: ({ signal }) => companyApi.list(signal),
    })
    useEffect(() => {
        if (!companyId && companies.data?.items[0]) setCompanyId(companies.data.items[0].id)
    }, [companies.data, companyId])

    const rules = useQuery({
        queryKey: ['rule-applications', companyId, asOf, cursor ?? null],
        enabled: Boolean(companyId),
        queryFn: ({ signal }) => listRuleApplications(companyId, { asOf: asOf || undefined, cursor, limit: 25, signal }),
    })
    useEffect(() => {
        const error = companies.error ?? rules.error
        if (error instanceof ApiError && error.status === 401) expire()
    }, [companies.error, expire, rules.error])

    const filtered = useMemo(() => {
        const keyword = search.trim().toLocaleLowerCase('ko-KR')
        return (rules.data?.items ?? []).filter(item => {
            if (domain !== 'ALL' && item.rule.domain !== domain) return false
            if (!keyword) return true
            return [item.rule.name, item.rule.code, item.version.version, item.version.officialSourceTitle, item.version.legalProvision]
                .some(value => value.toLocaleLowerCase('ko-KR').includes(keyword))
        })
    }, [domain, rules.data, search])

    const resetServerPage = () => setCursorStack([])
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사 범위를 확인하고 있습니다." />
    if (companies.isError) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description="연결 상태를 확인한 뒤 다시 시도해 주세요." onRetry={() => { void companies.refetch() }} />
    if (companies.data.items.length === 0) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 조회 권한이 등록되면 규칙 적용 현황을 볼 수 있습니다." />

    return <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-medium text-hud-accent-primary">회계·세무 기준</p><h1 className="mt-1 text-2xl sm:text-3xl font-bold text-hud-text-primary">규칙 적용 현황</h1><p className="mt-2 text-sm text-hud-text-muted">회사와 기간에 연결된 불변 규칙 버전과 공식 근거를 조회합니다.</p></div>
            {rules.isFetching && <span role="status" aria-live="polite" className="text-sm text-hud-text-muted">목록 갱신 중…</span>}
        </header>

        <section aria-label="규칙 조회 조건" className="hud-card rounded-xl p-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div><label htmlFor="rule-company" className="block text-sm font-medium text-hud-text-secondary mb-2">회사</label><select id="rule-company" value={companyId}
                onChange={event => { setCompanyId(event.target.value); resetServerPage() }}
                className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                {companies.data.items.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select></div>
            <div><label htmlFor="rule-date" className="block text-sm font-medium text-hud-text-secondary mb-2">기준일</label><div className="relative"><CalendarDays aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted" /><input id="rule-date" type="date" value={asOf}
                onChange={event => { setAsOf(event.target.value); resetServerPage() }} className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary pl-10 pr-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div></div>
            <div><label htmlFor="rule-domain" className="block text-sm font-medium text-hud-text-secondary mb-2">구분</label><div className="relative"><Filter aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted" /><select id="rule-domain" value={domain} onChange={event => setDomain(event.target.value as DomainFilter)}
                className="w-full min-h-11 appearance-none rounded-lg border border-hud-border-secondary bg-hud-bg-primary pl-10 pr-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary"><option value="ALL">전체</option><option value="ACCOUNTING">회계</option><option value="TAX">세무</option></select></div></div>
            <div><label htmlFor="rule-search" className="block text-sm font-medium text-hud-text-secondary mb-2">현재 페이지 검색</label><div className="relative"><Search aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted" /><input id="rule-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="규칙명, 코드, 근거"
                className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary pl-10 pr-3 text-hud-text-primary placeholder:text-hud-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div></div>
        </section>

        {rules.isPending ? <AsyncState kind="loading" title="규칙 적용 현황을 불러오는 중입니다" description="선택한 회사의 규칙 버전과 적용 기간을 확인하고 있습니다." />
            : rules.isError ? <AsyncState kind="error" title="규칙 적용 현황을 불러오지 못했습니다" description="조회 권한이나 연결 상태를 확인한 뒤 다시 시도해 주세요." onRetry={() => { void rules.refetch() }} />
            : rules.data.items.length === 0 ? <AsyncState kind="empty" title="적용된 규칙이 없습니다" description="선택한 회사와 기준일에 연결된 규칙 버전이 없습니다. 임의의 기본 규칙은 적용하지 않습니다." />
            : filtered.length === 0 ? <AsyncState kind="empty" title="검색 조건과 일치하는 규칙이 없습니다" description="구분이나 검색어를 변경해 현재 페이지를 다시 확인해 주세요." />
            : <RuleApplicationTable items={filtered} pageNumber={cursorStack.length + 1} canPrevious={cursorStack.length > 0}
                canNext={Boolean(rules.data.nextCursor)} loading={rules.isFetching}
                onPrevious={() => setCursorStack(current => current.slice(0, -1))}
                onNext={() => { if (rules.data?.nextCursor) setCursorStack(current => [...current, rules.data!.nextCursor!]) }} />}
    </div>
}
