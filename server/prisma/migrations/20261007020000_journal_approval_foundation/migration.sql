-- [F05 W1/W4~W6] 이 migration은 격리 시험 DB용이다. 운영 적용은 후속 배포 결정에 따른다.
ALTER TYPE "JournalStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "JournalStatus" ADD VALUE 'APPROVED';
ALTER TYPE "JournalStatus" ADD VALUE 'REJECTED';
CREATE TYPE "JournalWorkflowActionKind" AS ENUM ('SUBMIT','APPROVE','REJECT','RETURN_TO_DRAFT');

CREATE TABLE journal_submissions (
  id UUID PRIMARY KEY, company_id UUID NOT NULL, journal_id UUID NOT NULL, content JSONB NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT journal_submission_company_id_id_key UNIQUE (company_id,id),
  CONSTRAINT journal_submission_parent_fk FOREIGN KEY (company_id,journal_id)
    REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT journal_submission_content_object CHECK (jsonb_typeof(content)='object')
);
CREATE INDEX journal_submission_journal_time_idx ON journal_submissions(company_id,journal_id,created_at);

CREATE TABLE journal_workflow_actions (
  id UUID PRIMARY KEY, company_id UUID NOT NULL, journal_id UUID NOT NULL, submission_id UUID NOT NULL,
  action_request_id UUID NOT NULL, action "JournalWorkflowActionKind" NOT NULL, input_hash CHAR(64) NOT NULL,
  status_before "JournalStatus" NOT NULL, status_after "JournalStatus" NOT NULL,
  version_before INTEGER NOT NULL, version_after INTEGER NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason TEXT, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT journal_workflow_company_request_key UNIQUE (company_id,action_request_id),
  CONSTRAINT journal_workflow_company_journal_version_key UNIQUE (company_id,journal_id,version_after),
  CONSTRAINT journal_workflow_parent_fk FOREIGN KEY (company_id,journal_id)
    REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT journal_workflow_submission_fk FOREIGN KEY (company_id,submission_id)
    REFERENCES journal_submissions(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT journal_workflow_version CHECK (version_before>0 AND version_after=version_before+1),
  CONSTRAINT journal_workflow_reason CHECK (
    (action='REJECT' AND reason IS NOT NULL AND char_length(reason) BETWEEN 1 AND 500)
    OR (action<>'REJECT' AND reason IS NULL)),
  CONSTRAINT journal_workflow_transition CHECK (
    (action='SUBMIT' AND status_before='DRAFT' AND status_after='SUBMITTED') OR
    (action='APPROVE' AND status_before='SUBMITTED' AND status_after='APPROVED') OR
    (action='REJECT' AND status_before='SUBMITTED' AND status_after='REJECTED') OR
    (action='RETURN_TO_DRAFT' AND status_before='REJECTED' AND status_after='DRAFT'))
);
CREATE INDEX journal_workflow_journal_time_idx ON journal_workflow_actions(company_id,journal_id,created_at,id);

-- [F05 W6] 비초안 원본과 이력은 DB 직접 변경도 막는다. 상태 전이는 버전+1과 이력 삽입이 필요하다.
CREATE FUNCTION journal_workflow_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_status "JournalStatus";
BEGIN
  IF TG_TABLE_NAME IN ('journal_submissions','journal_workflow_actions') THEN
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
              (OLD.status='REJECTED' AND NEW.status='DRAFT')) OR NEW.version<>OLD.version+1 OR
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
CREATE TRIGGER journal_workflow_header_guard BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();
CREATE TRIGGER journal_workflow_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();
CREATE TRIGGER journal_workflow_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_evidences
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();
CREATE TRIGGER journal_submissions_immutable BEFORE UPDATE OR DELETE ON journal_submissions
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();
CREATE TRIGGER journal_actions_immutable BEFORE UPDATE OR DELETE ON journal_workflow_actions
  FOR EACH ROW EXECUTE FUNCTION journal_workflow_guard();

-- 상태 변경만 SQL로 실행한 경우 커밋 시 대응 이력이 없으면 전체 트랜잭션을 되돌린다.
CREATE FUNCTION journal_workflow_transition_recorded() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_workflow_actions a WHERE a.company_id=NEW.company_id AND a.journal_id=NEW.id
      AND a.version_before=OLD.version AND a.version_after=NEW.version AND a.status_before=OLD.status AND a.status_after=NEW.status)
  THEN RAISE EXCEPTION 'Missing journal workflow action' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_workflow_record_required AFTER UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION journal_workflow_transition_recorded();

-- 별도 SQL로 가짜 이력/제출본만 추가하거나 다른 전표의 제출본을 붙이는 것도 커밋 시 거부한다.
CREATE FUNCTION journal_workflow_action_integrity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE j journal_entries%ROWTYPE; s journal_submissions%ROWTYPE;
BEGIN
  SELECT * INTO j FROM journal_entries WHERE company_id=NEW.company_id AND id=NEW.journal_id;
  SELECT * INTO s FROM journal_submissions WHERE company_id=NEW.company_id AND id=NEW.submission_id;
  IF j.id IS NULL OR s.id IS NULL OR s.journal_id<>NEW.journal_id OR
     j.status<>NEW.status_after OR j.version<>NEW.version_after THEN
    RAISE EXCEPTION 'Journal workflow action does not match current state' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_workflow_action_integrity AFTER INSERT ON journal_workflow_actions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_workflow_action_integrity();
CREATE FUNCTION journal_submission_action_required() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_workflow_actions a WHERE a.company_id=NEW.company_id AND a.journal_id=NEW.journal_id
      AND a.submission_id=NEW.id AND a.action='SUBMIT') THEN
    RAISE EXCEPTION 'Journal submission requires submit action' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_submission_action_required AFTER INSERT ON journal_submissions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_submission_action_required();

ALTER TABLE audit_events DROP CONSTRAINT audit_type_known;
ALTER TABLE audit_events ADD CONSTRAINT audit_type_known CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DEACTIVATED','JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED',
  'JOURNAL_SUBMITTED','JOURNAL_APPROVED','JOURNAL_REJECTED','JOURNAL_RETURNED_TO_DRAFT'
));
