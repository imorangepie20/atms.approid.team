import { createHash } from 'node:crypto'
import type { JournalStatus, JournalWorkflowActionKind } from '../generated/prisma/client'

// [F05 W2/W5] 허용 상태 전이와 재요청 본문 해시는 HTTP/DB 표현과 분리한다.
export const workflowTransitions: Record<JournalWorkflowActionKind, { before: JournalStatus; after: JournalStatus }> = {
  SUBMIT: { before: 'DRAFT', after: 'SUBMITTED' },
  APPROVE: { before: 'SUBMITTED', after: 'APPROVED' },
  REJECT: { before: 'SUBMITTED', after: 'REJECTED' },
  RETURN_TO_DRAFT: { before: 'REJECTED', after: 'DRAFT' },
  // [F05-01 확정] 확정 취소는 별도 정정 전표 단계에서 다루므로 역전이는 만들지 않는다.
  CONFIRM: { before: 'APPROVED', after: 'POSTED' },
}

export function workflowInputHash(journalId: string, action: JournalWorkflowActionKind,
  input: { version: number; reason?: string }): string {
  return createHash('sha256').update(JSON.stringify({ journalId, action, version: input.version, reason: input.reason ?? null })).digest('hex')
}
