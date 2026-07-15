import { Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updatePreferredLanguage } from "../api";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  setLanguage,
  supportedLanguages,
} from "../i18n";
import type { User } from "../types";

const storageKey = "ae-netscope-settings";

type LocalSettings = {
  defaultView: string;
  compactTables: boolean;
  showPreviewNotice: boolean;
};

const defaultSettings: LocalSettings = {
  defaultView: "dashboard",
  compactTables: false,
  showPreviewNotice: true,
};

type SettingsViewProps = {
  csrfToken: string;
  onUserChanged: (user: User) => void;
  user: User;
};

export default function SettingsView({ csrfToken, onUserChanged, user }: SettingsViewProps) {
  const { i18n, t } = useTranslation();
  const [settings, setSettings] = useState<LocalSettings>(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(JSON.parse(stored) as Partial<LocalSettings>) };
  });
  const [language, setSelectedLanguage] = useState(
    isSupportedLanguage(user.preferred_language) ? user.preferred_language : DEFAULT_LANGUAGE,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function updateSetting<Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  async function changeSelectedLanguage(nextLanguage: string) {
    const resolvedLanguage = isSupportedLanguage(nextLanguage) ? nextLanguage : DEFAULT_LANGUAGE;
    setSelectedLanguage(resolvedLanguage);
    setMessage("");
    setError("");
    await i18n.changeLanguage(resolvedLanguage);
  }

  async function saveSettings() {
    setIsSaving(true);
    setMessage("");
    setError("");
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    window.dispatchEvent(new Event("ae-netscope-settings-changed"));

    const persistedLanguage = isSupportedLanguage(user.preferred_language)
      ? user.preferred_language
      : DEFAULT_LANGUAGE;

    try {
      if (language !== persistedLanguage) {
        const data = await updatePreferredLanguage(language, csrfToken);
        const savedLanguage = isSupportedLanguage(data.user.preferred_language)
          ? data.user.preferred_language
          : DEFAULT_LANGUAGE;
        setSelectedLanguage(savedLanguage);
        await setLanguage(savedLanguage);
        onUserChanged(data.user);
      } else {
        await setLanguage(persistedLanguage);
      }
      setMessage(t("settings.saved"));
    } catch {
      setSelectedLanguage(persistedLanguage);
      await setLanguage(persistedLanguage);
      setError(i18n.t("settings.localSavedLanguageFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.description")}</p>
        </div>
        <button className="primary-action" disabled={isSaving} onClick={saveSettings}>
          <Save size={18} strokeWidth={2} />
          {isSaving ? t("common.saving") : t("settings.save")}
        </button>
      </div>

      <section className="panel settings-panel">
        <div className="settings-row">
          <div>
            <strong>{t("language.label")}</strong>
            <span>{t("language.description")}</span>
          </div>
          <select
            aria-label={t("language.label")}
            className="filter-select"
            onChange={(event) => void changeSelectedLanguage(event.target.value)}
            value={language}
          >
            {supportedLanguages.map((supportedLanguage) => (
              <option key={supportedLanguage.code} value={supportedLanguage.code}>
                {supportedLanguage.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div>
            <strong>{t("settings.defaultView")}</strong>
            <span>{t("settings.defaultViewDescription")}</span>
          </div>
          <select
            aria-label={t("settings.defaultView")}
            className="filter-select"
            onChange={(event) => updateSetting("defaultView", event.target.value)}
            value={settings.defaultView}
          >
            <option value="dashboard">{t("navigation.dashboard")}</option>
            <option value="devices">{t("navigation.devices")}</option>
            <option value="ipMacs">{t("navigation.ipMacs")}</option>
            <option value="networks">{t("navigation.networks")}</option>
            <option value="topology">{t("navigation.topology")}</option>
            <option value="services">{t("navigation.services")}</option>
          </select>
        </div>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.compactTables")}</strong>
            <span>{t("settings.compactTablesDescription")}</span>
          </div>
          <input
            checked={settings.compactTables}
            onChange={(event) => updateSetting("compactTables", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.previewNotice")}</strong>
            <span>{t("settings.previewNoticeDescription")}</span>
          </div>
          <input
            checked={settings.showPreviewNotice}
            onChange={(event) => updateSetting("showPreviewNotice", event.target.checked)}
            type="checkbox"
          />
        </label>

        {message && <p className="form-success">{message}</p>}
        {error && <p className="login-error">{error}</p>}
      </section>
    </>
  );
}
