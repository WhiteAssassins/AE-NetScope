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
  const [loaded, setLoaded] = useState({ maintenance: false, searchIndexing: false, history: false });
  const [saving, setSaving] = useState<"maintenance" | "searchIndexing" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetchMaintenanceStatus(),
      fetchSearchIndexingPolicy(),
      fetchUpdateHistory(),
    ]).then(([maintenanceResult, indexingResult, historyResult]) => {
      if (!active) return;
      if (maintenanceResult.status === "fulfilled") setMaintenance(maintenanceResult.value);
      if (indexingResult.status === "fulfilled") setSearchIndexing(indexingResult.value);
      if (historyResult.status === "fulfilled") setHistory(historyResult.value);
      setLoaded({
        maintenance: maintenanceResult.status === "fulfilled",
        searchIndexing: indexingResult.status === "fulfilled",
        history: historyResult.status === "fulfilled",
      });
      setLoadError(
        [maintenanceResult, indexingResult, historyResult].some(
          (result) => result.status === "rejected",
        )
          ? t("settings.admin.loadFailed")
          : "",
      );
    });
    return () => {
      active = false;
    };
  }, [t]);

  async function saveMaintenance() {
    setError("");
    setMessage("");
    setSaving("maintenance");
    try {
      setMaintenance(await updateMaintenanceStatus(maintenance, csrfToken));
      setMessage(t("settings.admin.maintenanceSaved"));
    } catch {
      setError(t("settings.admin.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  async function saveSearchIndexing() {
    setError("");
    setMessage("");
    setSaving("searchIndexing");
    try {
      const updatedPolicy = await updateSearchIndexingPolicy(searchIndexing, csrfToken);
      setSearchIndexing(updatedPolicy);
      applySearchIndexingPolicy(updatedPolicy.allow_indexing);
      setMessage(t("settings.admin.searchIndexingSaved"));
    } catch {
      setError(t("settings.admin.saveFailed"));
    } finally {
      setSaving(null);
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
            disabled={!loaded.searchIndexing || saving !== null}
            onChange={(event) =>
              setSearchIndexing({ allow_indexing: !event.target.checked })
            }
            type="checkbox"
          />
        </label>
        <p className="settings-help">{t("settings.admin.searchIndexingHelp")}</p>
        <button className="user-action" disabled={!loaded.searchIndexing || saving !== null} onClick={() => void saveSearchIndexing()} type="button">
          {t("common.save")}
        </button>
      </div>
      <div className="settings-block">
        <label className="settings-row settings-check">
          <div><strong>{t("settings.admin.maintenanceMode")}</strong><span>{t("settings.admin.maintenanceDescription")}</span></div>
          <input checked={maintenance.enabled} disabled={!loaded.maintenance || saving !== null} onChange={(event) => setMaintenance((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
        </label>
        <label className="settings-field">
          <span>{t("settings.admin.maintenanceMessage")}</span>
          <textarea disabled={!loaded.maintenance || saving !== null} maxLength={500} onChange={(event) => setMaintenance((current) => ({ ...current, message: event.target.value }))} rows={3} value={maintenance.message} />
        </label>
        <button className="user-action" disabled={!loaded.maintenance || saving !== null} onClick={() => void saveMaintenance()} type="button">{t("common.save")}</button>
      </div>
      <div className="settings-block">
        <div className="settings-block-title"><History size={18} /><strong>{t("settings.admin.updateHistory")}</strong></div>
        {!loaded.history ? <p>{t("common.loading")}</p> : history.length === 0 ? <p>{t("settings.admin.noUpdates")}</p> : history.map((item) => (
          <div className="update-history-row" key={item.id}>
            <div><strong>{item.target_tag}</strong><span>{item.requested_by ?? t("common.notAvailable")}</span></div>
            <div><span className={`status-badge ${updateStatusTone(item.status)}`}>{t(`settings.admin.updateStatuses.${item.status}`, { defaultValue: item.status })}</span><time>{formatDateTime(item.created_at, i18n.resolvedLanguage)}</time></div>
          </div>
        ))}
      </div>
      {message && <p className="form-success">{message}</p>}
      {error && <p className="login-error">{error}</p>}
      {loadError && <p className="login-error">{loadError}</p>}
    </>
  );
}

function updateStatusTone(status: string) {
  if (status === "failed" || status === "unknown") return "danger";
  return "active";
}
