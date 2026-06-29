import { Save } from "lucide-react";
import { useState } from "react";

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

export default function SettingsView() {
  const [settings, setSettings] = useState<LocalSettings>(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(JSON.parse(stored) as Partial<LocalSettings>) };
  });
  const [message, setMessage] = useState("");

  function updateSetting<Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function saveSettings() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    window.dispatchEvent(new Event("ae-netscope-settings-changed"));
    setMessage("Ajustes guardados en este navegador.");
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Ajustes</h1>
          <p>Preferencias locales de interfaz para este navegador.</p>
        </div>
        <button className="primary-action" onClick={saveSettings}>
          <Save size={18} strokeWidth={2} />
          Guardar ajustes
        </button>
      </div>

      <section className="panel settings-panel">
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
            <span>Preferencia visual para trabajar con mas filas en pantalla.</span>
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
