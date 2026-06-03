/**
 * Minimal structured logger for server-side code.
 *
 * In production (NODE_ENV === "production"), emits newline-delimited JSON to
 * stdout so log aggregators (Datadog, Axiom, CloudWatch, etc.) can parse
 * structured fields without regex.
 *
 * In development, falls back to formatted console output for readability.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.error("joris.command.failed", { missionId, reason: error.message });
 *   logger.warn("governance.persist.failed", { workspaceId });
 *   logger.info("calendar.booked", { eventId, workspaceId });
 */

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  event: string;
  ts: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, event: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...meta,
  };

  if (process.env.NODE_ENV === "production") {
    // Structured JSON — one line per entry, parseable by log aggregators.
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    // Human-readable in dev.
    const prefix = `[${entry.level.toUpperCase()}] ${entry.ts} ${entry.event}`;
    const rest = meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : "";
    if (level === "error") {
      console.error(prefix, rest);
    } else if (level === "warn") {
      console.warn(prefix, rest);
    } else {
      console.log(prefix, rest);
    }
  }
}

export const logger = {
  info(event: string, meta?: Record<string, unknown>): void {
    emit("info", event, meta);
  },
  warn(event: string, meta?: Record<string, unknown>): void {
    emit("warn", event, meta);
  },
  error(event: string, meta?: Record<string, unknown>): void {
    emit("error", event, meta);
  },
};
