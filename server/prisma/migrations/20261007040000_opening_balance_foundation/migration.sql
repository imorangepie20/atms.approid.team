-- [F04-02 O1~O8] 기존 전표 승인 엔진을 재사용하면서 일반 전표와 기초 잔액의 저장 규칙을 DB에서도 분리한다.
CREATE TYPE "JournalKind" AS ENUM ('STANDARD','OPENING');
ALTER TABLE journal_entries ADD COLUMN kind "JournalKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE journal_entries ADD COLUMN opening_source_fiscal_year_id UUID;
ALTER TABLE journal_entries ADD CONSTRAINT journal_opening_source_year_fk
  FOREIGN KEY (company_id,opening_source_fiscal_year_id) REFERENCES fiscal_years(company_id,id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX journal_entries_one_opening_per_year
  ON journal_entries(company_id,fiscal_year_id) WHERE kind='OPENING';
CREATE INDEX journal_entries_company_kind_year_idx ON journal_entries(company_id,kind,fiscal_year_id);

-- STANDARD의 기존 양수/2행 제약은 그대로 두고 OPENING에만 명시적 0행/0원 확인을 허용한다.
ALTER TABLE journal_entries DROP CONSTRAINT journal_header_valid;
ALTER TABLE journal_entries ADD CONSTRAINT journal_header_valid CHECK (
  currency='KRW' AND version>0 AND char_length(memo) BETWEEN 1 AND 500
  AND number ~ '^[0-9]{8}-[0-9]{6}$' AND right(number,6)<>'000000'
  AND creation_input_hash ~ '^[0-9a-f]{64}$' AND evidence_count BETWEEN 0 AND 20
  AND (
    (kind='STANDARD' AND opening_source_fiscal_year_id IS NULL AND line_count BETWEEN 2 AND 100
      AND debit_total>0 AND debit_total=trunc(debit_total) AND credit_total=debit_total)
    OR
    (kind='OPENING' AND counterparty_id IS NULL AND debit_total=trunc(debit_total) AND credit_total=debit_total
      AND ((line_count=0 AND debit_total=0) OR (line_count BETWEEN 2 AND 100 AND debit_total>0)))
  ));

CREATE OR REPLACE FUNCTION check_journal_draft_integrity(p_company UUID,p_journal UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE j journal_entries%ROWTYPE; n BIGINT; d NUMERIC; c NUMERIC; links BIGINT; first_pos INTEGER; last_pos INTEGER;
  y fiscal_years%ROWTYPE; previous_id UUID;
BEGIN
  SELECT * INTO j FROM journal_entries WHERE company_id=p_company AND id=p_journal;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0),min(position),max(position)
    INTO n,d,c,first_pos,last_pos FROM journal_lines WHERE company_id=p_company AND journal_id=p_journal;
  SELECT count(*) INTO links FROM journal_evidences WHERE company_id=p_company AND journal_id=p_journal;
  SELECT * INTO y FROM fiscal_years WHERE company_id=p_company AND id=j.fiscal_year_id;
  IF y.id IS NULL OR n<>j.line_count OR d<>j.debit_total OR c<>j.credit_total OR d<>c
      OR links<>j.evidence_count OR links>20 OR left(j.number,8)<>to_char(y.start_date,'YYYYMMDD') THEN
    RAISE EXCEPTION 'Invalid journal draft integrity' USING ERRCODE='23514';
  END IF;
  IF j.kind='STANDARD' THEN
    IF j.opening_source_fiscal_year_id IS NOT NULL OR n<2 OR n>100 OR d<=0
        OR first_pos<>1 OR last_pos<>n OR j.accounting_date<y.start_date OR j.accounting_date>y.end_date THEN
      RAISE EXCEPTION 'Invalid standard journal integrity' USING ERRCODE='23514';
    END IF;
  ELSIF j.kind='OPENING' THEN
    SELECT id INTO previous_id FROM fiscal_years
      WHERE company_id=p_company AND end_date<y.start_date ORDER BY end_date DESC LIMIT 1;
    IF j.counterparty_id IS NOT NULL OR j.accounting_date<>y.start_date
        OR previous_id IS DISTINCT FROM j.opening_source_fiscal_year_id
        OR NOT ((n=0 AND d=0 AND first_pos IS NULL AND last_pos IS NULL)
          OR (n BETWEEN 2 AND 100 AND d>0 AND first_pos=1 AND last_pos=n AND links>=1)) THEN
      RAISE EXCEPTION 'Invalid opening balance integrity' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown journal kind' USING ERRCODE='23514';
  END IF;
END $$;

-- kind는 전표의 생성 경로 정체성이며 source는 DRAFT에서만 수정할 수 있다. 제출 이후에는 둘 다 불변이다.
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
         (NEW.id,NEW.company_id,NEW.fiscal_year_id,NEW.kind,NEW.opening_source_fiscal_year_id,NEW.number,
          NEW.accounting_date,NEW.memo,NEW.currency,NEW.counterparty_id,NEW.debit_total,NEW.credit_total,
          NEW.line_count,NEW.evidence_count,NEW.created_by_id,NEW.creation_request_id,NEW.creation_input_hash,NEW.created_at)
          IS DISTINCT FROM
         (OLD.id,OLD.company_id,OLD.fiscal_year_id,OLD.kind,OLD.opening_source_fiscal_year_id,OLD.number,
          OLD.accounting_date,OLD.memo,OLD.currency,OLD.counterparty_id,OLD.debit_total,OLD.credit_total,
          OLD.line_count,OLD.evidence_count,OLD.created_by_id,OLD.creation_request_id,OLD.creation_input_hash,OLD.created_at) THEN
        RAISE EXCEPTION 'Invalid journal workflow transition' USING ERRCODE='23514';
      END IF;
    ELSIF TG_OP='UPDATE' THEN
      IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted journal is immutable' USING ERRCODE='23514'; END IF;
      IF (NEW.id,NEW.company_id,NEW.fiscal_year_id,NEW.kind,NEW.number,NEW.currency,NEW.created_by_id,
          NEW.creation_request_id,NEW.creation_input_hash,NEW.created_at)
         IS DISTINCT FROM
         (OLD.id,OLD.company_id,OLD.fiscal_year_id,OLD.kind,OLD.number,OLD.currency,OLD.created_by_id,
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

ALTER TABLE audit_events DROP CONSTRAINT audit_type_known;
ALTER TABLE audit_events ADD CONSTRAINT audit_type_known CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DEACTIVATED','JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED',
  'JOURNAL_SUBMITTED','JOURNAL_APPROVED','JOURNAL_REJECTED','JOURNAL_RETURNED_TO_DRAFT','JOURNAL_POSTED',
  'OPENING_BALANCE_CREATED','OPENING_BALANCE_UPDATED'
));
