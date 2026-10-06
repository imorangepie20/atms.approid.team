import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Button from '../common/Button'
import AsyncState from '../common/AsyncState'
import JournalReferencePicker, { journalInputClass } from './JournalReferencePicker'
import { journalTotals, wonDisplay } from '../../lib/journalDraftForm'
import { normalizeOpeningBalance, openingBalanceValues, openingFieldId,
    type OpeningBalanceErrors, type OpeningBalanceValues } from '../../lib/openingBalanceForm'
import { ApiError, journalWorkflowApi, openingBalanceApi,
    type CreateOpeningBalanceInput, type FiscalYearView, type OpeningBalanceView, type UpdateOpeningBalanceInput } from '../../lib/api'

type SaveAttempt = { kind: 'create'; input: CreateOpeningBalanceInput } | { kind: 'update'; input: UpdateOpeningBalanceInput }
interface Props {
    companyId: string; userId: string; years: FiscalYearView[]; canWrite: boolean; csrfToken: string
    locked: boolean; onBusy: (value: boolean) => void; onAccessError: (error: unknown) => void
}
const statusName = { DRAFT: '초안', SUBMITTED: '승인 요청', APPROVED: '승인 완료', REJECTED: '반려', POSTED: '장부 반영' }
const emptyLine = () => ({ accountId: '', debit: '0', credit: '0', memo: '' })

