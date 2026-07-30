import { History, SearchX, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchMaintenanceStatus,
  fetchSearchIndexingPolicy,
  fetchUpdateHistory,
  updateMaintenanceStatus,
  updateSearchIndexingPolicy,
} from "../api";
import { formatDateTime } from "../dateTime";
import { applySearchIndexingPolicy } from "../searchIndexing";
import type { MaintenanceStatus, SearchIndexingPolicy, UpdateHistoryItem } from "../types";

export default function AdminSettings({ csrfToken }: { csrfToken: string }) {
  const { i18n, t } = useTranslation();
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({ enabled: false, message: "" });
  const [searchIndexing, setSearchIndexing] = useState<SearchIndexingPolicy>({ allow_indexing: false });
  const [history, setHistory] = useState<UpdateHistoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      fetchMaintenanceStatus(),
      fetchSearchIndexingPolicy(),
      fetchUpdateHistory(),
    ])
      .then(([status, policy, items]) => {
        setMaintenance(status);
        setSearchIndexing(policy);
        setHistory(items);
      })
      .catch(() => setError(t("settings.admin.loadFailed")));
  }, [t]);

  async function saveMaintenance() {
    setError("");
    try {
      setMaintenance(await updateMaintenanceStatus(maintenance, csrfToken));
      setMessage(t("settings.admin.maintenanceSaved"));
    } catch {
      setError(t("settings.admin.saveFailed"));
    }
  }

  async function saveSearchIndexing() {
    setError("");
    setMessage("");
    try {
      const updatedPolicy = await updateSearchIndexingPolicy(searchIndexing, csrfToken);
      setSearchIndexing(updatedPolicy);
      applySearchIndexingPolicy(updatedPolicy.allow_indexing);
      setMessage(t("settings.admin.searchIndexingSaved"));
    } catch {
      setError(t("settings.admin.saveFailed"));
    }
  }

  return (
    <>
      <div className="settings-section-heading">
        <Wrench size={20} />
        <div><h2>{t("settings.sections.administration")}</h2><span>{t("settings.sections.administrationDescription")}</span></div>
      </div>
      <div className="settings-block">
        <div className="settings-block-title">
          <SearchX size={18} />
          <strong>{t("settings.admin.searchIndexing")}</strong>
        </div>
        <label className="settings-row settings-check">
          <div>
            <strong>{t("settings.admin.blockSearchIndexing")}</strong>
            <span>{t("settings.admin.blockSearchIndexingDescription")}</span>
          </div>
          <input
            checked={!searchIndexing.allow_indexing}
            onChange={(event) =>
              setSearchIndexing({ allow_indexing: !event.target.checked })
            }
            type="checkbox"
          />
        </label>
        <p className="settings-help">{t("settings.admin.searchIndexingHelp")}</p>
        <button className="user-action" onClick={() => void saveSearchIndexing()} type="button">
          {t("common.save")}
        </button>
      </div>
      <div className="settings-block">
        <label className="settings-row settings-check">
          <div><strong>{t("settings.admin.maintenanceMode")}</strong><span>{t("settings.admin.maintenanceDescription")}</span></div>
          <input checked={maintenance.enabled} onChange={(event) => setMaintenance((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
        </label>
        <label className="settings-field">
          <span>{t("settings.admin.maintenanceMessage")}</span>
          <textarea maxLength={500} onChange={(event) => setMaintenance((current) => ({ ...current, message: event.target.value }))} rows={3} value={maintenance.message} />
        </label>
        <button className="user-action" onClick={() => void saveMaintenance()} type="button">{t("common.save")}</button>
      </div>
      <div className="settings-block">
        <div className="settings-block-title"><History size={18} /><strong>{t("settings.admin.updateHistory")}</strong></div>
        {history.length === 0 ? <p>{t("settings.admin.noUpdates")}</p> : history.map((item) => (
          <div className="update-history-row" key={item.id}>
            <div><strong>{item.target_tag}</strong><span>{item.requested_by ?? t("common.notAvailable")}</span></div>
            <div><span className={`status-badge ${updateStatusTone(item.status)}`}>{t(`settings.admin.updateStatuses.${item.status}`, { defaultValue: item.status })}</span><time>{formatDateTime(item.created_at, i18n.resolvedLanguage)}</time></div>
          </div>
        ))}
      </div>
      {message && <p className="form-success">{message}</p>}
      {error && <p className="login-error">{error}</p>}
    </>
  );
}

function updateStatusTone(status: string) {
  if (status === "failed" || status === "unknown") return "danger";
  return "active";
}
