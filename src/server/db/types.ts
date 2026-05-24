export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CalendarEventRow = {
  id: string;
  user_id: string;
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
  summary: string;
  autonomy_level: number;
  requires_confirmation: boolean;
  model_id: string | null;
  cost_mode: string | null;
  metadata: Json;
  created_at: string;
};

export type ActionLedgerInsert = Omit<ActionLedgerRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
