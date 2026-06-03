import { RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL, fetchLatestGitHubRelease, fetchVersionInfo } from "../api";
import type { GitHubReleaseInfo, User, VersionInfo } from "../types";

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

type VersionStatus = "checking" | "current" | "update-available" | "unavailable";

type SettingsViewProps = {
  csrfToken: string;
  initialVersionInfo?: VersionInfo | null;
  onUserChanged: (user: User) => void;
  user: User;
};

export default function SettingsView({
  csrfToken,
  initialVersionInfo = null,
  onUserChanged,
  user,
}: SettingsViewProps) {
  const [settings, setSettings] = useState<LocalSettings>(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(JSON.parse(stored) as Partial<LocalSettings>) };
  });
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isEmailSaving, setIsEmailSaving] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(initialVersionInfo);
  const [latestRelease, setLatestRelease] = useState<GitHubReleaseInfo | null>(null);
  const [versionStatus, setVersionStatus] = useState<VersionStatus>("checking");

  function updateSetting<Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function saveSettings() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    window.dispatchEvent(new Event("ae-netscope-settings-changed"));
    setMessage("Ajustes guardados en este navegador.");
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailMessage("");
    setEmailError("");
    setIsEmailSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ current_password: emailPassword, new_email: email }),
      });

      if (!response.ok) {
        setEmailError(
          response.status === 409
            ? "Ese correo ya está en uso."
            : "No se pudo cambiar el correo. Verifica tu contraseña.",
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onUserChanged(data.user);
      setEmail(data.user.email);
      setEmailPassword("");
      setEmailMessage("Correo actualizado correctamente.");
    } catch {
      setEmailError("No se pudo conectar con la API.");
    } finally {
      setIsEmailSaving(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadVersionState() {
      try {
        const [currentVersion, latestGitHubRelease] = await Promise.all([
          initialVersionInfo ? Promise.resolve(initialVersionInfo) : fetchVersionInfo(),
          fetchLatestGitHubRelease(),
        ]);
        if (!isMounted) {
          return;
        }
        setVersionInfo(currentVersion);
        setLatestRelease(latestGitHubRelease);
        if (!latestGitHubRelease) {
          setVersionStatus("unavailable");
          return;
        }
        setVersionStatus(
          normalizeVersion(latestGitHubRelease.tag_name) === normalizeVersion(currentVersion.version)
            ? "current"
            : "update-available",
        );
      } catch {
        if (isMounted) {
          setVersionStatus("unavailable");
        }
      }
    }

    loadVersionState().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [initialVersionInfo]);

  async function checkForUpdates() {
    setVersionStatus("checking");
    try {
      const [currentVersion, latestGitHubRelease] = await Promise.all([fetchVersionInfo(), fetchLatestGitHubRelease()]);
      setVersionInfo(currentVersion);
      setLatestRelease(latestGitHubRelease);
      if (!latestGitHubRelease) {
        setVersionStatus("unavailable");
        return;
      }
      setVersionStatus(
        normalizeVersion(latestGitHubRelease.tag_name) === normalizeVersion(currentVersion.version)
          ? "current"
          : "update-available",
      );
    } catch {
      setVersionStatus("unavailable");
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Ajustes</h1>
          <p>Preferencias locales de interfaz para esta instalación de AE NetScope.</p>
        </div>
        <button className="primary-action" onClick={saveSettings}>
          <Save size={18} strokeWidth={2} />
          Guardar ajustes
        </button>
      </div>

      <section className="panel settings-panel">
        <form className="settings-row account-settings-row" onSubmit={saveEmail}>
          <div>
            <strong>Correo de la cuenta</strong>
            <span>Cambia el correo con el que inicias sesión. Requiere tu contraseña actual.</span>
          </div>
          <div className="account-settings-form">
            <input
              aria-label="Nuevo correo"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <input
              aria-label="Contraseña actual para cambiar correo"
              autoComplete="current-password"
              onChange={(event) => setEmailPassword(event.target.value)}
              placeholder="Contraseña actual"
              required
              type="password"
              value={emailPassword}
            />
            <button className="user-action" disabled={isEmailSaving} type="submit">
              {isEmailSaving ? "Guardando..." : "Cambiar correo"}
            </button>
            {emailMessage && <p className="form-success">{emailMessage}</p>}
            {emailError && <p className="login-error">{emailError}</p>}
          </div>
        </form>

        <div className="settings-row version-row">
          <div>
            <strong>Versión instalada</strong>
            <span>
              {versionInfo
                ? `${versionInfo.app_name} v${versionInfo.version} (${versionInfo.release_channel})`
                : "No se pudo leer la versión instalada."}
            </span>
          </div>
          <span className={`mini-pill ${versionTone(versionStatus)}`}>
            {versionStatusLabel(versionStatus)}
          </span>
        </div>

        <div className="settings-row version-row">
          <div>
            <strong>Última versión en GitHub</strong>
            <span>
              {latestRelease
                ? `${latestRelease.tag_name}${latestRelease.prerelease ? " - pre-release" : ""}`
                : "Sin información de GitHub Releases."}
            </span>
          </div>
          <div className="version-actions">
            <button className="user-action" onClick={() => checkForUpdates().catch(() => undefined)}>
              <RefreshCw size={15} strokeWidth={1.8} />
              Buscar actualización
            </button>
            <a
              className="user-action support-link"
              href={latestRelease?.html_url ?? versionInfo?.releases_url ?? "https://github.com/WhiteAssassins/AE-NetScope/releases"}
              target="_blank"
              rel="noreferrer"
            >
              Ver releases
            </a>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <strong>Vista inicial preferida</strong>
            <span>Se guarda localmente para futuras sesiones en este navegador.</span>
          </div>
          <select
            className="filter-select"
            onChange={(event) => updateSetting("defaultView", event.target.value)}
            value={settings.defaultView}
          >
            <option value="dashboard">Dashboard</option>
            <option value="devices">Dispositivos</option>
            <option value="ipMacs">IPs y MACs</option>
            <option value="networks">Subredes</option>
            <option value="services">Servicios</option>
          </select>
        </div>

        <label className="settings-row settings-check">
          <div>
            <strong>Tablas compactas</strong>
            <span>Preferencia visual para trabajar con más filas en pantalla.</span>
          </div>
          <input
            checked={settings.compactTables}
            onChange={(event) => updateSetting("compactTables", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-row settings-check">
          <div>
            <strong>Mostrar aviso Early Public Preview</strong>
            <span>Control local del aviso visible en el dashboard.</span>
          </div>
          <input
            checked={settings.showPreviewNotice}
            onChange={(event) => updateSetting("showPreviewNotice", event.target.checked)}
            type="checkbox"
          />
        </label>

        {message && <p className="form-success">{message}</p>}
      </section>
    </>
  );
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function versionTone(status: VersionStatus) {
  if (status === "current") return "green";
  if (status === "update-available") return "orange";
  return "gray";
}

function versionStatusLabel(status: VersionStatus) {
  if (status === "checking") return "Comprobando";
  if (status === "current") return "Actualizado";
  if (status === "update-available") return "Actualización disponible";
  return "No disponible";
}
