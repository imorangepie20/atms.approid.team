import { FormEvent, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import Button from '../common/Button'
import HudCard from '../common/HudCard'
import type { CreateCompanyInput } from '../../lib/api'

interface Props {
    pending: boolean
    serverError?: string
    onCreate: (input: CreateCompanyInput, password: string) => Promise<void>
}

const newRequestId = () => crypto.randomUUID()

// [F01 회사 화면 추가] 입력이 같으면 네트워크 재시도에도 같은 UUID를 보내 중복 회사를 막는다.
// 이름이나 기간을 바꾸는 순간에는 별개의 생성 의도로 보고 새 UUID를 만든다.
export default function CompanyCreateForm({ pending, serverError, onCreate }: Props) {
    const [name, setName] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [password, setPassword] = useState('')
    const [creationRequestId, setCreationRequestId] = useState(newRequestId)
    const [clientError, setClientError] = useState('')

    const update = (setter: (value: string) => void, value: string) => {
        setter(value)
        setCreationRequestId(newRequestId())
        setClientError('')
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        const start = Date.parse(`${startDate}T00:00:00Z`)
        const end = Date.parse(`${endDate}T00:00:00Z`)
        const days = (end - start) / 86400000 + 1
        if (!name.trim() || !Number.isFinite(days) || days < 1 || days > 366) {
            setClientError('회사 이름과 1~366일 범위의 첫 회계연도를 확인해 주세요.')
            return
        }
        try { await onCreate({ creationRequestId, name, startDate, endDate }, password) }
        catch { setPassword(''); return }
        setName('')
        setStartDate('')
        setEndDate('')
        setPassword('')
        setCreationRequestId(newRequestId())
    }

    return <HudCard title="새 회사 등록" headingLevel={2} subtitle="회사와 첫 회계연도를 함께 만듭니다." action={<Building2 aria-hidden="true" className="text-hud-accent-primary" />}>
        {/* [F01 자동완성 수리] 재인증 비밀번호가 있는 양식을 Chrome이 로그인 폼으로 오인하지 않도록 양식과 업무 입력의 자동완성을 끈다. */}
        <form onSubmit={submit} autoComplete="off" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(12rem,1.5fr)_1fr_1fr_1fr_auto] xl:items-end">
            <div><label htmlFor="new-company-name" className="mb-2 block text-sm font-medium text-hud-text-secondary">회사 이름</label>
                <input id="new-company-name" name="companyName" autoComplete="off" value={name} onChange={event => update(setName, event.target.value)} required maxLength={200}
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            <div><label htmlFor="new-company-start" className="mb-2 block text-sm font-medium text-hud-text-secondary">첫 회계연도 시작일</label>
                <input id="new-company-start" name="companyFiscalYearStart" autoComplete="off" type="date" value={startDate} onChange={event => update(setStartDate, event.target.value)} required
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            <div><label htmlFor="new-company-end" className="mb-2 block text-sm font-medium text-hud-text-secondary">첫 회계연도 종료일</label>
                <input id="new-company-end" name="companyFiscalYearEnd" autoComplete="off" type="date" value={endDate} onChange={event => update(setEndDate, event.target.value)} required
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            <div><label htmlFor="company-create-password" className="mb-2 block text-sm font-medium text-hud-text-secondary">회사 등록용 현재 비밀번호</label>
                {/* 현재 비밀번호를 확인하지만 저장 자격증명의 자동 주입은 원하지 않으므로 password manager에는 새 입력 칸으로 표시한다. */}
                <input id="company-create-password" name="companyCreationPassword" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            <Button type="submit" disabled={pending} leftIcon={<Plus size={17} aria-hidden="true" />} className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                {pending ? '등록 중…' : '회사 등록'}
            </Button>
        </form>
        {(clientError || serverError) && <p role="alert" className="mt-4 text-sm text-hud-accent-danger">{clientError || serverError}</p>}
        <p className="mt-3 text-xs leading-5 text-hud-text-muted">비밀번호를 서버에서 다시 확인한 뒤 5분 안에 회사를 만듭니다. 비밀번호는 화면 상태에서 즉시 지우며 저장하거나 기록하지 않습니다. 성공하면 세션 식별자와 CSRF가 교체됩니다.</p>
    </HudCard>
}
