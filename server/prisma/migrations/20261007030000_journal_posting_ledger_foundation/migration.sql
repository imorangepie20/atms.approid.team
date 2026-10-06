-- [F05-01/F04-08~10] 승인된 전표를 한 번만 확정하고 기존 불변 분개를 원장의 단일 원천으로 사용한다.
ALTER TYPE "JournalStatus" ADD VALUE 'POSTED';
ALTER TYPE "JournalWorkflowActionKind" ADD VALUE 'CONFIRM';

-- posting이 workflow action을 회사 복합키로 참조할 수 있게 기존 PK 외의 회사 경계 키를 추가한다.
ALTER TABLE journal_workflow_actions
  ADD CONSTRAINT journal_workflow_company_id_id_key UNIQUE (company_id,id);

CREATE TABLE journal_postings (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  journal_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  action_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  posted_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT journal_posting_company_journal_key UNIQUE (company_id,journal_id),
  CONSTRAINT journal_posting_company_submission_key UNIQUE (company_id,submission_id),
  CONSTRAINT journal_posting_company_action_key UNIQUE (company_id,action_id),
  CONSTRAINT journal_posting_journal_fk FOREIGN KEY (company_id,journal_id)
    REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT journal_posting_submission_fk FOREIGN KEY (company_id,submission_id)
    REFERENCES journal_submissions(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT journal_posting_action_fk FOREIGN KEY (company_id,action_id)
    REFERENCES journal_workflow_actions(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX journal_posting_company_time_idx ON journal_postings(company_id,posted_at);
CREATE INDEX journal_posted_ledger_order_idx ON journal_entries(company_id,status,accounting_date,number,id);

-- 기존 DB CHECK에 새 전이를 정확히 한 종류만 추가한다.
ALTER TABLE journal_workflow_actions DROP CONSTRAINT journal_workflow_transition;
ALTER TABLE journal_workflow_actions ADD CONSTRAINT journal_workflow_transition CHECK (
  (action='SUBMIT' AND status_before='DRAFT' AND status_after='SUBMITTED') OR
  (action='APPROVE' AND status_before='SUBMITTED' AND status_after='APPROVED') OR
  (action='REJECT' AND status_before='SUBMITTED' AND status_after='REJECTED') OR
  (action='RETURN_TO_DRAFT' AND status_before='REJECTED' AND status_after='DRAFT') OR
  (action='CONFIRM' AND status_before='APPROVED' AND status_after='POSTED'));

-- 헤더는 APPROVED -> POSTED만 추가로 허용하며 상태 외의 업무 원본은 그대로 불변이다.
CREATE OR REPLACE FUNCTION journal_workflow_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_status "JournalStatus";
BEGIN
  IF TG_TABLE_NAME IN ('journal_submissions','journal_workflow_actions','journal_postings') THEN
    IF TG_OP IN ('UPDATE','DELETE') THEN RAISE EXCEPTION 'Immutable journal workflow history' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='journal_entries' THEN
    IF TG_OP='DELETE' THEN
      IF OLD.status<>'DRAFT' OR EXISTS (SELECT 1 FROM journal_submissions WHERE company_id=OLD.company_id AND journal_id=OLD.id)
      THEN RAISE EXCEPTION 'Submitted journal cannot be deleted' USING ERRCODE='23514'; END IF;
      RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' AND NEW.status<>OLD.status THEN
      IF NOT ((OLD.status='DRAFT' AND NEW.status='SUBMITTED') OR
              (OLD.status='SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED')) OR
              (OLD.status='REJECTED' AND NEW.status='DRAFT') OR
              (OLD.status='APPROVED' AND NEW.status='POSTED')) OR NEW.version<>OLD.version+1 OR
         (NEW.id,NEW.company_id,NEW.fiscal_year_id,NEW.number,NEW.accounting_date,NEW.memo,NEW.currency,
          NEW.counterparty_id,NEW.debit_total,NEW.credit_total,NEW.line_count,NEW.evidence_count,
          NEW.created_by_id,NEW.creation_request_id,NEW.creation_input_hash,NEW.created_at)
          IS DISTINCT FROM
         (OLD.id,OLD.company_id,OLD.fiscal_year_id,OLD.number,OLD.accounting_date,OLD.memo,OLD.currency,
          OLD.counterparty_id,OLD.debit_total,OLD.credit_total,OLD.line_count,OLD.evidence_count,
          OLD.created_by_id,OLD.creation_request_id,OLD.creation_input_hash,OLD.created_at) THEN
        RAISE EXCEPTION 'Invalid journal workflow transition' USING ERRCODE='23514';
      END IF;
    ELSIF TG_OP='UPDATE' THEN
      IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted journal is immutable' USING ERRCODE='23514'; END IF;
      IF (NEW.id,NEW.company_id,NEW.fiscal_year_id,NEW.number,NEW.currency,NEW.created_by_id,
          NEW.creation_request_id,NEW.creation_input_hash,NEW.created_at)
         IS DISTINCT FROM
         (OLD.id,OLD.company_id,OLD.fiscal_year_id,OLD.number,OLD.currency,OLD.created_by_id,
          OLD.creation_request_id,OLD.creation_input_hash,OLD.created_at)
      THEN RAISE EXCEPTION 'Journal identity is immutable' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO parent_status FROM journal_entries WHERE company_id=COALESCE(NEW.company_id,OLD.company_id)
    AND id=COALESCE(NEW.journal_id,OLD.journal_id);
  IF parent_status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted journal content is immutable' USING ERRCODE='23514'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER journal_postings_immutable BEFORE UPDATE OR DELETE ON journal_postings
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();

-- 커밋 시 posting과 CONFIRM 이력이 같은 회사·전표·제출본·행위자·시각을 가리키는지 상호 검증한다.
CREATE FUNCTION journal_posting_integrity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE j journal_entries%ROWTYPE; s journal_submissions%ROWTYPE; a journal_workflow_actions%ROWTYPE;
BEGIN
  SELECT * INTO j FROM journal_entries WHERE company_id=NEW.company_id AND id=NEW.journal_id;
  SELECT * INTO s FROM journal_submissions WHERE company_id=NEW.company_id AND id=NEW.submission_id;
  SELECT * INTO a FROM journal_workflow_actions WHERE company_id=NEW.company_id AND id=NEW.action_id;
  IF j.id IS NULL OR s.id IS NULL OR a.id IS NULL OR j.status<>'POSTED' OR
     s.journal_id<>NEW.journal_id OR a.journal_id<>NEW.journal_id OR a.submission_id<>NEW.submission_id OR
     a.action<>'CONFIRM' OR a.status_before<>'APPROVED' OR a.status_after<>'POSTED' OR
     a.actor_id<>NEW.actor_id OR a.created_at<>NEW.posted_at THEN
    RAISE EXCEPTION 'Journal posting does not match confirmed workflow' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_posting_integrity AFTER INSERT ON journal_postings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_posting_integrity();

CREATE FUNCTION journal_confirm_posting_required() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action='CONFIRM' AND NOT EXISTS (
    SELECT 1 FROM journal_postings p WHERE p.company_id=NEW.company_id AND p.action_id=NEW.id
      AND p.journal_id=NEW.journal_id AND p.submission_id=NEW.submission_id)
  THEN RAISE EXCEPTION 'Journal confirmation requires posting' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_confirm_posting_required AFTER INSERT ON journal_workflow_actions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_confirm_posting_required();

ALTER TABLE audit_events DROP CONSTRAINT audit_type_known;
ALTER TABLE audit_events ADD CONSTRAINT audit_type_known CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DEACTIVATED','JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED',
  'JOURNAL_SUBMITTED','JOURNAL_APPROVED','JOURNAL_REJECTED','JOURNAL_RETURNED_TO_DRAFT','JOURNAL_POSTED'
));
