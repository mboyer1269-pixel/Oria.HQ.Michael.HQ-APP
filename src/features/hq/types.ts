export type VentureHat = "suivia" | "mcl" | "personal" | "hq";

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ModelProvider = "anthropic" | "openai" | "google";

export type ModelMode = "auto" | "economy" | "brute" | "manual";

export type JorisIntent =
  | "chat"
  | "calendar.book"
  | "calendar.remind"
  | "brief.generate"
  | "board.consult"
  | "memory.capture"
  | "opportunity.score"
  | "task.create";

export type BoardFigure = {
  id: string;
  name: string;
  domain: string;
  frameworks: string[];
  lexicon: string[];
  bias: string;
  bestFor: string;
  disclosure?: string;
};

export type HqModule = {
  id: string;
  title: string;
  subtitle: string;
  status: "ready" | "foundation" | "planned";
  autonomyLevel: AutonomyLevel;
};

export type ModelProfile = {
  id: string;
  label: string;
  provider: ModelProvider;
  defaultUse: string;
  costTier: "low" | "medium" | "high";
  strengths: string[];
};

export type PermissionRule = {
  id: string;
  action: string;
  level: AutonomyLevel;
  requiresConfirmation: boolean;
  reason: string;
};

export type CalendarIntent = {
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  remindersMinutes: number[];
  needsConfirmation: boolean;
  confidence: number;
  notes?: string;
};

export type CalendarEventSource = "api" | "internal" | "joris";

export type CalendarStorageMode = "local" | "supabase";

export type CalendarEvent = {
  id: string;
  userId: string;
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
  remindersMinutes: number[];
  createdAt: string;
  updatedAt: string;
  storageMode: CalendarStorageMode;
};

export type ActionLedgerStatus = "recorded" | "skipped" | "failed";

export type CommandResult = {
  intent: JorisIntent;
  summary: string;
  modelId?: string;
  costMode?: ModelMode;
  calendarIntent?: CalendarIntent;
  calendarEvent?: CalendarEvent;
  ledgerStatus?: ActionLedgerStatus;
  storageMode?: CalendarStorageMode;
  requiresConfirmation?: boolean;
};

export type CeoBriefAgendaItem = {
  id: string;
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
};

export type CeoBriefLeadItem = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  createdAt: string;
};

export type CeoBriefSnapshot = {
  generatedAt: string;
  headline: string;
  focusLine: string;
  agenda: {
    upcomingCount: number;
    items: CeoBriefAgendaItem[];
  };
  leads: {
    newCount: number;
    items: CeoBriefLeadItem[];
  };
  documents: {
    totalCount: number;
    byHat: Record<string, number>;
    recentFilenames: string[];
  };
};
