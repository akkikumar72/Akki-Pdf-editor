/** Sejda-parity stamp date styles: none, "Feb 3, 2025", "1:15PM, Feb 3, 2025", "3 Feb, 2025", "1:15PM, 3 Feb, 2025". */
export type StampDateStyle = "none" | "mdy" | "time-mdy" | "dmy" | "time-dmy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timePart(date: Date): string {
  const hours24 = date.getHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 || 12;
  return `${hours}:${String(date.getMinutes()).padStart(2, "0")}${suffix}`;
}

export function formatStampDate(style: StampDateStyle, now: Date = new Date()): string {
  const mdy = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const dmy = `${now.getDate()} ${MONTHS[now.getMonth()]}, ${now.getFullYear()}`;
  switch (style) {
    case "none":
      return "";
    case "mdy":
      return mdy;
    case "time-mdy":
      return `${timePart(now)}, ${mdy}`;
    case "dmy":
      return dmy;
    case "time-dmy":
      return `${timePart(now)}, ${dmy}`;
    /* v8 ignore start -- exhaustive never guard; every StampDateStyle variant is handled above */
    default: {
      const exhaustive: never = style;
      void exhaustive;
      return "";
    }
    /* v8 ignore stop */
  }
}

/** Options for the stamp popover's date-style select, labelled with live examples. */
export function stampDateStyleOptions(now: Date = new Date()): Array<{ value: StampDateStyle; label: string }> {
  return [
    { value: "none", label: "No date" },
    { value: "mdy", label: formatStampDate("mdy", now) },
    { value: "time-mdy", label: formatStampDate("time-mdy", now) },
    { value: "dmy", label: formatStampDate("dmy", now) },
    { value: "time-dmy", label: formatStampDate("time-dmy", now) },
  ];
}
