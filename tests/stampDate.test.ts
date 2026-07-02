import { describe, expect, it } from "vitest";
import { formatStampDate, stampDateStyleOptions } from "../src/utils/stampDate";

// Feb 3, 2025 13:15 local time (matches Sejda's example strings).
const AFTERNOON = new Date(2025, 1, 3, 13, 15);
const MIDNIGHT = new Date(2025, 1, 3, 0, 5);
const NOON = new Date(2025, 1, 3, 12, 0);

describe("formatStampDate", () => {
  it("formats every Sejda date style", () => {
    expect(formatStampDate("none", AFTERNOON)).toBe("");
    expect(formatStampDate("mdy", AFTERNOON)).toBe("Feb 3, 2025");
    expect(formatStampDate("time-mdy", AFTERNOON)).toBe("1:15PM, Feb 3, 2025");
    expect(formatStampDate("dmy", AFTERNOON)).toBe("3 Feb, 2025");
    expect(formatStampDate("time-dmy", AFTERNOON)).toBe("1:15PM, 3 Feb, 2025");
  });

  it("handles 12-hour clock edges (midnight and noon)", () => {
    expect(formatStampDate("time-mdy", MIDNIGHT)).toBe("12:05AM, Feb 3, 2025");
    expect(formatStampDate("time-mdy", NOON)).toBe("12:00PM, Feb 3, 2025");
  });

  it("defaults to the current time when no date is given", () => {
    expect(formatStampDate("mdy")).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});

describe("stampDateStyleOptions", () => {
  it("labels every option with a live example", () => {
    const options = stampDateStyleOptions(AFTERNOON);
    expect(options).toEqual([
      { value: "none", label: "No date" },
      { value: "mdy", label: "Feb 3, 2025" },
      { value: "time-mdy", label: "1:15PM, Feb 3, 2025" },
      { value: "dmy", label: "3 Feb, 2025" },
      { value: "time-dmy", label: "1:15PM, 3 Feb, 2025" },
    ]);
  });

  it("defaults to the current time", () => {
    const options = stampDateStyleOptions();
    expect(options[0].label).toBe("No date");
    expect(options[1].label).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});
