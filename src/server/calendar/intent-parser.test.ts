import { describe, it, expect } from "vitest";
import { parseCalendarIntent } from "./intent-parser";

describe("parseCalendarIntent", () => {
  it("parses 'demain à 18h' — tomorrow at 18:00 with 1-hour duration", () => {
    const result = parseCalendarIntent("Joris, book demain à 18h");
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe("18:00");
    expect(result!.endTime).toBe("19:00");
    expect(result!.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses 'vendredi 9:30' — colon separator is an explicit time cue", () => {
    const result = parseCalendarIntent("réunion vendredi 9:30");
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe("09:30");
  });

  it("parses explicit ISO date 'réunion 2026-06-15 à 14h30'", () => {
    const result = parseCalendarIntent("réunion 2026-06-15 à 14h30");
    expect(result).not.toBeNull();
    expect(result!.dateISO).toBe("2026-06-15");
    expect(result!.startTime).toBe("14:30");
  });

  it("parses 'demain à 9h' — minutes absentes default to :00", () => {
    const result = parseCalendarIntent("appel demain à 9h");
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe("09:00");
  });

  it("returns null when message contains no recognizable time", () => {
    const result = parseCalendarIntent("parle-moi de ma stratégie");
    expect(result).toBeNull();
  });
});
