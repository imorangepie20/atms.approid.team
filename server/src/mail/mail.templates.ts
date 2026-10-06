import type { ActionPurpose } from '../auth/action-token.service'
import { AUTH_POLICY, COMPANY_ACCESS_POLICY } from '../config/app.config'

export interface MailMessage { readonly to: string; readonly subject: string; readonly text: string }
// [F01 메일 추가] 사용자 HTML을 조합하지 않는 텍스트 메일이다. URL은 검증한 Origin으로만 만든다.
// fragment의 토큰은 브라우저가 서버 GET/Referer에 자동 첨부하지 않는다. 향후 화면에서 POST로 소비한다.
export function actionMessage(to: string, origin: string, purpose: ActionPurpose, token: string): MailMessage {
  const verify = purpose === 'EMAIL_VERIFICATION'
  const url = new URL(verify ? '/verify-email' : '/reset-password', origin)
  url.hash = `token=${token}`
  // 안내 문구도 중앙 만료 설정에서 계산한다. 정책 변경 시 링크와 메일 문구가 따로 달라지지 않는다.
  const duration = verify ? `${AUTH_POLICY.verificationMs / (60 * 60 * 1000)}시간` : `${AUTH_POLICY.resetMs / (60 * 1000)}분`
  return { to, subject: verify ? 'ATMS 이메일 확인' : 'ATMS 비밀번호 재설정',
    text: `${verify ? '이메일 확인 후 비밀번호를 설정하세요.' : '새 비밀번호를 설정하세요.'} 링크는 ${duration} 동안 유효합니다.\n${url.href}\n요청하지 않았다면 이 메일을 무시하세요.` }
}
export function passwordChangedMessage(to: string): MailMessage {
  return { to, subject: 'ATMS 비밀번호 변경 알림', text: '비밀번호가 변경되어 모든 로그인 세션이 종료되었습니다. 다시 로그인해 주세요. 본인의 변경이 아니라면 비밀번호 복구를 진행하세요.' }
}
// [F01 초대 추가] 기존 검증 Origin만 받고 token을 fragment에 넣는다. 본문은 텍스트이며 회사명 HTML은 합성하지 않는다.
// 링크 열기만으로 소속을 만들지 않는다. 실제 웹 화면은 후속이며 API는 확인 계정의 POST 수락만 처리한다.
export function invitationMessage(to: string, origin: string, token: string): MailMessage {
  const url = new URL('/accept-company-invitation', origin)
  url.hash = `token=${token}`
  return { to, subject: 'ATMS 회사 초대', text: `지정 이메일로 가입·확인·로그인한 뒤 회사 초대를 수락하세요. 링크는 ${COMPANY_ACCESS_POLICY.invitationMs / (24 * 60 * 60 * 1000)}일 동안 유효합니다.\n${url.href}\n요청하지 않았다면 이 메일을 무시하세요.` }
}
