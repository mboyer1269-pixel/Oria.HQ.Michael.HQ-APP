-- Migration 0011: agent_review_approval_packets
-- Persists human-review approval packets built from agent review queue items.
-- This table is append-only. No delete policy. No broad update policy.
-- No runtime execution is authorized from this table alone.
-- A future ledger entry is required before any execution can proceed.
--
-- Enum values are derived directly from TypeScript source contracts:
--   status         → AgentReviewApprovalPacketStatus (agent-review-approval-packet.ts)
--   requested_decision → AgentReviewApprovalPacketDecision (agent-review-approval-packet.ts)
--   source_decision → AgentOutcomeReviewDecision (observed-agent-outcome-review.ts)

CREATE TABLE IF NOT EXISTS agent_review_approval_packets (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid        NOT NULL,
  packet_id                   text        NOT NULL,
  queue_item_id               text        NOT NULL,
  agent_id                    text        NOT NULL,
  outcome_id                  text        NOT NULL,
  priority                    text        NOT NULL,
  status                      text        NOT NULL,
  requested_decision          text        NOT NULL,
  source_decision             text        NOT NULL,
  source_next_action          text        NOT NULL,
  risk_summary                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  required_review             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rationale                   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  executive_summary           text        NOT NULL,
  guardrails                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  approval_required           boolean     NOT NULL DEFAULT true,
  human_on_the_loop           boolean     NOT NULL DEFAULT true,
  no_execution_authorized     boolean     NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz          NULL,
  metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Unique: each packet_id identifies exactly one persisted packet
  CONSTRAINT uq_arap_packet_id UNIQUE (packet_id),

  -- Enum guards
  CONSTRAINT chk_arap_priority CHECK (
    priority IN ('critical', 'high', 'medium', 'low')
  ),
  CONSTRAINT chk_arap_status CHECK (
    status IN (
      'draft_for_human_review',
      'ready_for_human_review',
      'blocked_pending_more_evidence'
    )
  ),
  CONSTRAINT chk_arap_requested_decision CHECK (
    requested_decision IN (
      'approve_controlled_expansion_review',
      'approve_continue_monitoring',
      'approve_knowledge_pack_improvement_review',
      'approve_more_observation_collection',
      'reject_or_reduce_autonomy',
      'block_autonomy_increase'
    )
  ),
  CONSTRAINT chk_arap_source_decision CHECK (
    source_decision IN (
      'continue_monitoring',
      'require_more_observations',
      'improve_knowledge_pack',
      'block_autonomy_increase',
      'eligible_for_controlled_expansion',
      'reduce_autonomy_recommendation'
    )
  ),

  -- Safety invariants: these columns must always be true
  CONSTRAINT chk_arap_approval_required        CHECK (approval_required        = true),
  CONSTRAINT chk_arap_human_on_the_loop        CHECK (human_on_the_loop        = true),
  CONSTRAINT chk_arap_no_execution_authorized  CHECK (no_execution_authorized  = true),

  -- Non-empty string guards
  CONSTRAINT chk_arap_packet_id_nonempty          CHECK (packet_id          <> ''),
  CONSTRAINT chk_arap_queue_item_id_nonempty      CHECK (queue_item_id      <> ''),
  CONSTRAINT chk_arap_agent_id_nonempty           CHECK (agent_id           <> ''),
  CONSTRAINT chk_arap_outcome_id_nonempty         CHECK (outcome_id         <> ''),
  CONSTRAINT chk_arap_priority_nonempty           CHECK (priority           <> ''),
  CONSTRAINT chk_arap_status_nonempty             CHECK (status             <> ''),
  CONSTRAINT chk_arap_requested_decision_nonempty CHECK (requested_decision <> ''),
  CONSTRAINT chk_arap_source_decision_nonempty    CHECK (source_decision    <> ''),
  CONSTRAINT chk_arap_source_next_action_nonempty CHECK (source_next_action <> ''),
  CONSTRAINT chk_arap_executive_summary_nonempty  CHECK (executive_summary  <> '')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arap_user_id
  ON agent_review_approval_packets(user_id);

CREATE INDEX IF NOT EXISTS idx_arap_packet_id
  ON agent_review_approval_packets(packet_id);

CREATE INDEX IF NOT EXISTS idx_arap_queue_item_id
  ON agent_review_approval_packets(queue_item_id);

CREATE INDEX IF NOT EXISTS idx_arap_agent_id
  ON agent_review_approval_packets(agent_id);

CREATE INDEX IF NOT EXISTS idx_arap_outcome_id
  ON agent_review_approval_packets(outcome_id);

CREATE INDEX IF NOT EXISTS idx_arap_priority
  ON agent_review_approval_packets(priority);

CREATE INDEX IF NOT EXISTS idx_arap_status
  ON agent_review_approval_packets(status);

CREATE INDEX IF NOT EXISTS idx_arap_requested_decision
  ON agent_review_approval_packets(requested_decision);

CREATE INDEX IF NOT EXISTS idx_arap_source_decision
  ON agent_review_approval_packets(source_decision);

CREATE INDEX IF NOT EXISTS idx_arap_created_at
  ON agent_review_approval_packets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arap_expires_at
  ON agent_review_approval_packets(expires_at);

-- Row Level Security
ALTER TABLE agent_review_approval_packets ENABLE ROW LEVEL SECURITY;

-- Owner may read their own rows only
CREATE POLICY "owner_select" ON agent_review_approval_packets
  FOR SELECT
  USING (user_id = auth.uid());

-- Owner may insert rows that belong to themselves only
CREATE POLICY "owner_insert" ON agent_review_approval_packets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- NO DELETE policy (append-only)
-- NO broad UPDATE policy
-- NO USING (true) or WITH CHECK (true)
-- NO public permissive policy
-- NO RLS bypass
