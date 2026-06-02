-- Migration 0010: agent_review_approval_events
-- Records human review decisions on agent approval packets.
-- This table is append-only. No delete policy. No broad update policy.
-- No runtime execution is authorized from this table alone.
-- A future ledger entry is required before any execution can proceed.

CREATE TABLE IF NOT EXISTS agent_review_approval_events (
  id                               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                          uuid        NOT NULL,
  source_packet_id                 text        NOT NULL,
  source_queue_item_id             text        NOT NULL,
  agent_id                         text        NOT NULL,
  outcome_id                       text        NOT NULL,
  reviewer_id                      text        NOT NULL,
  reviewer_role                    text        NOT NULL,
  decision                         text        NOT NULL,
  decision_rationale               text        NOT NULL,
  approved_scope                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  constraints                      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  guardrails                       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  human_approved                   boolean     NOT NULL DEFAULT false,
  ledger_required_before_execution boolean     NOT NULL DEFAULT true,
  no_runtime_execution_authorized  boolean     NOT NULL DEFAULT true,
  no_auto_approval                 boolean     NOT NULL DEFAULT true,
  approval_event_only              boolean     NOT NULL DEFAULT true,
  status                           text        NOT NULL,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  expires_at                       timestamptz          NULL,
  revoked_at                       timestamptz          NULL,
  revocation_reason                text                 NULL,
  future_ledger_entry_id           uuid                 NULL,
  metadata                         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Enum guards
  CONSTRAINT chk_arae_decision CHECK (
    decision IN ('approved', 'rejected', 'needs_more_evidence', 'expired', 'revoked')
  ),
  CONSTRAINT chk_arae_status CHECK (
    status IN ('draft', 'valid_human_decision', 'invalid', 'expired', 'revoked')
  ),

  -- Safety invariants: these columns must never be false
  CONSTRAINT chk_arae_ledger_required CHECK (ledger_required_before_execution = true),
  CONSTRAINT chk_arae_no_runtime_exec CHECK (no_runtime_execution_authorized = true),
  CONSTRAINT chk_arae_no_auto_approval CHECK (no_auto_approval = true),
  CONSTRAINT chk_arae_approval_event_only CHECK (approval_event_only = true),

  -- human_approved must agree with decision
  CONSTRAINT chk_arae_human_approved_coherence CHECK (
    (human_approved = true  AND decision = 'approved') OR
    (human_approved = false AND decision != 'approved')
  ),

  -- expires_at is required for approved decisions
  CONSTRAINT chk_arae_expires_at_when_approved CHECK (
    decision != 'approved' OR expires_at IS NOT NULL
  ),

  -- Non-empty string guards
  CONSTRAINT chk_arae_decision_rationale_nonempty    CHECK (decision_rationale     <> ''),
  CONSTRAINT chk_arae_reviewer_id_nonempty           CHECK (reviewer_id            <> ''),
  CONSTRAINT chk_arae_reviewer_role_nonempty         CHECK (reviewer_role          <> ''),
  CONSTRAINT chk_arae_source_packet_id_nonempty      CHECK (source_packet_id       <> ''),
  CONSTRAINT chk_arae_source_queue_item_id_nonempty  CHECK (source_queue_item_id   <> ''),
  CONSTRAINT chk_arae_agent_id_nonempty              CHECK (agent_id               <> ''),
  CONSTRAINT chk_arae_outcome_id_nonempty            CHECK (outcome_id             <> '')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arae_user_id
  ON agent_review_approval_events(user_id);

CREATE INDEX IF NOT EXISTS idx_arae_source_packet_id
  ON agent_review_approval_events(source_packet_id);

CREATE INDEX IF NOT EXISTS idx_arae_source_queue_item_id
  ON agent_review_approval_events(source_queue_item_id);

CREATE INDEX IF NOT EXISTS idx_arae_agent_id
  ON agent_review_approval_events(agent_id);

CREATE INDEX IF NOT EXISTS idx_arae_outcome_id
  ON agent_review_approval_events(outcome_id);

CREATE INDEX IF NOT EXISTS idx_arae_decision
  ON agent_review_approval_events(decision);

CREATE INDEX IF NOT EXISTS idx_arae_status
  ON agent_review_approval_events(status);

CREATE INDEX IF NOT EXISTS idx_arae_created_at
  ON agent_review_approval_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arae_expires_at
  ON agent_review_approval_events(expires_at);

CREATE INDEX IF NOT EXISTS idx_arae_future_ledger_entry_id
  ON agent_review_approval_events(future_ledger_entry_id);

-- Row Level Security
ALTER TABLE agent_review_approval_events ENABLE ROW LEVEL SECURITY;

-- Owner may read their own rows only
CREATE POLICY "owner_select" ON agent_review_approval_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Owner may insert rows that belong to themselves only
CREATE POLICY "owner_insert" ON agent_review_approval_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- NO DELETE policy (append-only ledger)
-- NO broad UPDATE policy
-- NO USING (true) or WITH CHECK (true)
-- NO public permissive policy
