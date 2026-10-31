import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../Public/Assets/Dates.js", import.meta.url),
  "utf8",
);
const { beijingDateAfter, beijingExpiry, formatBeijingTime } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const now = Date.parse("2026-10-31T04:00:00.000Z");

test("expiration accepts blank dates and validates each calendar field", () => {
  assert.equal(beijingExpiry("", " ", "", now), null);
  assert.throws(() => beijingExpiry("2028", "", "29", now), /incomplete/);
  for (const [year, month, day] of [
    ["2027", "2", "29"],
    ["2028", "2", "30"],
    ["2028", "13", "1"],
    ["2028", "0", "1"],
    ["2028", "4", "31"],
    ["2028", "1", "0"],
    ["0099", "1", "1"],
    ["2028", "1e1", "1"],
    ["2028", "1", "1.5"],
    ["abcd", "1", "1"],
  ]) {
    assert.throws(() => beijingExpiry(year, month, day, now), /invalid/);
  }
  assert.equal(
    beijingExpiry(" 2028 ", "2", "29", now),
    "2028-02-29T15:59:59.999Z",
  );
});

test("expiration uses the end of the Beijing date and rejects past dates", () => {
  const expiresAt = beijingExpiry("2026", "10", "31", now);
  assert.equal(expiresAt, "2026-10-31T15:59:59.999Z");
  const cutoff = Date.parse(expiresAt);
  assert.equal(beijingExpiry("2026", "10", "31", cutoff - 1), expiresAt);
  assert.throws(() => beijingExpiry("2026", "10", "31", cutoff), /past/);
  assert.throws(() => beijingExpiry("2026", "10", "30", now), /past/);
});

test("presets follow Beijing calendar days across midnight, years and leap days", () => {
  const beijingNewYear = Date.parse("2026-12-31T16:30:00.000Z");
  assert.deepEqual(beijingDateAfter(0, beijingNewYear), {
    year: "2027",
    month: "01",
    day: "01",
  });
  assert.deepEqual(beijingDateAfter(1, beijingNewYear), {
    year: "2027",
    month: "01",
    day: "02",
  });
  assert.deepEqual(beijingDateAfter(3, now), { year: "2026", month: "11", day: "03" });
  assert.deepEqual(beijingDateAfter(7, now), { year: "2026", month: "11", day: "07" });
  assert.deepEqual(beijingDateAfter(30, now), { year: "2026", month: "11", day: "30" });
  assert.deepEqual(beijingDateAfter(90, now), { year: "2027", month: "01", day: "29" });
  assert.deepEqual(beijingDateAfter(1, Date.parse("2028-02-28T02:00:00Z")), {
    year: "2028",
    month: "02",
    day: "29",
  });
});

test("upload timestamps always display in Beijing time in both languages", () => {
  for (const locale of ["zh-CN", "en"]) {
    assert.match(formatBeijingTime("2026-10-31T00:00:00Z", locale), /08:00:00/);
    assert.match(formatBeijingTime("2026-10-31T16:00:00Z", locale), /00:00:00/);
  }
  assert.equal(formatBeijingTime("invalid", "zh-CN"), "invalid");
});
