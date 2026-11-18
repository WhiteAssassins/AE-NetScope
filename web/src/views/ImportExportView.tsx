import { Download, FileJson, RotateCcw, Table, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import {
  type BackupCounts,
  type BackupPreview,
  BackupTooLargeError,
  downloadJson,
  fetchImportLimits,
  type ImportLimits,
  previewBackup,
  RestoreError,
  restoreBackupPayload,
} from "../backupImport";
import { hasPermission } from "../utils";

type ImportExportViewProps = {
  csrfToken: string;
  onImported: () => Promise<void>;
  permissions: string[];
};

type DataSection = "backup" | "restore" | "csv";

const csvExports = [
  { resource: "devices", labelKey: "devices.title" },
  { resource: "ip-addresses", labelKey: "ipMacs.title" },
  { resource: "networks", labelKey: "networks.title" },
  { resource: "vlans", labelKey: "vlans.title" },
  { resource: "services", labelKey: "services.title" },
  { resource: "interfaces", labelKey: "devices.interfaces" },
];

export default function ImportExportView({
  csrfToken,
  onImported,
  permissions,
}: ImportExportViewProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<DataSection>("backup");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingPayload, setPendingPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const canReadInventory = hasPermission(permissions, "inventory:read");
  const canRestoreInventory = hasPermission(permissions, "settings:manage");
  const canExportInventory = hasPermission(permissions, "inventory:export");
  const [importLimits, setImportLimits] = useState<ImportLimits | null>(null);

  useEffect(() => {
    if (!canRestoreInventory) return undefined;
    let active = true;
    fetchImportLimits()
      .then((limits) => {
        if (active) setImportLimits(limits);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canRestoreInventory]);

  const maxImportMegabytes = importLimits
    ? (importLimits.max_bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "";

  function openExport(path: string) {
    window.open(`${API_BASE_URL}${path}`, "_blank", "noopener,noreferrer");
  }

  async function prepareImport(file: File) {
    setActiveSection("restore");
    setMessage("");
    setError("");
    setPendingPayload(null);
    setPreview(null);
    if (importLimits && file.size > importLimits.max_bytes) {
      setError(t("data.errors.tooLarge", { size: maxImportMegabytes }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setIsPreviewing(true);
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text()) as unknown;
    } catch {
      setError(t("data.errors.invalidJson"));
      setIsPreviewing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    try {
      const nextPreview = await previewBackup(payload, csrfToken);
      setPreview(nextPreview);
      if (nextPreview.valid) {
        setPendingPayload(payload);
        setMessage(t("data.previewReady"));
      } else {
        setError(t("data.errors.validation"));
      }
    } catch (previewError) {
      setError(
        previewError instanceof BackupTooLargeError
          ? t("data.errors.tooLarge", { size: maxImportMegabytes || "?" })
          : t("data.errors.preview"),
      );
    } finally {
      setIsPreviewing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function confirmImport() {
    if (!pendingPayload || !preview?.valid) {
      return;
    }

    setMessage("");
    setError("");
    setIsImporting(true);
    try {
      const data = await restoreBackupPayload(pendingPayload, csrfToken);
      downloadJson(data.previous_backup_filename, data.previous_backup);
      await onImported();
      setMessage(
        t("data.restored", {
          counts: t("data.countsSummary", {
            devices: data.counts.devices,
            ips: data.counts.ip_addresses,
            networks: data.counts.networks,
            vlans: data.counts.vlans,
            services: data.counts.services,
          }),
        }),
      );
      setPendingPayload(null);
      setPreview(null);
    } catch (restoreError) {
      setError(t(restoreErrorKey(restoreError)));
    } finally {
      setIsImporting(false);
    }
  }

  if (!canReadInventory) {
    return (
      <div className="page-title">
        <h1>{t("data.title")}</h1>
        <p>{t("data.noPermission")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>{t("data.title")}</h1>
        <p>{t("data.description")}</p>
      </div>

      <section className="panel data-workspace">
        <div className="data-tabs" role="tablist" aria-label={t("data.toolsLabel")}>
          <button
            className={activeSection === "backup" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("backup")}
            role="tab"
            type="button"
          >
            {t("data.backupTab")}
          </button>
          <button
            className={activeSection === "restore" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("restore")}
            role="tab"
            type="button"
          >
            {t("data.restoreTab")}
          </button>
          <button
            className={activeSection === "csv" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("csv")}
            role="tab"
            type="button"
          >
            {t("data.csvTab")}
          </button>
        </div>

        {activeSection === "backup" && (
          <article className="export-card data-section">
            <FileJson size={28} strokeWidth={1.8} />
            <div>
              <h2>{t("data.fullBackupTitle")}</h2>
              <p>{t("data.fullBackupDescription")}</p>
            </div>
            {!canExportInventory && <p className="muted-note">{t("data.noPermission")}</p>}
            {importLimits && !importLimits.current_backup_restorable && (
              <p className="inline-error" role="alert">
                {t("data.backupExceedsRestoreLimit", { size: maxImportMegabytes })}
              </p>
            )}
            <button
              className="primary-action"
              disabled={!canExportInventory}
              onClick={() => openExport("/inventory/export.json")}
            >
              <Download size={18} strokeWidth={2} />
              {t("data.downloadBackup")}
            </button>
          </article>
        )}

        {activeSection === "restore" && (
          <article className="export-card data-section">
            <RotateCcw size={28} strokeWidth={1.8} />
            <div>
              <h2>{t("data.restoreTitle")}</h2>
              <p>{t("data.restoreDescription")}</p>
            </div>
            <input
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  prepareImport(file).catch(() => undefined);
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="primary-action"
              disabled={!canRestoreInventory || isImporting || isPreviewing}
              onClick={() => fileInputRef.current?.click()}
              title={
                canRestoreInventory
                  ? t("data.restoreTitleAttr")
                  : t("data.adminOnly")
              }
            >
              <Upload size={18} strokeWidth={2} />
              {isPreviewing
                ? t("data.validating")
                : isImporting
                  ? t("data.restoring")
                  : t("data.uploadBackup")}
            </button>
          </article>
        )}

        {activeSection === "csv" && (
          <article className="export-card export-card-wide data-section">
            <Table size={28} strokeWidth={1.8} />
            <div>
              <h2>{t("data.csvTitle")}</h2>
              <p>{t("data.csvDescription")}</p>
            </div>
            {!canExportInventory && <p className="muted-note">{t("data.noPermission")}</p>}
            <div className="export-actions">
              {csvExports.map((item) => (
                <button
                  className="user-action"
                  disabled={!canExportInventory}
                  key={item.resource}
                  onClick={() => openExport(`/inventory/export/${item.resource}.csv`)}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
          </article>
        )}
      </section>

      {preview && (
        <section className="panel import-preview">
          <div className="import-preview-head">
            <div>
              <h2>{t("data.previewTitle")}</h2>
              <p>{t("data.previewDescription")}</p>
            </div>
            <span className={`mini-pill ${preview.valid ? "green" : "orange"}`}>
              {t(preview.valid ? "data.valid" : "data.review")}
            </span>
          </div>
          <div className="import-preview-grid">
            <PreviewCount label={t("data.current")} counts={preview.current_counts} />
            <PreviewCount label={t("data.backupLabel")} counts={preview.counts} />
          </div>
          {preview.errors.length > 0 && (
            <div className="import-preview-list">
              <strong>{t("data.errorsTitle")}</strong>
              {preview.errors.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="import-preview-list">
              <strong>{t("data.warningsTitle")}</strong>
              {preview.warnings.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
          <button
            className="danger-action"
            disabled={!preview.valid || isImporting}
            onClick={() => confirmImport().catch(() => undefined)}
          >
            {t("data.replaceInventory")}
          </button>
        </section>
      )}

      <section className="panel backup-notes">
        <h2>{t("data.scopeTitle")}</h2>
        <div className="backup-scope-grid">
          <span className="mini-pill green">{t("data.scope.inventory")}</span>
          <span className="mini-pill green">{t("data.scope.ipMacs")}</span>
          <span className="mini-pill green">{t("data.scope.services")}</span>
          <span className="mini-pill gray">{t("data.scope.noUsers")}</span>
          <span className="mini-pill gray">{t("data.scope.noSessions")}</span>
          <span className="mini-pill gray">{t("data.scope.noSecrets")}</span>
        </div>
      </section>

      {(message || error) && (
        <div className={error ? "form-error" : "form-success"}>{error || message}</div>
      )}
    </>
  );
}

function PreviewCount({ counts, label }: { counts: BackupCounts; label: string }) {
  const { t } = useTranslation();

  return (
    <div className="import-preview-count">
      <strong>{label}</strong>
      <span>{t("devices.count", { count: counts.devices })}</span>
      <span>{t("data.ipCount", { count: counts.ip_addresses })}</span>
      <span>{t("networks.count", { count: counts.networks })}</span>
      <span>{t("vlans.count", { count: counts.vlans })}</span>
      <span>{t("services.count", { count: counts.services })}</span>
    </div>
  );
}

// Every rejected restore leaves the inventory unchanged; the message says why.
function restoreErrorKey(error: unknown) {
  if (!(error instanceof RestoreError)) return "data.errors.restore";
  if (error.status === 409) return "data.errors.restoreDuplicates";
  if (error.status === 413) return "data.errors.restoreTooLarge";
  if (error.status === 422) return "data.errors.restoreInvalid";
  if (error.status >= 500) return "data.errors.restoreNotStarted";
  return "data.errors.restore";
}