// [F04 B3] 연도별 단일 OPENING 전표를 조회하고 DRAFT만 수정한다. 승인·확정 권한은 workflow 응답을 그대로 따른다.
export default function OpeningBalanceForm({ companyId, userId, years, canWrite, csrfToken, locked, onBusy, onAccessError }: Props) {
    const cache = useQueryClient(), [yearId, setYearId] = useState(''), [values, setValues] = useState<OpeningBalanceValues>(() => openingBalanceValues())
    const [errors, setErrors] = useState<OpeningBalanceErrors>([]), [notice, setNotice] = useState(''), [error, setError] = useState('')
    const [attempt, setAttempt] = useState<SaveAttempt | null>(null), [submitting, setSubmitting] = useState(false)
    const alert = useRef<HTMLDivElement>(null), inFlight = useRef(false)
    const selectedYear = years.find(year => year.id === yearId)
    const previous = useMemo(() => !selectedYear ? undefined : [...years].filter(year => year.endDate < selectedYear.startDate)
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0], [years, selectedYear])
    const opening = useQuery({ queryKey: ['opening-balance', userId, companyId, yearId], enabled: Boolean(yearId), retry: false,
        queryFn: ({ signal }) => openingBalanceApi.get(companyId, yearId, signal) })
    const row = opening.data, missing = opening.error instanceof ApiError && opening.error.status === 404
    const workflow = useQuery({ queryKey: ['journal-workflow', userId, companyId, row?.id ?? ''], enabled: Boolean(row?.id),
        queryFn: ({ signal }) => journalWorkflowApi.detail(companyId, row!.id, undefined, signal) })
    const sourceFiscalYearId = row?.sourceFiscalYearId ?? previous?.id ?? null
    const editable = canWrite && (!row || row.status === 'DRAFT')
    const busy = locked || submitting || opening.isFetching || workflow.isFetching
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    useEffect(() => {
        if (!yearId) return
        setValues(openingBalanceValues(row)); setErrors([]); setError(''); setNotice(''); setAttempt(null)
    }, [yearId, row?.id, row?.version])
    useEffect(() => { const failure = opening.error ?? workflow.error; if (failure instanceof ApiError && [401, 403].includes(failure.status)) onAccessError(failure) }, [opening.error, workflow.error, onAccessError])
    const mutate = (update: (current: OpeningBalanceValues) => OpeningBalanceValues) => { setValues(update); setErrors([]); setNotice('') }
    const fieldError = (path: string) => errors.find(item => item.path === path)?.message
    const refresh = async () => { setAttempt(null); setError(''); await opening.refetch(); if (row) await workflow.refetch() }
    const persist = async (pending: SaveAttempt) => {
        if (inFlight.current || !yearId) return
        inFlight.current = true; setSubmitting(true); onBusy(true); setError('')
        try {
            const saved = pending.kind === 'create'
                ? await openingBalanceApi.create(companyId, yearId, pending.input, csrfToken)
                : await openingBalanceApi.update(companyId, yearId, pending.input, csrfToken)
            setAttempt(null); setValues(openingBalanceValues(saved)); setNotice('기초 잔액 저장 결과를 확인했습니다.')
            cache.setQueryData(['opening-balance', userId, companyId, yearId], saved)
            await Promise.all([cache.invalidateQueries({ queryKey: ['journal-workflow', userId, companyId, saved.id] }),
                cache.invalidateQueries({ queryKey: ['journals', userId, companyId] })])
        } catch (failure) {
            if (!(failure instanceof ApiError) || failure.status === 429 || failure.status >= 500) {
                setAttempt(pending); setError('저장 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다. 같은 요청으로 결과를 확인하거나 현재 상태를 조회해 주세요.')
            } else {
                setAttempt(null); setError(failure.status === 409 ? '기초 잔액이나 참조 자료가 변경됐습니다. 현재 상태를 다시 조회해 주세요.'
                    : failure.status === 404 ? '회계연도 또는 참조 자료를 찾지 못했습니다.' : '기초 잔액 저장 권한과 입력을 확인해 주세요.')
                if ([401, 403].includes(failure.status)) onAccessError(failure)
                if (failure.status === 409) await opening.refetch()
            }
        } finally { inFlight.current = false; setSubmitting(false); onBusy(false) }
    }
    const save = () => {
        if (!editable || !yearId) return
        const result = normalizeOpeningBalance(values, sourceFiscalYearId); setErrors(result.errors)
        if (!('content' in result)) { requestAnimationFrame(() => alert.current?.focus()); return }
        const pending: SaveAttempt = row ? { kind: 'update', input: { version: row.version, ...result.content } }
            : { kind: 'create', input: { creationRequestId: crypto.randomUUID(), ...result.content } }
        void persist(pending)
    }
    const submit = async () => {
        if (!row || !workflow.data?.allowedActions.includes('SUBMIT') || inFlight.current) return
        inFlight.current = true; setSubmitting(true); onBusy(true); setError('')
        try {
            await journalWorkflowApi.action(companyId, row.id, 'SUBMIT', { version: row.version, actionRequestId: crypto.randomUUID() }, csrfToken)
            setNotice('기초 잔액 승인 요청을 확인했습니다.')
            await Promise.all([opening.refetch(), workflow.refetch(), cache.invalidateQueries({ queryKey: ['journal-approvals', userId, companyId] })])
        } catch (failure) {
            setError(failure instanceof ApiError && failure.status === 409 ? '상태가 변경됐습니다. 현재 기초 잔액을 다시 조회해 주세요.' : '승인 요청 결과를 확인하지 못했습니다. 승인 화면과 현재 상태를 확인해 주세요.')
            if (failure instanceof ApiError && [401, 403].includes(failure.status)) onAccessError(failure)
        } finally { inFlight.current = false; setSubmitting(false); onBusy(false) }
    }
    const totals = journalTotals(values.lines)
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-4" aria-labelledby="opening-title">
        <div><h2 id="opening-title" className="text-xl font-semibold">기초 잔액</h2><p className="mt-2 text-sm text-hud-text-muted">회계연도 시작일의 단일 기초 전표입니다. 승인과 장부 반영 뒤에는 직접 수정할 수 없습니다.</p></div>
        <div><label htmlFor="opening-year" className="mb-2 block">회계연도</label><select id="opening-year" className={journalInputClass} value={yearId} disabled={locked || submitting} onChange={event => { setYearId(event.target.value); setValues(openingBalanceValues()) }}><option value="">회계연도 선택</option>{years.map(year => <option key={year.id} value={year.id}>{year.startDate} ~ {year.endDate}</option>)}</select></div>
        {yearId && <p className="text-sm text-hud-text-muted">자동 출처: {previous ? `${previous.startDate} ~ ${previous.endDate}` : '연결할 전기 없음'} · 회계일자: {selectedYear?.startDate}</p>}
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3">{error}</div>}
        {notice && <p role="status">{notice}</p>}
        {attempt && <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void persist(attempt)}>같은 요청으로 결과 확인</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>현재 상태 조회</Button></div>}
        {yearId && opening.isPending && <AsyncState kind="loading" title="기초 잔액 확인 중" description="선택한 회계연도의 단일 전표를 확인합니다." />}
        {yearId && opening.isError && !missing && <AsyncState kind="error" title="기초 잔액을 불러오지 못했습니다" description="회사 권한과 연결 상태를 확인해 주세요." onRetry={() => void opening.refetch()} />}
        {row && <div className="rounded-lg border border-hud-border-secondary p-3 text-sm"><strong>{row.number} · {statusName[row.status]}</strong><p className="mt-1">차변 {wonDisplay(row.debitTotal)} · 대변 {wonDisplay(row.creditTotal)} · 버전 {row.version}</p></div>}
        {yearId && (missing || row) && editable && <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); save() }}>
            {errors.length > 0 && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3"><p className="font-semibold">기초 잔액 입력을 확인해 주세요</p><ul>{errors.map((item, index) => <li key={`${item.path}-${index}`}><a className="inline-flex min-h-11 items-center underline" href={`#${openingFieldId(item.path)}`} onClick={event => { event.preventDefault(); document.getElementById(openingFieldId(item.path))?.focus() }}>{item.message}</a></li>)}</ul></div>}
            <label className="flex min-h-11 items-center gap-2"><input id="ob-zero" type="checkbox" checked={values.zero} disabled={busy} onChange={event => mutate(current => ({ ...current, zero: event.target.checked, zeroConfirmed: false }))} />이 연도의 기초 잔액은 0원입니다</label>
            {values.zero ? <label className="flex min-h-11 items-center gap-2"><input id={openingFieldId('zeroConfirmed')} type="checkbox" checked={values.zeroConfirmed} disabled={busy} aria-invalid={Boolean(fieldError('zeroConfirmed'))} onChange={event => mutate(current => ({ ...current, zeroConfirmed: event.target.checked }))} />분개와 증빙 없이 0원으로 등록함을 확인합니다</label> : <>
                <JournalReferencePicker kind="evidence" id={openingFieldId('evidenceIds')} label="기초 잔액 근거 증빙" companyId={companyId} userId={userId} selected={values.evidenceIds} multiple locked={busy} invalid={Boolean(fieldError('evidenceIds'))} onAccessError={onAccessError} onChange={ids => mutate(current => ({ ...current, evidenceIds: ids }))} />
                <fieldset id={openingFieldId('lines')} tabIndex={-1} className="space-y-4"><legend className="font-semibold">계정별 기초 잔액</legend>{values.lines.map((line, index) => <div key={index} className="rounded-lg border border-hud-border-secondary p-3 space-y-3"><h3 className="font-medium">분개 {index + 1}행</h3><JournalReferencePicker kind="account" id={openingFieldId(`lines.${index}.accountId`)} label={`${index + 1}행 계정`} companyId={companyId} userId={userId} selected={line.accountId ? [line.accountId] : []} locked={busy} invalid={Boolean(fieldError(`lines.${index}.accountId`))} onAccessError={onAccessError} onChange={ids => mutate(current => ({ ...current, lines: current.lines.map((item, i) => i === index ? { ...item, accountId: ids[0] ?? '' } : item) }))} />
                    <div className="grid gap-3 sm:grid-cols-2">{(['debit', 'credit'] as const).map(kind => <div key={kind}><label className="mb-2 block" htmlFor={openingFieldId(`lines.${index}.${kind}`)}>{kind === 'debit' ? '차변' : '대변'}</label><input id={openingFieldId(`lines.${index}.${kind}`)} className={journalInputClass} inputMode="numeric" value={line[kind]} disabled={busy} aria-invalid={Boolean(fieldError(`lines.${index}.${kind}`))} onChange={event => mutate(current => ({ ...current, lines: current.lines.map((item, i) => i === index ? { ...item, [kind]: event.target.value } : item) }))} /></div>)}</div>
                    <div><label className="mb-2 block" htmlFor={openingFieldId(`lines.${index}.memo`)}>행 메모</label><input id={openingFieldId(`lines.${index}.memo`)} className={journalInputClass} value={line.memo} disabled={busy} onChange={event => mutate(current => ({ ...current, lines: current.lines.map((item, i) => i === index ? { ...item, memo: event.target.value } : item) }))} /></div>
                    <Button type="button" variant="ghost" className="min-h-11" disabled={busy || values.lines.length <= 2} onClick={() => mutate(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>{index + 1}행 삭제</Button></div>)}
                    <Button type="button" variant="outline" className="min-h-11" disabled={busy || values.lines.length >= 100} onClick={() => mutate(current => ({ ...current, lines: [...current.lines, emptyLine()] }))}>분개 행 추가</Button>
                </fieldset>
                <div role="status" className="rounded-lg border border-hud-border-secondary p-3 text-sm">{totals ? `차변 ${wonDisplay(totals.debit)} · 대변 ${wonDisplay(totals.credit)} · 차액 ${wonDisplay(totals.difference)}` : '원 단위 금액을 확인해 주세요.'}</div>
            </>}
            <Button type="submit" className="min-h-11" disabled={busy}>{row ? '기초 잔액 변경 저장' : '기초 잔액 등록'}</Button>
        </form>}
        {row && workflow.data?.allowedActions.includes('SUBMIT') && <Button type="button" className="min-h-11" disabled={busy} onClick={() => void submit()}>기초 잔액 승인 요청</Button>}
        {row && row.status !== 'DRAFT' && <Link className="inline-flex min-h-11 items-center underline" to={`/accounting/approvals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.id)}`}>승인·확정 상태와 이력 보기</Link>}
    </section>
}
