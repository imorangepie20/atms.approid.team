import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ExternalLink } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { flexRender } from '@tanstack/react-table'
import { getCoreRowModel, getSortedRowModel, type LegacyColumnDef, useLegacyTable } from '@tanstack/react-table/legacy'
import type { RuleApplicationView } from '../../lib/api'
import Button from '../common/Button'

interface Props {
    items: RuleApplicationView[]
    pageNumber: number
    canPrevious: boolean
    canNext: boolean
    loading: boolean
    onPrevious: () => void
    onNext: () => void
}

const period = (from: string, to: string | null) => `${from} ~ ${to ?? '계속'}`
const domainLabel = { ACCOUNTING: '회계', TAX: '세무' } as const
const artifactLabel = { CONFIG: '설정', CALCULATION: '계산', ACCOUNT_MAPPING: '계정 매핑', FORM: '서식' } as const

function RuleDetails({ item }: { item: RuleApplicationView }) {
    return <div className="grid gap-5 p-4 sm:grid-cols-2 bg-hud-bg-primary/60 border-t border-hud-border-secondary text-sm">
        <div>
            <h3 className="font-semibold text-hud-text-primary">공식 근거</h3>
            <p className="mt-2 text-hud-text-secondary">{item.version.legalProvision}</p>
            <a href={item.version.officialSourceUrl} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-hud-accent-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                {item.version.officialSourceTitle}<ExternalLink size={15} aria-hidden="true" />
            </a>
            <p className="text-xs text-hud-text-muted">규칙 유효: {period(item.version.effectiveFrom, item.version.effectiveTo)}</p>
            <p className="text-xs text-hud-text-muted">적용 가능: {period(item.version.applicableFrom, item.version.applicableTo)}</p>
        </div>
        <div>
            <h3 className="font-semibold text-hud-text-primary">연결 아티팩트 {item.version.artifacts.length}개</h3>
            {item.version.artifacts.length === 0 ? <p className="mt-2 text-hud-text-muted">연결된 아티팩트가 없습니다.</p> :
                <ul className="mt-2 space-y-2">{item.version.artifacts.map(artifact => <li key={artifact.id} className="rounded-lg border border-hud-border-secondary p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-hud-text-primary">{artifactLabel[artifact.kind]} · {artifact.version}</span><code className="text-xs text-hud-text-muted">{artifact.contentSha256.slice(0, 12)}…</code></div>
                    <p className="mt-1 break-all text-xs text-hud-text-secondary">{artifact.repositoryLocator}</p>
                </li>)}</ul>}
        </div>
    </div>
}

export default function RuleApplicationTable({ items, pageNumber, canPrevious, canNext, loading, onPrevious, onNext }: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
    const toggle = (id: string) => setExpanded(current => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
    })
    const columns = useMemo<LegacyColumnDef<RuleApplicationView>[]>(() => [
        { id: 'domain', header: '구분', accessorFn: row => domainLabel[row.rule.domain] },
        { id: 'rule', header: '규칙', accessorFn: row => `${row.rule.name} ${row.rule.code}`,
            cell: info => <div><p className="font-medium text-hud-text-primary">{info.row.original.rule.name}</p><p className="text-xs text-hud-text-muted">{info.row.original.rule.code}</p></div> },
        { id: 'version', header: '버전', accessorFn: row => row.version.version },
        { id: 'period', header: '회사 적용 기간', accessorFn: row => row.effectiveFrom,
            cell: info => period(info.row.original.effectiveFrom, info.row.original.effectiveTo) },
        { id: 'source', header: '근거', accessorFn: row => row.version.officialSourceTitle },
    ], [])
    const table = useLegacyTable({ data: items, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() })

    return <section aria-label="규칙 적용 목록" className="space-y-4">
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-hud-border-secondary bg-hud-bg-card">
            <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-hud-bg-secondary text-hud-text-secondary">{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" className="px-4 py-3 font-medium">
                    {header.isPlaceholder ? null : <button type="button" onClick={header.column.getToggleSortingHandler()} disabled={!header.column.getCanSort()}
                        className="inline-flex min-h-11 items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                        {flexRender(header.column.columnDef.header, header.getContext())}<ChevronsUpDown size={14} aria-hidden="true" />
                    </button>}
                </th>)}</tr>)}</thead>
                <tbody>{table.getRowModel().rows.map(row => {
                    const open = expanded.has(row.original.id)
                    return <Fragment key={row.id}>{/* stable rule application ID preserves row/detail identity while sorting. */}
                        <tr className="border-t border-hud-border-secondary text-hud-text-secondary">
                            {row.getVisibleCells().map(cell => <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                            <td className="px-2"><button type="button" aria-expanded={open} aria-controls={`rule-detail-${row.original.id}`} onClick={() => toggle(row.original.id)}
                                className="min-h-11 min-w-11 grid place-items-center rounded-lg text-hud-text-secondary hover:bg-hud-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                                <span className="sr-only">{row.original.rule.name} 상세 {open ? '닫기' : '열기'}</span><ChevronDown size={18} aria-hidden="true" className={open ? 'rotate-180' : ''} />
                            </button></td>
                        </tr>
                        {open && <tr key={`${row.id}-details`}><td id={`rule-detail-${row.original.id}`} colSpan={columns.length + 1}><RuleDetails item={row.original} /></td></tr>}
                    </Fragment>
                })}</tbody>
            </table>
        </div>

        <div className="grid gap-4 lg:hidden">{items.map(item => {
            const open = expanded.has(item.id)
            return <article key={item.id} className="hud-card rounded-xl overflow-hidden">
                <button type="button" aria-expanded={open} aria-controls={`rule-card-detail-${item.id}`} onClick={() => toggle(item.id)}
                    className="w-full min-h-11 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-hud-text-primary">
                    <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold text-hud-accent-primary">{domainLabel[item.rule.domain]}</span><h2 className="mt-1 font-semibold text-hud-text-primary">{item.rule.name}</h2><p className="text-xs text-hud-text-muted">{item.rule.code} · {item.version.version}</p></div><ChevronDown aria-hidden="true" size={18} className={open ? 'rotate-180' : ''} /></div>
                    <p className="mt-3 text-sm text-hud-text-secondary">{period(item.effectiveFrom, item.effectiveTo)}</p>
                </button>
                {open && <div id={`rule-card-detail-${item.id}`}><RuleDetails item={item} /></div>}
            </article>
        })}</div>

        <nav aria-label="규칙 목록 페이지" className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={onPrevious} disabled={!canPrevious || loading} leftIcon={<ChevronLeft size={16} aria-hidden="true" />} className="min-h-11">이전</Button>
            <span aria-live="polite" className="text-sm text-hud-text-muted">{pageNumber}페이지</span>
            <Button type="button" variant="outline" onClick={onNext} disabled={!canNext || loading} rightIcon={<ChevronRight size={16} aria-hidden="true" />} className="min-h-11">다음</Button>
        </nav>
    </section>
}
