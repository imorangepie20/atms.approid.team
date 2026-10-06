import { useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import Button from '../common/Button'
import JournalReferencePicker, { journalInputClass as inputClass } from './JournalReferencePicker'
import { draftValues, journalFieldId, journalTotals, normalizeJournalDraft, wonDisplay, type DraftErrors, type JournalDraftValues } from '../../lib/journalDraftForm'
import type { FiscalYearView, JournalContent, JournalDetailView } from '../../lib/api'

interface Props { companyId: string; userId: string; years: FiscalYearView[]; initial?: JournalDetailView; locked: boolean; onDirty: () => void; onCancel: () => void; onAccessError: (error: unknown) => void; onSubmit: (content: JournalContent, fiscalYearId: string) => void }
function Totals({ control }: { control: Control<JournalDraftValues> }) {
    // [B4/성능] 금액 변경 구독은 합계 영역에 둔다. 나머지100행의 입력은 비제어 register로 유지한다.
    const lines = useWatch({ control, name: 'lines' }), totals = journalTotals(lines ?? [])
    return <div role="status" aria-live="polite" className="rounded-lg border border-hud-border-secondary p-3 text-sm break-words">
        {totals ? `차변 ${wonDisplay(totals.debit)} · 대변 ${wonDisplay(totals.credit)} · 차액 ${wonDisplay(totals.difference)}${totals.overflow ? ' · 합계 범위 초과' : ''}` : '올바른 원 단위 금액을 입력하면 합계를 확인할 수 있습니다.'}
    </div>
}
interface RowProps { index: number; control: Control<JournalDraftValues>; register: UseFormRegister<JournalDraftValues>; companyId: string; userId: string; errors: DraftErrors; locked: boolean; removable: boolean; onRemove: () => void; onDirty: () => void; onAccessError: (error: unknown) => void }
function JournalRow({ index, control, register, companyId, userId, errors, locked, removable, onRemove, onDirty, onAccessError }: RowProps) {
    const error = (field: string) => errors.find(e => e.path === `lines.${index}.${field}`)?.message
    return <fieldset className="min-w-0 rounded-lg border border-hud-border-secondary p-3 space-y-3"><legend className="px-2 font-medium">분개 {index + 1}행</legend>
        <Controller control={control} name={`lines.${index}.accountId`} render={({ field }) => <JournalReferencePicker kind="account" companyId={companyId} userId={userId} id={journalFieldId(field.name)} label={`${index + 1}행 계정`} selected={field.value ? [field.value] : []} locked={locked} invalid={Boolean(error('accountId'))} onAccessError={onAccessError} onChange={ids => { field.onChange(ids[0] ?? ''); onDirty() }} />} />
        {error('accountId') && <p id={`${journalFieldId(`lines.${index}.accountId`)}-error`} className="text-sm text-hud-accent-danger">{error('accountId')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">{(['debit', 'credit'] as const).map(field => { const path = `lines.${index}.${field}` as const, id = journalFieldId(path); return <div key={field}><label className="mb-2 block" htmlFor={id}>{index + 1}행 {field === 'debit' ? '차변' : '대변'}</label><input {...register(path)} id={id} type="text" inputMode="numeric" aria-required disabled={locked} aria-invalid={Boolean(error(field))} aria-describedby={error(field) ? `${id}-error` : undefined} className={inputClass} />{error(field) && <p id={`${id}-error`} className="mt-1 text-sm text-hud-accent-danger">{error(field)}</p>}</div> })}</div>
        <div><label className="mb-2 block" htmlFor={journalFieldId(`lines.${index}.memo`)}>{index + 1}행 메모</label><input {...register(`lines.${index}.memo`)} id={journalFieldId(`lines.${index}.memo`)} disabled={locked} aria-invalid={Boolean(error('memo'))} aria-describedby={error('memo') ? `${journalFieldId(`lines.${index}.memo`)}-error` : undefined} className={inputClass} />{error('memo') && <p id={`${journalFieldId(`lines.${index}.memo`)}-error`} className="text-sm text-hud-accent-danger">{error('memo')}</p>}</div>
        <Button type="button" variant="ghost" className="min-h-11" disabled={locked || !removable} onClick={onRemove}>{index + 1}행 삭제</Button>
    </fieldset>
}
export default function JournalDraftForm({ companyId, userId, years, initial, locked, onDirty, onCancel, onAccessError, onSubmit }: Props) {
    // [B3/B4] useFieldArray의 id는 화면 키다. 전송은 normalizeJournalDraft가 업무 필드만 만든다.
    const { register, control, handleSubmit } = useForm<JournalDraftValues>({ defaultValues: draftValues(initial) })
    const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
    const [errors, setErrors] = useState<DraftErrors>([]), summary = useRef<HTMLDivElement>(null)
    const submit = handleSubmit(values => {
        const result = normalizeJournalDraft(values, years); setErrors(result.errors)
        if ('content' in result) onSubmit(result.content, result.fiscalYearId)
        else requestAnimationFrame(() => summary.current?.focus())
    })
    const error = (path: string) => errors.find(e => e.path === path)?.message
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="journal-form-title">
        <h2 id="journal-form-title" className="text-xl font-semibold">{initial ? '전표 초안 수정' : '전표 초안 등록'}</h2>
        <p className="mt-2 text-sm text-hud-text-muted">초안은 장부에 반영되지 않습니다. 페이지 이탈·새로고침 후에는 입력과 미확인 요청을 복구할 수 없습니다.</p>
        <form className="mt-4 space-y-5" onSubmit={submit} onChange={onDirty} noValidate>
            {errors.length > 0 && <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3"><p className="font-semibold">전표 입력을 확인해 주세요</p><ul>{errors.map((e, i) => <li key={`${e.path}-${i}`}><a href={`#${journalFieldId(e.path)}`} onClick={event => { event.preventDefault(); document.getElementById(journalFieldId(e.path))?.focus() }} className="inline-flex min-h-11 items-center underline">{e.message}</a></li>)}</ul></div>}
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block" htmlFor="j-fiscalYearId">회계연도</label>{initial ? <input id="j-fiscalYearId" readOnly value={years.find(y => y.id === initial.fiscalYearId) ? `${years.find(y => y.id === initial.fiscalYearId)!.startDate} ~ ${years.find(y => y.id === initial.fiscalYearId)!.endDate}` : `${initial.fiscalYearId} · 기간 자료를 더 불러와 주세요`} className={inputClass} /> : <select {...register('fiscalYearId')} id="j-fiscalYearId" disabled={locked} className={inputClass} aria-required aria-invalid={Boolean(error('fiscalYearId'))} aria-describedby={error('fiscalYearId') ? 'j-fiscalYearId-error' : undefined}>
                <option value="">회계연도 선택</option>{years.map(y => <option key={y.id} value={y.id}>{y.startDate} ~ {y.endDate}</option>)}
            </select>}{initial && <p className="mt-1 text-sm text-hud-text-muted">등록 후 회계연도는 변경하지 않습니다.</p>}{error('fiscalYearId') && <p id="j-fiscalYearId-error" className="text-sm text-hud-accent-danger">{error('fiscalYearId')}</p>}</div>
                <div><label className="mb-2 block" htmlFor="j-accountingDate">회계일자</label><input {...register('accountingDate')} id="j-accountingDate" type="date" disabled={locked} aria-required aria-invalid={Boolean(error('accountingDate'))} aria-describedby={error('accountingDate') ? 'j-accountingDate-error' : undefined} className={inputClass} />{error('accountingDate') && <p id="j-accountingDate-error" className="text-sm text-hud-accent-danger">{error('accountingDate')}</p>}</div></div>
            <div><label className="mb-2 block" htmlFor="j-memo">전표 적요</label><textarea {...register('memo')} id="j-memo" disabled={locked} rows={3} aria-required aria-invalid={Boolean(error('memo'))} aria-describedby={error('memo') ? 'j-memo-error' : undefined} className={`${inputClass} py-2`} />{error('memo') && <p id="j-memo-error" className="text-sm text-hud-accent-danger">{error('memo')}</p>}</div>
            <Controller control={control} name="counterpartyId" render={({ field }) => <JournalReferencePicker kind="counterparty" id="j-counterpartyId" label="전표 거래처" companyId={companyId} userId={userId} selected={field.value ? [field.value] : []} locked={locked} invalid={Boolean(error('counterpartyId'))} onAccessError={onAccessError} onChange={ids => { field.onChange(ids[0] ?? null); onDirty() }} />} />
            {error('counterpartyId') && <p id="j-counterpartyId-error" className="text-sm text-hud-accent-danger">{error('counterpartyId')}</p>}
            <Controller control={control} name="evidenceIds" render={({ field }) => <JournalReferencePicker kind="evidence" id="j-evidenceIds" label="연결 증빙" companyId={companyId} userId={userId} selected={field.value} multiple locked={locked} invalid={Boolean(error('evidenceIds'))} onAccessError={onAccessError} onChange={ids => { field.onChange(ids); onDirty() }} />} />
            {error('evidenceIds') && <p id="j-evidenceIds-error" className="text-sm text-hud-accent-danger">{error('evidenceIds')}</p>}
            <fieldset id="j-lines" tabIndex={-1} className="space-y-4 min-w-0"><legend className="text-lg font-semibold">분개 입력</legend>{fields.map((f, index) => <JournalRow key={f.id} index={index} control={control} register={register} companyId={companyId} userId={userId} errors={errors} locked={locked} removable={fields.length > 2} onDirty={onDirty} onAccessError={onAccessError} onRemove={() => { remove(index); onDirty() }} />)}
                <Button type="button" variant="outline" className="min-h-11" disabled={locked || fields.length >= 100} onClick={() => { append({ accountId: '', debit: '0', credit: '0', memo: '' }); onDirty() }}>분개 행 추가</Button>
            </fieldset>
            <Totals control={control} />
            <div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11" disabled={locked}>{locked ? '입력 잠금' : initial ? '초안 변경 저장' : '초안 저장'}</Button><Button type="button" className="min-h-11" variant="ghost" disabled={locked} onClick={onCancel}>입력 취소</Button></div>
        </form>
    </section>
}
