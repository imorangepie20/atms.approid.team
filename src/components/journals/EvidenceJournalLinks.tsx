import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Button from '../common/Button'
import { ApiError, journalApi } from '../../lib/api'

interface Props { companyId: string; userId: string; evidenceId: string; onUnauthorized: () => void; onForbidden: () => void; isCurrent: () => boolean }
// [B7] 증빙에서는 조회/상세 진입만 제공한다. 연결 쓰기는 전표의 version/전체 수정에서만 한다.
export default function EvidenceJournalLinks({ companyId, userId, evidenceId, onUnauthorized, onForbidden, isCurrent }: Props) {
    const rows = useInfiniteQuery({ queryKey: ['evidence-journals', userId, companyId, evidenceId], initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => journalApi.forEvidence(companyId, evidenceId, pageParam, signal), getNextPageParam: page => page.nextCursor ?? undefined })
    const reported = useRef<unknown>(null)
    useEffect(() => { if (rows.error && reported.current !== rows.error && isCurrent()) { reported.current = rows.error; if (rows.error instanceof ApiError && rows.error.status === 401) onUnauthorized(); else if (rows.error instanceof ApiError && rows.error.status === 403) onForbidden() } }, [rows.error, onUnauthorized, onForbidden, isCurrent])
    return <section className="mt-5 border-t border-hud-border-secondary pt-4" aria-labelledby="evidence-journals-title"><h3 id="evidence-journals-title" className="font-semibold">연결된 전표 초안</h3>
        {rows.isPending ? <p role="status">연결 초안 확인 중…</p> : rows.isError ? <p role="alert">연결 초안을 조회하지 못했습니다. <Button type="button" variant="outline" className="min-h-11" onClick={() => void rows.refetch()}>연결 초안 다시 조회</Button></p> : <>
            {!rows.data.pages.some(p => p.items.length) && <p className="mt-2 text-sm text-hud-text-muted">연결된 초안이 없습니다.</p>}
            <ul>{rows.data.pages.flatMap(p => p.items).map(row => <li key={row.id} className="mt-2 min-w-0"><p className="break-words text-sm">{row.number} · {row.memo} · {row.accountingDate}</p><Link className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2" to={`/accounting/journals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.id)}`}>{row.number} 초안 열기</Link></li>)}</ul>
            {rows.hasNextPage && <Button type="button" variant="outline" className="mt-2 min-h-11" disabled={rows.isFetching} onClick={() => void rows.fetchNextPage()}>연결 초안 더 불러오기</Button>}
        </>}
    </section>
}
