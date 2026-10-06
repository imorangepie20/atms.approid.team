import { AccountEmailRequestForm, AccountPage } from '../../components/auth/AccountPasswordForm'
import { authApi } from '../../lib/api'

export default function ForgotPassword() {
    return <AccountPage title="비밀번호 복구" description="이메일을 입력해 복구를 요청하세요. 접수 안내는 계정의 존재나 메일 배달 완료를 뜻하지 않습니다.">
        <AccountEmailRequestForm submitLabel="복구 메일 요청" onSend={authApi.requestReset} />
    </AccountPage>
}
