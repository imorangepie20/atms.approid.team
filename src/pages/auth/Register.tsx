import { useState } from 'react'
import AccountPasswordForm, { accountAcceptedText, accountError, AccountNotice, AccountPage } from '../../components/auth/AccountPasswordForm'
import { authApi } from '../../lib/api'

export default function Register() {
    const [accepted, setAccepted] = useState(false), [error, setError] = useState('')
    return <AccountPage title="계정 가입" description="이메일을 확인한 뒤 업무 공간에 로그인할 수 있습니다. 가입만으로 회사 접근 권한이 생기지 않습니다.">
        {accepted ? <AccountNotice>{accountAcceptedText}</AccountNotice> : <AccountPasswordForm withEmail passwordLabel="비밀번호" submitLabel="가입 요청" error={error} onSubmit={async (email, password) => {
            setError('')
            try { await authApi.register(email, password); setAccepted(true) }
            catch (error) { setError(accountError(error)); throw error }
        }} />}
    </AccountPage>
}
