import { Server } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchMcpServerStatus, updateMcpServer } from "../api";
import type { McpServerStatus } from "../api";

export default function McpServerSettings({ csrfToken, canManage }: {
  csrfToken: string; canManage: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMcpServerStatus().then((result) => {
      if (active) setStatus(result);
    }).catch(() => { if (active) setError(t("mcpServer.failed")); });
    return () => { active = false; };
  }, [t]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      setStatus(await updateMcpServer(enabled, csrfToken));
    } catch {
      setError(t("mcpServer.failed"));
    } finally {
      setBusy(false);
    }
  }

  const endpoint = status ? `${window.location.origin}${status.path}` : "";
  const state = !status ? "" : !status.available ? t("mcpServer.unavailable")
    : status.enabled ? t("mcpServer.enabled") : t("mcpServer.disabled");

  return <>
    <div className="settings-section-heading">
      <Server size={20} /><div><h2>{t("mcpServer.title")}</h2>
        <span>{t("mcpServer.description")}</span></div>
    </div>
    {status && (canManage && status.available
      ? <label className="settings-row settings-check">
        <div><strong>{t("mcpServer.toggle")}</strong><span>{state}</span></div>
        <input type="checkbox" checked={status.enabled} disabled={busy}
          onChange={(event) => void toggle(event.target.checked)} /></label>
      : <div className="settings-row">
        <div><strong>{t("mcpServer.status")}</strong><span>{state}</span></div>
        {!canManage && <span>{t("mcpServer.adminOnly")}</span>}
      </div>)}
    {status?.enabled && <div className="settings-row">
      <div><strong>{t("mcpServer.endpoint")}</strong><span>{t("mcpServer.endpointHint")}</span></div>
      <code>{endpoint}</code>
    </div>}
    {error && <p role="alert">{error}</p>}
  </>;
}
