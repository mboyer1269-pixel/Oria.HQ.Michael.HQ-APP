export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CalendarEventRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  title: string;
  date_iso: string;
  start_time: string;
  end_time: string;
  source: string;
  reminders_minutes: number[];
  created_at: string;
  updated_at: string;
};

export type CalendarEventInsert = Omit<CalendarEventRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ActionLedgerRow = {
  id: string;
  user_id: string;
  action_type: string;
  event_type: "decision" | "action" | "result" | "cost" | "learning" | null;
  summary: string;
  autonomy_level: number;
  requires_confirmation: boolean;
  model_id: string | null;
  cost_mode: string | null;
  workspace_id: string | null;
  skill_id: string | null;
  agent_id: string | null;
  mission_id: string | null;
  payload: Json;
  metadata: Json;
  created_at: string;
};

export type ActionLedgerInsert = Omit<ActionLedgerRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type EventRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  stream_id: string;
  /** All known event types persisted to the events table. Extend as new types land. */
  type: "idea.captured" | "daily.direction.generated";
  payload: Json;
  valid_from: string | null;
  valid_to: string | null;
  recorded_at: string;
};

export type EventInsert = Omit<EventRow, "id" | "recorded_at"> & {
  id?: string;
  recorded_at?: string;
};

export type CockpitLayoutRow = {
  user_id: string;
  widget_order: Json;
  updated_at: string;
};

export type CockpitLayoutInsert = Omit<CockpitLayoutRow, "updated_at"> & {
  updated_at?: string;
};

export type ContactLeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "closed" | "spam";
  created_at: string;
};

export type ContactLeadInsert = Omit<ContactLeadRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type MissionRow = {
  id: string;
  workspace_id: string;
  mode_id: string;
  title: string;
  objective: string;
  assigned_agent_id: string;
  autonomy_level: number;
  status: "draft" | "queued" | "running" | "needs_approval" | "completed" | "failed" | "cancelled";
  risk_level: "low" | "medium" | "high";
  requires_approval: boolean;
  cost_budget_cents: number | null;
  input: Json;
  expected_output: string;
  result: Json | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type MissionInsert = Omit<
  MissionRow,
  "cost_budget_cents" | "result" | "created_at" | "updated_at" | "completed_at"
> & {
  cost_budget_cents?: number | null;
  result?: Json | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

export type DocumentRow = {
  id: string;
  user_id: string;
  filename: string;
  hat: string;
  filepath: string;
  processed_at: string;
  task_id: string | null;
  created_at: string;
};

export type DocumentInsert = Omit<DocumentRow, "id" | "created_at" | "processed_at" | "task_id"> & {
  id?: string;
  created_at?: string;
  processed_at?: string;
  task_id?: string | null;
};

export type ArenaVerdictRow = {
  id: string;
  workspace_id: string;
  candidate_id: string;
  verdict: Json;
  stored_at: string;
  expires_at: string | null;
  created_at: string;
};

export type ArenaVerdictInsert = Omit<ArenaVerdictRow, "created_at"> & {
  created_at?: string;
};

export type GovernanceDecisionOutcome =
  | "approved_to_plan"
  | "changes_requested"
  | "rejected"
  | "more_info_requested"
  | "blocked_execution_request";

export type GovernanceDecisionRow = {
  id: string;
  workspace_id: string;
  work_order_id: string;
  bundle_id: string;
  outcome: GovernanceDecisionOutcome;
  session_status: string;
  review_id: string | null;
  review_decision: string | null;
  reviewer_id: string;
  reviewer_role: string;
  // Safety invariants — always true (enforced by DB CHECK constraints).
  human_on_the_loop: true;
  no_execution_authorized: true;
  decided_at: string;
  created_at: string;
};

export type GovernanceDecisionInsert = Omit<GovernanceDecisionRow, "created_at"> & {
  created_at?: string;
};

// ventures — durable backing store for Venture Engine cards (migration 0009).
// JSON columns (score, validation_plan, autonomy_profile, assigned_agents,
// decisions) mirror the VentureCard contract in src/features/ventures/types.ts;
// the repository owns row <-> VentureCard mapping and light validation. status
// and source are kept as plain text here (DB CHECK constraints enforce the
// whitelists) to avoid coupling the DB layer to feature types.
export type VentureRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  source: string;
  status: string;
  target_customer: string;
  problem: string;
  offer: string;
  primary_channel: string;
  score: Json | null;
  validation_plan: Json | null;
  autonomy_profile: Json;
  assigned_agents: Json;
  decisions: Json;
  created_at: string;
  updated_at: string;
};

export type VentureInsert = Omit<
  VentureRow,
  "score" | "validation_plan" | "assigned_agents" | "decisions"
> & {
  score?: Json | null;
  validation_plan?: Json | null;
  assigned_agents?: Json;
  decisions?: Json;
};

// cash_signal_intakes — durable, auditable backing store for captured cash
// signals (migration 0012). Append-only proof log. The evidence_ref jsonb
// mirrors the EvidenceRef contract; the repository owns row <-> CashSignalIntake
// mapping and light validation. signal_type is plain text here (a DB CHECK
// enforces the whitelist) to avoid coupling the DB layer to feature types.
export type CashSignalIntakeRow = {
  id: string;
  workspace_id: string;
  captured_by_user_id: string;
  signal_id: string;
  packet_id: string;
  venture_id: string;
  source_agent_id: string;
  signal_type: string;
  reference_id: string;
  is_verified: boolean;
  amount_cents: number | null;
  summary: string;
  captured_at: string;
  evidence_ref: Json;
  created_at: string;
};

// The DB assigns id and created_at (defaults), so an insert omits them.
export type CashSignalIntakeInsert = Omit<CashSignalIntakeRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

// prepared_actions — durable, append-only CEO review queue produced by the
// Relay iterative prep agent (migration 0013). The packet, council, and
// hermes_plan jsonb columns mirror the PreparedAction contract in
// src/features/ventures/prepared-action.ts; the repository owns row <->
// PreparedAction mapping and light validation. priority and status are plain
// text here (DB CHECK constraints enforce the whitelists) to avoid coupling the
// DB layer to feature types. The three invariant booleans are forced true by
// DB CHECK constraints — a prepared action can never authorize execution.
export type PreparedActionRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  prepared_action_id: string;
  venture_id: string;
  cash_action_packet_id: string;
  content_hash: string;
  supersedes_id: string | null;
  packet: Json;
  council: Json;
  hermes_plan: Json;
  priority: string;
  priority_score: number;
  status: string;
  requires_ceo_approval: true;
  requires_manual_send: true;
  no_execution_authorized: true;
  created_at: string;
};

