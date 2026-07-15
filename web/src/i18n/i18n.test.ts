import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createInstance } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import i18n, {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  MAX_LANGUAGE_CODE_LENGTH,
  localeResources,
  setLanguage,
  supportedLanguages,
} from ".";

type FlatTranslations = Record<string, string>;

function flattenTranslations(
  value: unknown,
  prefix = "",
  result: FlatTranslations = {},
): FlatTranslations {
  if (typeof value === "string") {
    result[prefix] = value;
    return result;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Translation value at ${prefix || "<root>"} must be an object or string.`);
  }
  for (const [key, child] of Object.entries(value)) {
    flattenTranslations(child, prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function interpolationVariables(value: string) {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const suspiciousEncodingPatterns = [
  /\uFFFD/u,
  /\u00C3[\u0080-\u00BF\u00A0-\u00FF]/u,
  /\u00C2(?:[\u0080-\u00BF]|[\u00A0\u00A1\u00BF])/u,
  /\u00E2(?:\u0080|\u20AC|\u2122)/u,
  /[\u200B-\u200D\u2060\u202A-\u202E\u2066-\u2069]/u,
];

function hasUnexpectedControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint === 0x7f ||
      (codePoint >= 0 && codePoint <= 0x1f && ![0x09, 0x0a, 0x0d].includes(codePoint))
    );
  });
}

describe("translation resources", () => {
  afterEach(async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it("uses English as the canonical default and fallback language", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(i18n.options.fallbackLng).toEqual(["en"]);
    expect(supportedLanguages[0].code).toBe("en");
  });

  it("keeps every locale structurally aligned with en.json", () => {
    const english = flattenTranslations(localeResources.en);

    expect(Object.keys(localeResources)).toContain("es");
    for (const [language, resource] of Object.entries(localeResources)) {
      expect(language).toMatch(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/);
      expect(language.length).toBeLessThanOrEqual(MAX_LANGUAGE_CODE_LENGTH);
      const translations = flattenTranslations(resource);
      expect(Object.keys(translations).sort(), `${language} has mismatched keys`).toEqual(
        Object.keys(english).sort(),
      );
      for (const [key, value] of Object.entries(translations)) {
        expect(value.trim(), `${language}.${key} must not be empty`).not.toBe("");
        expect(
          interpolationVariables(value),
          `${language}.${key} has incompatible variables`,
        ).toEqual(interpolationVariables(english[key]));
      }
    }
  });

  it("falls back to English for unsupported languages", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("auth.signIn")).toBe("Sign in");
  });

  it("falls back to the English value when a selected locale is missing a key", async () => {
    const isolatedI18n = createInstance();
    await isolatedI18n.init({
      resources: {
        en: { translation: { fallbackProbe: "English fallback" } },
        es: { translation: {} },
      },
      lng: "es",
      fallbackLng: "en",
    });

    expect(isolatedI18n.t("fallbackProbe")).toBe("English fallback");
  });

  it("stores manual language changes and updates the document language", async () => {
    await setLanguage("es");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");

    await setLanguage("unsupported");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("contains no malformed UTF-8, mojibake, control, or suspicious invisible characters", () => {
    const root = resolve(process.cwd(), "src");
    const checkedExtensions = new Set([".css", ".json", ".ts", ".tsx"]);
    const failures: string[] = [];

    for (const file of sourceFiles(root)) {
      if (!checkedExtensions.has(extname(file))) {
        continue;
      }
      const contents = readFileSync(file, "utf8");
      if (contents.charCodeAt(0) === 0xfeff) {
        failures.push(`${file}: unexpected UTF-8 BOM`);
      }
      if (hasUnexpectedControlCharacter(contents)) {
        failures.push(`${file}: unexpected control character`);
      }
      for (const pattern of suspiciousEncodingPatterns) {
        if (pattern.test(contents)) {
          failures.push(`${file}: matched ${pattern.source}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
