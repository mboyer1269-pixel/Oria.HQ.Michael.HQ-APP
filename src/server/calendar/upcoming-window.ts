// Calendar dates use the operator's Toronto day, independent of server TZ.
export function upcomingCalendarWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  const fromDateISO = `${value("year")}-${value("month")}-${value("day")}`;
  const horizon = new Date(`${fromDateISO}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  return { fromDateISO, toDateISO: horizon.toISOString().slice(0, 10) };
}