// The DB assigns id and created_at (defaults), so an insert omits them.
export type PreparedActionInsert = Omit<PreparedActionRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

// agent_score_snapshots — durable, append-only history of agent operator scores
// over time (migration 0014). dimension_scores jsonb mirrors the
// OperatorDimensionScores shape; the repository owns row <-> AgentScoreSnapshot
// mapping and light validation. band/status are plain text here (DB CHECK
// constraints enforce the whitelists).
export type AgentScoreSnapshotRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  snapshot_id: string;
  agent_id: string;
  scored_at: string;
  total_operator_score: number;
  operator_score_band: string;
  operator_status: string;
  dimension_scores: Json;
  outcome_count: number;
  created_at: string;
};

// The DB assigns id and created_at (defaults), so an insert omits them.
export type AgentScoreSnapshotInsert = Omit<AgentScoreSnapshotRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type MichaelHqDatabase = {
  public: {
    Tables: {
      calendar_events: {
        Row: CalendarEventRow;
        Insert: CalendarEventInsert;
        Update: Partial<CalendarEventInsert>;
        Relationships: [];
      };
      action_ledger: {
        Row: ActionLedgerRow;
        Insert: ActionLedgerInsert;
        Update: Partial<ActionLedgerInsert>;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: EventInsert;
        Update: Partial<EventInsert>;
        Relationships: [];
      };
      cockpit_layout: {
        Row: CockpitLayoutRow;
        Insert: CockpitLayoutInsert;
        Update: Partial<CockpitLayoutInsert>;
        Relationships: [];
      };
      contact_leads: {
        Row: ContactLeadRow;
        Insert: ContactLeadInsert;
        Update: Partial<ContactLeadInsert>;
        Relationships: [];
      };
      missions: {
        Row: MissionRow;
        Insert: MissionInsert;
        Update: Partial<MissionInsert>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRow;
        Insert: DocumentInsert;
        Update: Partial<DocumentInsert>;
        Relationships: [];
      };
      arena_verdicts: {
        Row: ArenaVerdictRow;
        Insert: ArenaVerdictInsert;
        Update: Partial<ArenaVerdictInsert>;
        Relationships: [];
      };
      governance_decisions: {
        Row: GovernanceDecisionRow;
        Insert: GovernanceDecisionInsert;
        Update: Partial<GovernanceDecisionInsert>;
        Relationships: [];
      };
      ventures: {
        Row: VentureRow;
        Insert: VentureInsert;
        Update: Partial<VentureInsert>;
        Relationships: [];
      };
      cash_signal_intakes: {
        Row: CashSignalIntakeRow;
        Insert: CashSignalIntakeInsert;
        Update: Partial<CashSignalIntakeInsert>;
        Relationships: [];
      };
      prepared_actions: {
        Row: PreparedActionRow;
        Insert: PreparedActionInsert;
        Update: Partial<PreparedActionInsert>;
        Relationships: [];
      };
      agent_score_snapshots: {
        Row: AgentScoreSnapshotRow;
        Insert: AgentScoreSnapshotInsert;
        Update: Partial<AgentScoreSnapshotInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
