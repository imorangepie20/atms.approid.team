import { useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '../common/Button'
import type { CounterpartyFields, CounterpartyKind } from '../../lib/api'

// [F02 T3/T7] 입력 상태는 이 폼 메모리에만 남는다. 길이는 trim 뒤 코드 포인트 수로 검사한다.
export const kindLabels: Record<CounterpartyKind, string> = { CUSTOMER: '고객', SUPPLIER: '공급', BOTH: '겸용' }
const labels = { name: '거래처 이름', kind: '구분', businessNumber: '사업자번호', contactName: '담당자', email: '이메일', phone: '전화', address: '주소', memo: '메모' }
const limits = { name: 100, businessNumber: 12, contactName: 100, email: 254, phone: 40, address: 300, memo: 1000 }
const textFields = ['name', 'businessNumber', 'contactName', 'email', 'phone', 'address', 'memo'] as const
type Field = typeof textFields[number]
type FormFields = Omit<CounterpartyFields, 'kind'> & { kind: CounterpartyKind | '' }
const empty: FormFields = { name: '', kind: '', businessNumber: null, contactName: null, email: null, phone: null, address: null, memo: null }
const validUnicode = (text: string) => !text.includes('\0') && [...text].every(char => char.length !== 1 || char.charCodeAt(0) < 0xd800 || char.charCodeAt(0) > 0xdfff)
interface Props {
    mode: 'create' | 'edit'
    initial?: CounterpartyFields
    busy: boolean
    uncertain: boolean
    error: string
    onSubmit: (fields: CounterpartyFields) => Promise<void>
    onDirty: () => void
    onCancel: () => void
    onRetry: () => void
    onCheckResult: () => void
}

export default function CounterpartyForm(props: Props) {
    const [fields, setFields] = useState<FormFields>(props.initial ?? empty)
    const [errors, setErrors] = useState<Partial<Record<Field | 'kind', string>>>({})
    const summary = useRef<HTMLDivElement>(null)
    // [T7 수정] 고정 헤더 아래에 오류 요약이 가려지지 않도록 초점을 준 뒤 화면 중앙에 표시한다.
    useEffect(() => { if (props.error || Object.keys(errors).length) { summary.current?.focus({ preventScroll: true }); summary.current?.scrollIntoView({ block: 'center' }) } }, [props.error, errors])
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (props.busy || props.uncertain) return
        const next: CounterpartyFields = { ...fields, kind: fields.kind as CounterpartyKind }, invalid: Partial<Record<Field | 'kind', string>> = {}
        if (!fields.kind) invalid.kind = '고객/공급/겸용 중 구분을 선택해 주세요.'
        for (const field of textFields) {
            const value = (fields[field] ?? '').trim()
            if (field === 'name') next.name = value
            else next[field] = value || null
            if ((field === 'name' && !value) || !validUnicode(value) || [...value].length > limits[field]) invalid[field] = field === 'businessNumber'
                ? '숫자10자리 또는 3-2-5 형식으로 입력해 주세요.' : `${labels[field]}은 공백 제거 후 ${field === 'name' ? '1~' : '최대 '}${limits[field]}자로 입력해 주세요.`
        }
        if (next.businessNumber && !/^(?:[0-9]{10}|[0-9]{3}-[0-9]{2}-[0-9]{5})$/.test(next.businessNumber)) invalid.businessNumber = '숫자10자리 또는 3-2-5 형식으로 입력해 주세요.'
        if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) invalid.email = '이메일 형식을 확인해 주세요.'
        setErrors(invalid)
        if (Object.keys(invalid).length) return
        next.businessNumber = next.businessNumber?.replace(/-/g, '') ?? null
        await props.onSubmit(next)
    }
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="counterparty-form-title">
        <h2 id="counterparty-form-title" className="text-xl font-semibold">{props.mode === 'create' ? '거래처 등록' : '거래처 수정'}</h2>
        <p className="mt-2 text-sm text-hud-text-muted">이름과 구분은 필수입니다. 선택 항목의 빈 값은 비워 둡니다. 번호는 형식만 확인합니다.</p>
        <form onSubmit={event => { void submit(event) }} noValidate autoComplete="off" className="mt-4 space-y-4">
            {(props.error || Object.keys(errors).length > 0) && <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-danger">
                <p className="font-medium">{props.error || '입력 내용을 확인해 주세요.'}</p>
                <ul>{([...textFields, 'kind'] as const).filter(field => errors[field]).map(field => <li key={field}><a href={`#counterparty-${field}`} className="underline">{errors[field]}</a></li>)}</ul>
            </div>}
            <fieldset disabled={props.busy || props.uncertain} className="grid min-w-0 gap-4 sm:grid-cols-2">
                {textFields.map(field => <div key={field} className={field === 'memo' || field === 'address' ? 'sm:col-span-2 min-w-0' : 'min-w-0'}>
                    <label htmlFor={`counterparty-${field}`} className="mb-2 block text-sm font-medium">{labels[field]}{field === 'name' && ' (필수)'}</label>
                    {field === 'memo' ? <textarea id={`counterparty-${field}`} rows={3} value={fields[field] ?? ''} onChange={event => { setFields(current => ({ ...current, [field]: event.target.value })); props.onDirty() }}
                        aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `counterparty-${field}-error` : undefined} className="w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary p-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
                        : <input id={`counterparty-${field}`} type={field === 'email' ? 'email' : 'text'} inputMode={field === 'businessNumber' ? 'numeric' : undefined}
                            required={field === 'name'} value={fields[field] ?? ''} onChange={event => { setFields(current => ({ ...current, [field]: event.target.value })); props.onDirty() }}
                            aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `counterparty-${field}-error` : undefined}
                            className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />}
                    {errors[field] && <p id={`counterparty-${field}-error`} className="mt-1 text-sm text-hud-accent-danger">{errors[field]}</p>}
                </div>)}
                <div><label htmlFor="counterparty-kind" className="mb-2 block text-sm font-medium">구분 (필수)</label><select id="counterparty-kind" value={fields.kind} required aria-invalid={Boolean(errors.kind)} aria-describedby={errors.kind ? 'counterparty-kind-error' : undefined}
                    onChange={event => { setFields(current => ({ ...current, kind: event.target.value as CounterpartyKind })); props.onDirty() }}
                    className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                    <option value="">구분 선택</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>{errors.kind && <p id="counterparty-kind-error" className="mt-1 text-sm text-hud-accent-danger">{errors.kind}</p>}</div>
            </fieldset>
            <div className="flex flex-wrap gap-3">
                {!props.uncertain && <Button type="submit" disabled={props.busy} className="min-h-11">{props.busy ? '저장 중…' : props.mode === 'create' ? '거래처 등록 저장' : '거래처 수정 저장'}</Button>}
                {props.uncertain && <><Button type="button" disabled={props.busy} onClick={props.onRetry} className="min-h-11">같은 등록 요청 다시 시도</Button><Button type="button" disabled={props.busy} variant="outline" onClick={props.onCheckResult} className="min-h-11">목록에서 결과 확인</Button></>}
                <Button type="button" disabled={props.busy} variant="ghost" onClick={props.onCancel} className="min-h-11">입력 취소</Button>
            </div>
            {props.uncertain && <p className="text-sm text-hud-text-muted">저장됐을 수 있습니다. 같은 입력으로만 재시도합니다. 페이지를 떠나면 요청을 복구할 수 없으므로 목록에서 결과를 확인해 주세요.</p>}
        </form>
    </section>
}
