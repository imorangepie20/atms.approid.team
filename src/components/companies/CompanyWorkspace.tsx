import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { CalendarPlus, Save } from 'lucide-react'
import AsyncState from '../common/AsyncState'
import Button from '../common/Button'
import HudCard from '../common/HudCard'
import type { CompanyRole, CompanySelection, FiscalYearView } from '../../lib/api'

const roleLabel: Record<CompanyRole, string> = {
    COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사',
}

interface Props {
    selection: CompanySelection
    fiscalYears?: FiscalYearView[]
    fiscalPending: boolean
    fiscalError?: string
    renamePending: boolean
    renameError?: string
    periodPending: boolean
    periodError?: string
    onRetryFiscalYears: () => void
    onRename: (name: string) => Promise<void>
    onAddFiscalYear: (startDate: string, endDate: string) => Promise<void>
    membersSection: ReactNode
    accessSection: ReactNode
    selfApprovalSection: ReactNode
    companyOperationPending: boolean
}

export default function CompanyWorkspace(props: Props) {
    const { company, roles, permissions } = props.selection
    const canManage = permissions.includes('company.manage')
    const [name, setName] = useState(company.name)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [periodClientError, setPeriodClientError] = useState('')
    const [copyNotice, setCopyNotice] = useState('')
    // [F01 전달 링크] 관리자 권한에만 표시하며 회사 ID 외 개인정보/역할/초대 토큰은 포함하지 않는다.
    const accessLink = `${window.location.origin}/company-access?companyId=${encodeURIComponent(company.id)}`
    useEffect(() => { setCopyNotice('') }, [company.id])
    const copyAccessLink = async () => {
        try { await navigator.clipboard.writeText(accessLink); setCopyNotice('접근 요청 링크를 복사했습니다.') }
        catch { setCopyNotice('자동 복사를 사용할 수 없습니다. 아래 링크를 선택해 복사해 주세요.') }
    }
    useEffect(() => { setName(company.name) }, [company.id, company.name])

    const rename = async (event: FormEvent) => {
        event.preventDefault()
        if (!name.trim() || props.companyOperationPending) return
        try { await props.onRename(name) }
        catch { return }
    }
    const addPeriod = async (event: FormEvent) => {
        event.preventDefault()
        if (props.companyOperationPending) return
        const start = Date.parse(`${startDate}T00:00:00Z`)
        const end = Date.parse(`${endDate}T00:00:00Z`)
        const days = (end - start) / 86400000 + 1
        if (!Number.isFinite(days) || days < 1 || days > 366) {
            setPeriodClientError('시작일과 종료일을 1~366일 범위로 입력해 주세요.')
            return
        }
        setPeriodClientError('')
        try { await props.onAddFiscalYear(startDate, endDate) }
        catch { return }
        setStartDate('')
        setEndDate('')
    }

    return <div className="space-y-5">
        <HudCard title={company.name} headingLevel={2} subtitle="선택 결과는 이 화면에서만 유지됩니다.">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div><dt className="text-xs text-hud-text-muted">통화</dt><dd className="mt-1 font-medium text-hud-text-primary">{company.currency}</dd></div>
                <div><dt className="text-xs text-hud-text-muted">회계 기준</dt><dd className="mt-1 font-medium text-hud-text-primary">{company.accountingStandard === 'K_GAAP' ? '일반기업회계기준 (K-GAAP)' : company.accountingStandard}</dd></div>
                <div><dt className="text-xs text-hud-text-muted">버전</dt><dd className="mt-1 font-medium text-hud-text-primary">{company.version}</dd></div>
                <div><dt className="text-xs text-hud-text-muted">본인 승인</dt><dd className="mt-1 font-medium text-hud-text-primary">{company.allowSelfApproval ? '허용' : '금지'}</dd></div>
            </dl>
            <div className="mt-5 border-t border-hud-border-secondary pt-4">
                <p className="text-xs text-hud-text-muted">현재 역할</p>
                <div className="mt-2 flex flex-wrap gap-2">{roles.map(role => <span key={role} className="rounded-full bg-hud-accent-primary/10 px-3 py-1 text-xs font-medium text-hud-accent-primary">{roleLabel[role]}</span>)}</div>
                <p className="mt-3 text-xs text-hud-text-muted">서버가 확인한 권한 {permissions.length}개</p>
            </div>
        </HudCard>

        {permissions.includes('company.members.manage') && <HudCard title="접근 요청 링크 전달" headingLevel={2} subtitle="기존 확인 계정에 링크를 직접 전달하세요. 신청 후 관리자의 승인이 필요합니다.">
            <label htmlFor="company-access-link" className="block text-sm text-hud-text-secondary mb-2">전달할 회사 접근 요청 링크</label>
            <input id="company-access-link" readOnly value={accessLink} onFocus={event => event.currentTarget.select()}
                className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-sm text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
            <Button type="button" variant="secondary" onClick={() => void copyAccessLink()} className="mt-3 min-h-11 focus-visible:outline focus-visible:outline-2">접근 요청 링크 복사</Button>
            {copyNotice && <p role="status" className="mt-3 text-sm text-hud-text-secondary">{copyNotice}</p>}
        </HudCard>}

        {canManage ? <HudCard title="회사 이름 수정" headingLevel={2} subtitle="화면에 표시된 버전이 최신일 때만 저장됩니다.">
            <form onSubmit={rename} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1"><label htmlFor="company-rename" className="mb-2 block text-sm font-medium text-hud-text-secondary">새 회사 이름</label>
                    <input id="company-rename" value={name} onChange={event => setName(event.target.value)} required maxLength={200} disabled={props.companyOperationPending}
                        className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
                <Button type="submit" disabled={props.companyOperationPending || props.renamePending || name.trim() === company.name} leftIcon={<Save size={17} aria-hidden="true" />} className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                    {props.renamePending ? '저장 중…' : '이름 저장'}
                </Button>
            </form>
            {props.renameError && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{props.renameError}</p>}
        </HudCard> : <section role="status" className="rounded-xl border border-hud-border-secondary bg-hud-bg-card p-5 text-sm text-hud-text-secondary">조회 권한으로 접속했습니다. 회사 이름과 회계연도는 회사 관리자만 변경할 수 있습니다.</section>}

        <HudCard title="회계연도" headingLevel={2} subtitle="기존 기간은 보존하며 겹치지 않는 새 기간만 추가합니다.">
            {props.fiscalPending ? <AsyncState kind="loading" title="회계연도를 불러오는 중입니다" description="선택한 회사의 실제 기간을 확인하고 있습니다." />
                : props.fiscalError ? <AsyncState kind="error" title="회계연도를 불러오지 못했습니다" description={props.fiscalError} onRetry={props.onRetryFiscalYears} />
                    : (props.fiscalYears ?? []).length === 0 ? <AsyncState kind="empty" title="등록된 회계연도가 없습니다" description="회사 관리자가 겹치지 않는 첫 실제 기간을 추가할 수 있습니다." />
                    : <ul aria-label="등록된 회계연도" className="divide-y divide-hud-border-secondary rounded-lg border border-hud-border-secondary">
                        {(props.fiscalYears ?? []).map(year => <li key={year.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-hud-text-primary">{year.startDate}</span><span className="text-hud-text-muted">~</span><span className="text-hud-text-primary">{year.endDate}</span></li>)}
                    </ul>}
            {/* [F01 반응형 수정] 태블릿의 회사 목록 옆 좁은 작업 공간에서는 날짜 입력을 세로로 배치한다. */}
            {canManage && <form onSubmit={addPeriod} className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
                <div><label htmlFor="fiscal-start" className="mb-2 block text-sm font-medium text-hud-text-secondary">시작일</label><input id="fiscal-start" type="date" disabled={props.companyOperationPending} value={startDate} onChange={event => setStartDate(event.target.value)} required className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
                <div><label htmlFor="fiscal-end" className="mb-2 block text-sm font-medium text-hud-text-secondary">종료일</label><input id="fiscal-end" type="date" disabled={props.companyOperationPending} value={endDate} onChange={event => setEndDate(event.target.value)} required className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
                <Button type="submit" disabled={props.companyOperationPending || props.periodPending} leftIcon={<CalendarPlus size={17} aria-hidden="true" />} className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">{props.periodPending ? '추가 중…' : '기간 추가'}</Button>
            </form>}
            {(periodClientError || props.periodError) && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{periodClientError || props.periodError}</p>}
        </HudCard>
        {props.membersSection}
        {props.selfApprovalSection}
        {props.accessSection}
    </div>
}
