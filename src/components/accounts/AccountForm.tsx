import { useRef, useState, type FormEvent } from 'react'
import Button from '../common/Button'
import type { AccountCategory, AccountFields, AccountNormalBalance, AccountView } from '../../lib/api'

export const categoryLabels: Record<AccountCategory, string> = { ASSET: '자산', LIABILITY: '부채', EQUITY: '자본', REVENUE: '수익', EXPENSE: '비용' }
export const balanceLabels: Record<AccountNormalBalance, string> = { DEBIT: '차변', CREDIT: '대변' }
const inputClass = 'w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
interface Props { initial?: AccountView; locked: boolean; onDirty: () => void; onSubmit: (fields: AccountFields) => void; onCancel: () => void }

// [B3/B7] 기존 코드/분류는 읽기 전용이다. 분류와 방향의 빈 기본값은 명시적인 선택을 요구한다.
export default function AccountForm({ initial, locked, onDirty, onSubmit, onCancel }: Props) {
    const [code, setCode] = useState(initial?.code ?? ''), [name, setName] = useState(initial?.name ?? '')
    const [category, setCategory] = useState<AccountCategory | ''>(initial?.category ?? '')
    const [balance, setBalance] = useState<AccountNormalBalance | ''>(initial?.normalBalance ?? '')
    const [errors, setErrors] = useState<Record<string, string>>({}), summary = useRef<HTMLDivElement>(null)
    const classified = initial?.category != null && initial?.normalBalance != null
    const submit = (event: FormEvent) => {
        event.preventDefault(); if (locked) return
        const next: Record<string, string> = {}, trimmedCode = code.trim(), trimmedName = name.trim()
        if (!initial && !/^[A-Za-z0-9_-]{1,20}$/.test(trimmedCode)) next.code = '코드는 영문·숫자·밑줄·하이픈으로 1~20자 입력해 주세요.'
        // HTML maxLength는 UTF-16 단위이므로 서버의 코드 포인트 정책을 대신하지 않는다.
        if (![...trimmedName].length || [...trimmedName].length > 100 || trimmedName.includes('\0') || [...trimmedName].some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) next.name = '이름은 올바른 문자로 1~100자 입력해 주세요.'
        if (!category) next.category = '분류를 선택해 주세요.'
        if (!balance) next.balance = '정상 잔액 방향을 선택해 주세요.'
        setErrors(next)
        if (Object.keys(next).length) { requestAnimationFrame(() => summary.current?.focus()); return }
        onSubmit({ code: initial?.code ?? trimmedCode.toUpperCase(), name: trimmedName, category: category as AccountCategory, normalBalance: balance as AccountNormalBalance })
    }
    const aria = (field: string) => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `account-${field}-error` : undefined })
    const error = (field: string) => errors[field] && <p id={`account-${field}-error`} className="mt-2 text-sm text-hud-accent-danger">{errors[field]}</p>
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="account-form-title">
        <h2 id="account-form-title" className="text-xl font-semibold">{initial ? '계정과목 수정' : '계정과목 등록'}</h2>
        <p className="mt-2 text-sm text-hud-text-muted">페이지를 떠나거나 새로고침하면 입력과 미확인 요청을 복구할 수 없습니다.</p>
        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
            {Object.keys(errors).length > 0 && <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3"><p className="font-medium">입력을 확인해 주세요</p><ul>{Object.entries(errors).map(([field, text]) => <li key={field}><a className="inline-flex min-h-11 items-center underline" href={`#account-${field}`}>{text}</a></li>)}</ul></div>}
            <div><label htmlFor="account-code" className="mb-2 block">계정 코드</label><input id="account-code" value={code} readOnly={Boolean(initial)} disabled={locked} aria-required={!initial} {...aria('code')} onChange={e => { setCode(e.target.value); onDirty() }} className={inputClass} />{error('code')}<p className="mt-1 text-sm text-hud-text-muted">등록 후 코드는 변경하지 않습니다.</p></div>
            <div><label htmlFor="account-name" className="mb-2 block">계정 이름</label><input id="account-name" value={name} disabled={locked} aria-required {...aria('name')} onChange={e => { setName(e.target.value); onDirty() }} className={inputClass} />{error('name')}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="account-category" className="mb-2 block">계정 분류</label><select id="account-category" value={category} disabled={locked || classified} aria-required {...aria('category')} onChange={e => { setCategory(e.target.value as AccountCategory); onDirty() }} className={inputClass}><option value="">분류 선택</option>{Object.entries(categoryLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{error('category')}</div>
                <div><label htmlFor="account-balance" className="mb-2 block">정상 잔액 방향</label><select id="account-balance" value={balance} disabled={locked || classified} aria-required {...aria('balance')} onChange={e => { setBalance(e.target.value as AccountNormalBalance); onDirty() }} className={inputClass}><option value="">방향 선택</option>{Object.entries(balanceLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{error('balance')}</div></div>
            <p className="text-sm text-hud-text-muted">차감 계정도 방향을 직접 선택합니다. 이미 설정한 분류와 방향은 변경하지 않습니다.</p>
            <div className="flex flex-wrap gap-3"><Button type="submit" disabled={locked} className="min-h-11">{locked ? '처리 중…' : initial ? '변경 저장' : '계정 등록'}</Button><Button type="button" variant="ghost" disabled={locked} onClick={onCancel} className="min-h-11">입력 취소</Button></div>
        </form>
    </section>
}
