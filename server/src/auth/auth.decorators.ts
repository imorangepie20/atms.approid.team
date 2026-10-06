import { SetMetadata } from '@nestjs/common'
import type { Permission } from './access-policy'

// [F08-13 추가] 메타데이터는 서버 코드의 선언이다. 브라우저가 보내는 활동·역할 플래그와 구분한다.
export const PUBLIC = 'atms.public'
export const ACTIVITY = 'atms.activity'
export const PERMISSION = 'atms.permission'
export const REAUTH = 'atms.reauth'
export const Public = () => SetMetadata(PUBLIC, true)
export const UserActivity = () => SetMetadata(ACTIVITY, true)
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION, permission)
export const RequireReauthentication = () => SetMetadata(REAUTH, true)
