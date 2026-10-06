import { CalendarClock, Languages, LayoutDashboard, MonitorCog, PanelLeftClose, Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateAccountPreferences } from "../api";
import AdminSettings from "../components/AdminSettings";
import SecuritySettings from "../components/SecuritySettings";
import { storeRegionalPreferences } from "../dateTime";
import type { RegionalPreferences } from "../dateTime";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  setLanguage,
  supportedLanguages,
} from "../i18n";
import type { User } from "../types";
import {
  defaultViewOptions,
  readLocalSettings,
  writeLocalSettings,
} from "../settings";
import type { DefaultView, LocalSettings } from "../settings";

type SettingsViewProps = {
  csrfToken: string;
  onUserChanged: (user: User) => void;
  user: User;
};

export default function SettingsView({ csrfToken, onUserChanged, user }: SettingsViewProps) {
  const { i18n, t } = useTranslation();
  const [settings, setSettings] = useState<LocalSettings>(readLocalSettings);
  const [language, setSelectedLanguage] = useState(
    isSupportedLanguage(user.preferred_language) ? user.preferred_language : DEFAULT_LANGUAGE,
  );
  const [regional, setRegional] = useState<RegionalPreferences>({
    timezone: user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    date_format: user.date_format ?? "locale",
    hour_format: user.hour_format ?? "24",
  });
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
    const persistedLanguage = isSupportedLanguage(user.preferred_language)
      ? user.preferred_language
      : DEFAULT_LANGUAGE;
    let localSettingsSaved = false;

    try {
      localSettingsSaved = writeLocalSettings(settings);
      if (localSettingsSaved) {
        window.dispatchEvent(new Event("ae-netscope-settings-changed"));
      }
      const data = await updateAccountPreferences(
        { language, ...regional },
        csrfToken,
      );
      const savedLanguage = isSupportedLanguage(data.user.preferred_language)
        ? data.user.preferred_language
        : DEFAULT_LANGUAGE;
      setSelectedLanguage(savedLanguage);
      await setLanguage(savedLanguage);
      const regionalPreferencesSaved = storeRegionalPreferences(regional);
      onUserChanged(data.user);
      if (localSettingsSaved && regionalPreferencesSaved) {
        setMessage(t("settings.saved"));
      } else {
        setError(t("settings.browserStorageFailed"));
      }
    } catch {
      setSelectedLanguage(persistedLanguage);
      await setLanguage(persistedLanguage);
      setError(
        i18n.t(
          localSettingsSaved ? "settings.localSavedLanguageFailed" : "settings.saveFailed",
        ),
      );
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
        <div className="settings-section-heading">
          <Languages size={20} />
          <div>
            <h2>{t("settings.sections.language")}</h2>
            <span>{t("settings.sections.languageDescription")}</span>
          </div>
        </div>
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

        <div className="settings-section-heading">
          <CalendarClock size={20} />
          <div>
            <h2>{t("settings.sections.regional")}</h2>
            <span>{t("settings.sections.regionalDescription")}</span>
          </div>
        </div>
        <div className="settings-row">
          <div><strong>{t("settings.timezone")}</strong><span>{t("settings.timezoneDescription")}</span></div>
          <select className="filter-select" onChange={(event) => setRegional((current) => ({ ...current, timezone: event.target.value }))} value={regional.timezone}>
            {["UTC", ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [])].filter((timezone, index, values) => values.indexOf(timezone) === index).map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <div><strong>{t("settings.dateFormat")}</strong><span>{t("settings.dateFormatDescription")}</span></div>
          <select className="filter-select" onChange={(event) => setRegional((current) => ({ ...current, date_format: event.target.value as RegionalPreferences["date_format"] }))} value={regional.date_format}>
            {(["locale", "ymd", "dmy", "mdy"] as const).map((format) => <option key={format} value={format}>{t(`settings.dateFormats.${format}`)}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <div><strong>{t("settings.hourFormat")}</strong><span>{t("settings.hourFormatDescription")}</span></div>
          <select className="filter-select" onChange={(event) => setRegional((current) => ({ ...current, hour_format: event.target.value as "12" | "24" }))} value={regional.hour_format}>
            <option value="12">{t("settings.hourFormats.12")}</option><option value="24">{t("settings.hourFormats.24")}</option>
          </select>
        </div>

        <div className="settings-section-heading">
          <PanelLeftClose size={20} />
          <div>
            <h2>{t("settings.sections.navigation")}</h2>
            <span>{t("settings.sections.navigationDescription")}</span>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t("settings.defaultView")}</strong>
            <span>{t("settings.defaultViewDescription")}</span>
          </div>
          <select
            aria-label={t("settings.defaultView")}
            className="filter-select"
            onChange={(event) =>
              updateSetting("defaultView", event.target.value as DefaultView)
            }
            value={settings.defaultView}
          >
            {defaultViewOptions.map((option) => (
              <option key={option} value={option}>
                {t(`navigation.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.startSidebarCollapsed")}</strong>
            <span>{t("settings.startSidebarCollapsedDescription")}</span>
          </div>
          <input
            checked={settings.startSidebarCollapsed}
            onChange={(event) => updateSetting("startSidebarCollapsed", event.target.checked)}
            type="checkbox"
          />
        </label>

        <SecuritySettings csrfToken={csrfToken} onUserChanged={onUserChanged} user={user} />
        {user.permissions.includes("settings:manage") && <AdminSettings csrfToken={csrfToken} />}

        <div className="settings-section-heading">
          <MonitorCog size={20} />
          <div>
            <h2>{t("settings.sections.interface")}</h2>
            <span>{t("settings.sections.interfaceDescription")}</span>
          </div>
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
            <strong>{t("settings.reducedMotion")}</strong>
            <span>{t("settings.reducedMotionDescription")}</span>
          </div>
          <input
            checked={settings.reducedMotion}
            onChange={(event) => updateSetting("reducedMotion", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.showSystemStatus")}</strong>
            <span>{t("settings.showSystemStatusDescription")}</span>
          </div>
          <input
            checked={settings.showSystemStatus}
            onChange={(event) => updateSetting("showSystemStatus", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.showGitHubButton")}</strong>
            <span>{t("settings.showGitHubButtonDescription")}</span>
          </div>
          <input
            checked={settings.showGitHubButton}
            onChange={(event) => updateSetting("showGitHubButton", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.showFooter")}</strong>
            <span>{t("settings.showFooterDescription")}</span>
          </div>
          <input
            checked={settings.showFooter}
            onChange={(event) => updateSetting("showFooter", event.target.checked)}
            type="checkbox"
          />
        </label>

        <div className="settings-section-heading">
          <LayoutDashboard size={20} />
          <div>
            <h2>{t("settings.sections.dashboard")}</h2>
            <span>{t("settings.sections.dashboardDescription")}</span>
          </div>
        </div>
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
