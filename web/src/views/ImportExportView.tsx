import { Download, FileJson, RotateCcw, Table, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../api";
import { hasPermission } from "../utils";

type ImportExportViewProps = {
  csrfToken: string;
  onImported: () => Promise<void>;
  permissions: string[];
};

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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const canReadInventory = hasPermission(permissions, "inventory:read");
  const canRestoreInventory = hasPermission(permissions, "settings:manage");

  function openExport(path: string) {
    window.open(`${API_BASE_URL}${path}`, "_blank", "noopener,noreferrer");
  }

  async function importBackup(file: File) {
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
        setError("No se pudo restaurar el backup. Revisa que sea un JSON válido de AE NetScope.");
        return;
      }

      const data = (await response.json()) as {
        counts: { devices: number; ip_addresses: number; networks: number };
      };
      await onImported();
      setMessage(
        `Backup restaurado: ${data.counts.devices} dispositivos, ${data.counts.ip_addresses} IPs, ${data.counts.networks} subredes.`,
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
        <h1>Importar / Exportar</h1>
        <p>No tienes permisos para exportar inventario.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>Importar / Exportar</h1>
        <p>Exporta y restaura el inventario en formatos portables para respaldo o auditoría.</p>
      </div>

      <section className="export-grid">
        <article className="panel export-card">
          <RotateCcw size={28} strokeWidth={1.8} />
          <div>
            <h2>Restaurar backup JSON</h2>
            <p>Reemplaza dispositivos, IPs, subredes, VLANs, servicios e interfaces.</p>
          </div>
          <input
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                importBackup(file).catch(() => undefined);
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
                ? "Restaurar inventario desde JSON"
                : "Solo administradores pueden restaurar backups"
            }
          >
            <Upload size={18} strokeWidth={2} />
            {isImporting ? "Restaurando..." : "Subir JSON"}
          </button>
        </article>

        <article className="panel export-card">
          <FileJson size={28} strokeWidth={1.8} />
          <div>
            <h2>Inventario completo JSON</h2>
            <p>Incluye dispositivos, IPs, subredes, VLANs, servicios e interfaces.</p>
          </div>
          <button className="primary-action" onClick={() => openExport("/inventory/export.json")}>
            <Download size={18} strokeWidth={2} />
            Descargar JSON
          </button>
        </article>

        <article className="panel export-card export-card-wide">
          <Table size={28} strokeWidth={1.8} />
          <div>
            <h2>CSV por tabla</h2>
            <p>Descargas individuales para trabajar en hojas de cálculo o reportes.</p>
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
      </section>

      {(message || error) && (
        <div className={error ? "form-error" : "form-success"}>{error || message}</div>
      )}
    </>
  );
}
