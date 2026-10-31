const BEIJING_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function beijingDateAfter(days, now = Date.now()) {
  const date = new Date(now + BEIJING_OFFSET + days * DAY);
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
  };
}

export function beijingExpiry(year, month, day, now = Date.now()) {
  const parts = [year, month, day].map((part) => part.trim());
  if (parts.every((part) => !part)) return null;
  if (parts.some((part) => !part)) throw new RangeError("incomplete");
  if (
    !/^\d{4}$/.test(parts[0]) ||
    !/^\d{1,2}$/.test(parts[1]) ||
    !/^\d{1,2}$/.test(parts[2])
  ) {
    throw new RangeError("invalid");
  }
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1000 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new RangeError("invalid");
  }
  const expiresAt = date.getTime() + DAY - 1 - BEIJING_OFFSET;
  if (expiresAt <= now) throw new RangeError("past");
  return new Date(expiresAt).toISOString();
}

export function formatBeijingTime(value, locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(date);
}
