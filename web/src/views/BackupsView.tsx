import { Download, FileJson, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../api";
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
  const [isImporting, setIsImporting] = useState(false);
  const canReadInventory = hasPermission(permissions, "inventory:read");
  const canRestoreInventory = hasPermission(permissions, "settings:manage");

  function downloadBackup() {
    window.open(`${API_BASE_URL}/inventory/export.json`, "_blank", "noopener,noreferrer");
  }

  async function restoreBackup(file: File) {
    setMessage("");
    setError("");

    const confirmed = window.confirm(
      "Restaurar este backup reemplazará el inventario actual. Los usuarios y sesiones no se modificarán. ¿Continuar?",
    );
    if (!confirmed) {
      return;
    }

    setIsImporting(true);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const response = await fetch(`${API_BASE_URL}/inventory/import.json`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo restaurar el backup. Verifica que sea un JSON válido de AE NetScope.");
        return;
      }

      const data = (await response.json()) as {
        counts: { devices: number; ip_addresses: number; networks: number; services: number };
      };
      await onImported();
      setMessage(
        `Backup restaurado: ${data.counts.devices} dispositivos, ${data.counts.ip_addresses} IPs, ${data.counts.networks} subredes y ${data.counts.services} servicios.`,
      );
    } catch {
      setError("El archivo no parece ser un JSON válido.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
              Reemplaza el inventario actual desde un backup JSON. Las cuentas de usuario no se
              modifican.
            </p>
          </div>
          <input
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                restoreBackup(file).catch(() => undefined);
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="primary-action"
            disabled={!canRestoreInventory || isImporting}
            onClick={() => fileInputRef.current?.click()}
            title={
              canRestoreInventory
                ? "Restaurar inventario desde backup"
                : "Solo administradores pueden restaurar backups"
            }
          >
            <Upload size={18} strokeWidth={2} />
            {isImporting ? "Restaurando..." : "Subir backup"}
          </button>
        </article>
      </section>

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
