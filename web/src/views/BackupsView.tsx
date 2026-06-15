import { Download, FileJson, RotateCcw, Upload } from "lucide-react";
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

type BackupsViewProps = {
  csrfToken: string;
  onImported: () => Promise<void>;
  permissions: string[];
};

export default function BackupsView({ csrfToken, onImported, permissions }: BackupsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingPayload, setPendingPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const canReadInventory = hasPermission(permissions, "inventory:read");
  const canRestoreInventory = hasPermission(permissions, "settings:manage");

  function downloadBackup() {
    window.open(`${API_BASE_URL}/inventory/export.json`, "_blank", "noopener,noreferrer");
  }

  async function prepareRestore(file: File) {
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
        setMessage("Backup validado. Revisa el resumen antes de restaurar.");
      } else {
        setError("El backup no pasó la validación. Revisa los detalles antes de continuar.");
      }
    } catch {
      setError("El archivo no parece ser un JSON válido de AE NetScope.");
    } finally {
      setIsPreviewing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function confirmRestore() {
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
        `Backup restaurado: ${countsSummary(data.counts)}. Se descargó un backup previo automático.`,
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
        <h1>Respaldos</h1>
        <p>No tienes permisos para leer el inventario.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>Respaldos</h1>
        <p>Genera y restaura backups completos del inventario operativo.</p>
      </div>

      <section className="backup-layout">
        <article className="panel backup-card">
          <FileJson size={30} strokeWidth={1.8} />
          <div>
            <h2>Backup completo</h2>
            <p>
              Descarga dispositivos, interfaces, IPs, subredes, VLANs y servicios en un archivo
              JSON portable.
            </p>
          </div>
          <button className="primary-action" onClick={downloadBackup}>
            <Download size={18} strokeWidth={2} />
            Descargar backup
          </button>
        </article>

        <article className="panel backup-card">
          <RotateCcw size={30} strokeWidth={1.8} />
          <div>
            <h2>Restaurar backup</h2>
            <p>
              Valida el archivo, muestra un preview y descarga un backup automático antes de
              reemplazar el inventario.
            </p>
          </div>
          <input
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                prepareRestore(file).catch(() => undefined);
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
                ? "Restaurar inventario desde backup"
                : "Solo administradores pueden restaurar backups"
            }
          >
            <Upload size={18} strokeWidth={2} />
            {isPreviewing ? "Validando..." : isImporting ? "Restaurando..." : "Subir backup"}
          </button>
        </article>
      </section>

      {preview && (
        <section className="panel import-preview">
          <div className="import-preview-head">
            <div>
              <h2>Preview de restauración</h2>
              <p>
                El inventario actual será reemplazado. Usuarios, sesiones y secretos no se
                modifican.
              </p>
            </div>
            <span className={`mini-pill ${preview.valid ? "green" : "orange"}`}>
              {preview.valid ? "Válido" : "Revisar"}
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
            onClick={() => confirmRestore().catch(() => undefined)}
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
