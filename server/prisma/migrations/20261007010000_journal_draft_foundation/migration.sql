-- [F04 J1~J8] 기존 업무 행/과거 SQL을 변경하지 않고 초안 저장 구조만 추가한다.
BEGIN;
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT');
CREATE UNIQUE INDEX "fiscal_years_company_id_id_key" ON "fiscal_years"("company_id","id");
CREATE TABLE "journal_entries" (
  "id" UUID PRIMARY KEY, "company_id" UUID NOT NULL, "fiscal_year_id" UUID NOT NULL,
  "number" VARCHAR(15) NOT NULL, "accounting_date" DATE NOT NULL, "memo" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'KRW', "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "counterparty_id" UUID, "debit_total" NUMERIC(24,6) NOT NULL, "credit_total" NUMERIC(24,6) NOT NULL,
  "line_count" INTEGER NOT NULL, "evidence_count" INTEGER NOT NULL, "created_by_id" UUID NOT NULL,
  "creation_request_id" UUID NOT NULL, "creation_input_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_company_fk" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_year_fk" FOREIGN KEY (company_id,fiscal_year_id) REFERENCES fiscal_years(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_party_fk" FOREIGN KEY (company_id,counterparty_id) REFERENCES counterparties(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_creator_fk" FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_header_valid" CHECK (currency='KRW' AND version>0 AND char_length(memo) BETWEEN 1 AND 500
    AND number ~ '^[0-9]{8}-[0-9]{6}$' AND right(number,6)<>'000000'
    AND creation_input_hash ~ '^[0-9a-f]{64}$' AND line_count BETWEEN 2 AND 100 AND evidence_count BETWEEN 0 AND 20
    AND debit_total>0 AND debit_total=trunc(debit_total) AND credit_total=debit_total)
);
CREATE UNIQUE INDEX "journal_entries_company_id_id_key" ON journal_entries(company_id,id);
CREATE UNIQUE INDEX "journal_entries_company_id_number_key" ON journal_entries(company_id,number);
CREATE UNIQUE INDEX "journal_entries_company_id_creation_request_id_key" ON journal_entries(company_id,creation_request_id);
CREATE INDEX "journal_entries_company_id_accounting_date_idx" ON journal_entries(company_id,accounting_date);
CREATE TABLE "journal_lines" (
  "id" UUID PRIMARY KEY, "company_id" UUID NOT NULL, "journal_id" UUID NOT NULL, "position" INTEGER NOT NULL,
  "account_id" UUID NOT NULL, "debit" NUMERIC(24,6) NOT NULL, "credit" NUMERIC(24,6) NOT NULL, "memo" TEXT,
  CONSTRAINT "journal_line_parent_fk" FOREIGN KEY (company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_line_account_fk" FOREIGN KEY (company_id,account_id) REFERENCES company_accounts(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_line_valid" CHECK (position BETWEEN 1 AND 100 AND debit=trunc(debit) AND credit=trunc(credit)
    AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)) AND (memo IS NULL OR char_length(memo) BETWEEN 1 AND 500))
);
CREATE UNIQUE INDEX "journal_lines_company_id_journal_id_position_key" ON journal_lines(company_id,journal_id,position);
CREATE INDEX "journal_lines_company_id_account_id_idx" ON journal_lines(company_id,account_id);
CREATE TABLE "journal_evidences" (
  "company_id" UUID NOT NULL, "journal_id" UUID NOT NULL, "evidence_id" UUID NOT NULL,
  PRIMARY KEY (company_id,journal_id,evidence_id),
  CONSTRAINT "journal_evidence_parent_fk" FOREIGN KEY (company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_evidence_source_fk" FOREIGN KEY (company_id,evidence_id) REFERENCES evidences(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "journal_evidences_company_id_evidence_id_journal_id_idx" ON journal_evidences(company_id,evidence_id,journal_id);
CREATE TABLE "journal_number_sequences" (
  "company_id" UUID NOT NULL, "fiscal_year_id" UUID NOT NULL, "last_number" INTEGER NOT NULL,
  PRIMARY KEY (company_id,fiscal_year_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (company_id,fiscal_year_id) REFERENCES fiscal_years(company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "journal_sequence_valid" CHECK (last_number BETWEEN 1 AND 999999)
);
-- [J7] 중간 삭제/재삽입은 허용하지만 커밋된 헤더/실제 분개/연결은 반드시 일치한다.
-- SQL을 직접 사용해 거짓 헤더 합계나 다른 회사 참조를 저장하는 것도 차단한다.
CREATE FUNCTION check_journal_draft_integrity(p_company UUID,p_journal UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE j journal_entries%ROWTYPE; n BIGINT; d NUMERIC; c NUMERIC; links BIGINT; first_pos INTEGER; last_pos INTEGER; y fiscal_years%ROWTYPE;
BEGIN
  SELECT * INTO j FROM journal_entries WHERE company_id=p_company AND id=p_journal;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0),min(position),max(position)
    INTO n,d,c,first_pos,last_pos FROM journal_lines WHERE company_id=p_company AND journal_id=p_journal;
  SELECT count(*) INTO links FROM journal_evidences WHERE company_id=p_company AND journal_id=p_journal;
  SELECT * INTO y FROM fiscal_years WHERE company_id=p_company AND id=j.fiscal_year_id;
  IF n<>j.line_count OR n<2 OR n>100 OR d<>j.debit_total OR c<>j.credit_total OR d<>c OR d<=0
      OR first_pos<>1 OR last_pos<>n OR links<>j.evidence_count OR links>20
      OR j.accounting_date<y.start_date OR j.accounting_date>y.end_date
      OR left(j.number,8)<>to_char(y.start_date,'YYYYMMDD') THEN
    RAISE EXCEPTION 'Invalid journal draft integrity' USING ERRCODE='23514';
  END IF;
END $$;
CREATE FUNCTION enforce_journal_draft_integrity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='journal_entries' THEN
    IF TG_OP<>'DELETE' THEN PERFORM check_journal_draft_integrity(NEW.company_id,NEW.id); END IF;
    IF TG_OP<>'INSERT' THEN PERFORM check_journal_draft_integrity(OLD.company_id,OLD.id); END IF;
  ELSE
    IF TG_OP<>'DELETE' THEN PERFORM check_journal_draft_integrity(NEW.company_id,NEW.journal_id); END IF;
    IF TG_OP<>'INSERT' THEN PERFORM check_journal_draft_integrity(OLD.company_id,OLD.journal_id); END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_header_integrity AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_journal_draft_integrity();
CREATE CONSTRAINT TRIGGER journal_line_integrity AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_journal_draft_integrity();
CREATE CONSTRAINT TRIGGER journal_evidence_integrity AFTER INSERT OR UPDATE OR DELETE ON journal_evidences
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_journal_draft_integrity();
ALTER TABLE audit_events DROP CONSTRAINT audit_type_known;
ALTER TABLE audit_events ADD CONSTRAINT audit_type_known CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DEACTIVATED','JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED'
));
COMMIT;
