import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "ae-netscope-language";
export const MAX_LANGUAGE_CODE_LENGTH = 64;

type LocaleResource = Record<string, unknown> & {
  meta: {
    name: string;
    nativeName: string;
  };
};

const localeModules = import.meta.glob<LocaleResource>("./locales/*.json", {
  eager: true,
  import: "default",
});

export const localeResources = Object.fromEntries(
  Object.entries(localeModules).map(([path, resource]) => {
    const code = path.split("/").at(-1)?.replace(/\.json$/, "") ?? "";
    return [code, resource];
  }),
) as Record<string, LocaleResource>;

if (!localeResources[DEFAULT_LANGUAGE]) {
  throw new Error(`Missing canonical locale: ${DEFAULT_LANGUAGE}.json`);
}

export const supportedLanguages = Object.entries(localeResources)
  .map(([code, resource]) => ({ code, label: resource.meta.nativeName }))
  .sort((left, right) => {
    if (left.code === DEFAULT_LANGUAGE) return -1;
    if (right.code === DEFAULT_LANGUAGE) return 1;
    return left.label.localeCompare(right.label);
  });

export function isSupportedLanguage(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(localeResources, value);
}

export function readStoredLanguage(): string {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

export async function setLanguage(language: string): Promise<string> {
  const resolved = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
  await i18n.changeLanguage(resolved);
  return resolved;
}

const resources = Object.fromEntries(
  Object.entries(localeResources).map(([code, resource]) => [
    code,
    { translation: resource },
  ]),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: supportedLanguages.map((language) => language.code),
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

function updateDocumentLanguage(language: string) {
  document.documentElement.lang = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
}

updateDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
i18n.on("languageChanged", updateDocumentLanguage);

export default i18n;
