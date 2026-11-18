const STORAGE_KEY = "ae-netscope-regional-preferences";

export type RegionalPreferences = {
  timezone: string;
  date_format: "locale" | "ymd" | "dmy" | "mdy";
  hour_format: "12" | "24";
};

const defaults: RegionalPreferences = {
  timezone: "UTC",
  date_format: "locale",
  hour_format: "24",
};

export function storeRegionalPreferences(preferences: RegionalPreferences): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function readRegionalPreferences(): RegionalPreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<RegionalPreferences>;
    return {
      timezone: typeof parsed.timezone === "string" ? parsed.timezone : defaults.timezone,
      date_format: ["locale", "ymd", "dmy", "mdy"].includes(parsed.date_format ?? "")
        ? parsed.date_format as RegionalPreferences["date_format"]
        : defaults.date_format,
      hour_format: parsed.hour_format === "12" ? "12" : "24",
    };
  } catch {
    return defaults;
  }
}

function dateOptions(preferences: RegionalPreferences): Intl.DateTimeFormatOptions {
  const base: Intl.DateTimeFormatOptions = { timeZone: preferences.timezone };
  if (preferences.date_format === "locale") {
    return { ...base, dateStyle: "short" };
  }
  const order = preferences.date_format;
  return {
    ...base,
    year: "numeric",
    month: order === "mdy" ? "short" : "2-digit",
    day: "2-digit",
  };
}

function orderedDate(value: Date, language: string | undefined, preferences: RegionalPreferences) {
  if (preferences.date_format === "locale") {
    return new Intl.DateTimeFormat(language, dateOptions(preferences)).format(value);
  }
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: preferences.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const order = preferences.date_format === "ymd"
    ? [values.year, values.month, values.day]
    : preferences.date_format === "dmy"
      ? [values.day, values.month, values.year]
      : [values.month, values.day, values.year];
  return order.join("/");
}

// A time zone the browser does not support, or a value that is not a date, must not
// break every page that shows a date: the zone falls back to UTC and the raw value is
// shown as it is.
function usablePreferences(): RegionalPreferences {
  const preferences = readRegionalPreferences();
  try {
    new Intl.DateTimeFormat("en", { timeZone: preferences.timezone });
    return preferences;
  } catch {
    return { ...preferences, timezone: defaults.timezone };
  }
}

export function formatDate(value: string | Date, language?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return orderedDate(date, language, usablePreferences());
}

export function formatDateTime(value: string | Date, language?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const preferences = usablePreferences();
  const time = new Intl.DateTimeFormat(language, {
    timeZone: preferences.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: preferences.hour_format === "12",
  }).format(date);
  return `${orderedDate(date, language, preferences)}, ${time}`;
}
