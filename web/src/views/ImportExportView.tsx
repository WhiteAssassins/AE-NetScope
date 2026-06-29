import { Download, FileJson, RotateCcw, Table, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../api";
import {
  type BackupCounts,
  type BackupPreview,
  countsSummary,
  downloadJson,
  previewBackup,
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
  { resource: "devices", label: "Dispositivos" },
  { resource: "ip-addresses", label: "IPs y MACs" },
  { resource: "networks", label: "Subredes" },
  { resource: "vlans", label: "VLANs" },
  { resource: "services", label: "Servicios" },
  { resource: "interfaces", label: "Interfaces" },
];

export default function ImportExportView({
  csrfToken,
  onImported,
  permissions,
}: ImportExportViewProps) {
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

  function openExport(path: string) {
    window.open(`${API_BASE_URL}${path}`, "_blank", "noopener,noreferrer");
  }

  async function prepareImport(file: File) {
    setActiveSection("restore");
    setMessage("");
    setError("");
    setPendingPayload(null);
    setPreview(null);
    setIsPreviewing(true);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const nextPreview = await previewBackup(payload, csrfToken);
      setPreview(nextPreview);
      if (nextPreview.valid) {
        setPendingPayload(payload);
        setMessage("Backup validado. Revisa el preview antes de restaurar.");
      } else {
        setError("El backup no paso la validacion. Revisa los detalles antes de continuar.");
      }
    } catch {
      setError("El archivo no parece ser un JSON valido de AE NetScope.");
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
        `Backup restaurado: ${countsSummary(data.counts)}. Se descargo un backup previo automatico.`,
      );
      setPendingPayload(null);
      setPreview(null);
    } catch {
      setError("No se pudo restaurar el backup validado.");
    } finally {
      setIsImporting(false);
    }
  }

  if (!canReadInventory) {
    return (
      <div className="page-title">
        <h1>Datos</h1>
        <p>No tienes permisos para exportar inventario.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>Datos</h1>
        <p>Backups, restauracion y exportaciones portables del inventario.</p>
      </div>

      <section className="panel data-workspace">
        <div className="data-tabs" role="tablist" aria-label="Herramientas de datos">
          <button
            className={activeSection === "backup" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("backup")}
            role="tab"
            type="button"
          >
            Backup JSON
          </button>
          <button
            className={activeSection === "restore" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("restore")}
            role="tab"
            type="button"
          >
            Restaurar
          </button>
          <button
            className={activeSection === "csv" ? "data-tab active" : "data-tab"}
            onClick={() => setActiveSection("csv")}
            role="tab"
            type="button"
          >
            Exportar CSV
          </button>
        </div>

        {activeSection === "backup" && (
          <article className="export-card data-section">
            <FileJson size={28} strokeWidth={1.8} />
            <div>
              <h2>Inventario completo JSON</h2>
              <p>
                Descarga un backup portable con dispositivos, interfaces, IPs, subredes, VLANs y
                servicios.
              </p>
            </div>
            <button className="primary-action" onClick={() => openExport("/inventory/export.json")}>
              <Download size={18} strokeWidth={2} />
              Descargar backup
            </button>
          </article>
        )}

        {activeSection === "restore" && (
          <article className="export-card data-section">
            <RotateCcw size={28} strokeWidth={1.8} />
            <div>
              <h2>Restaurar backup JSON</h2>
              <p>Valida el archivo, muestra un preview y descarga un backup previo automatico.</p>
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
                  ? "Restaurar inventario desde JSON"
                  : "Solo administradores pueden restaurar backups"
              }
            >
              <Upload size={18} strokeWidth={2} />
              {isPreviewing ? "Validando..." : isImporting ? "Restaurando..." : "Subir backup"}
            </button>
          </article>
        )}

        {activeSection === "csv" && (
          <article className="export-card export-card-wide data-section">
            <Table size={28} strokeWidth={1.8} />
            <div>
              <h2>CSV por tabla</h2>
              <p>Descargas individuales para trabajar en hojas de calculo o reportes.</p>
            </div>
            <div className="export-actions">
              {csvExports.map((item) => (
                <button
                  className="user-action"
                  key={item.resource}
                  onClick={() => openExport(`/inventory/export/${item.resource}.csv`)}
                >
                  {item.label}
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
              <h2>Preview de restauracion</h2>
              <p>
                El inventario actual sera reemplazado. Usuarios, sesiones y secretos no se
                modifican.
              </p>
            </div>
            <span className={`mini-pill ${preview.valid ? "green" : "orange"}`}>
              {preview.valid ? "Valido" : "Revisar"}
            </span>
          </div>
          <div className="import-preview-grid">
            <PreviewCount label="Actual" counts={preview.current_counts} />
            <PreviewCount label="Backup" counts={preview.counts} />
          </div>
          {preview.errors.length > 0 && (
            <div className="import-preview-list">
              <strong>Errores</strong>
              {preview.errors.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="import-preview-list">
              <strong>Advertencias</strong>
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
            Reemplazar inventario
          </button>
        </section>
      )}

      <section className="panel backup-notes">
        <h2>Alcance del backup</h2>
        <div className="backup-scope-grid">
          <span className="mini-pill green">Incluye inventario</span>
          <span className="mini-pill green">Incluye IPs y MACs</span>
          <span className="mini-pill green">Incluye servicios</span>
          <span className="mini-pill gray">No incluye usuarios</span>
          <span className="mini-pill gray">No incluye sesiones</span>
          <span className="mini-pill gray">No incluye secretos</span>
        </div>
      </section>

      {(message || error) && (
        <div className={error ? "form-error" : "form-success"}>{error || message}</div>
      )}
    </>
  );
}

function PreviewCount({ counts, label }: { counts: BackupCounts; label: string }) {
  return (
    <div className="import-preview-count">
      <strong>{label}</strong>
      <span>{counts.devices} dispositivos</span>
      <span>{counts.ip_addresses} IPs</span>
      <span>{counts.networks} subredes</span>
      <span>{counts.vlans} VLANs</span>
      <span>{counts.services} servicios</span>
    </div>
  );
}
