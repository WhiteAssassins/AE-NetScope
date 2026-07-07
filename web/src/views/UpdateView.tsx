import { ExternalLink, RefreshCw, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchUpdateStatus, fetchVersionInfo, startAutomaticUpdate } from "../api";
import type { UpdateStatusInfo, VersionInfo } from "../types";
import { hasPermission } from "../utils";

type UpdateStatus = "checking" | "current" | "update-available" | "unavailable";

type UpdateViewProps = {
  csrfToken: string;
  initialVersionInfo?: VersionInfo | null;
  permissions: string[];
};

const upgradeChecklist = [
  "Leer las release notes antes de actualizar.",
  "Descargar un backup JSON desde Datos.",
  "Confirmar que existe backup PostgreSQL pre-migración.",
  "Guardar una copia de .env o variables globales de producción.",
  "Verificar Estado del sistema: API, base de datos y Redis.",
];

export default function UpdateView({
  csrfToken,
  initialVersionInfo = null,
  permissions,
}: UpdateViewProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(initialVersionInfo);
  const [updateInfo, setUpdateInfo] = useState<UpdateStatusInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const canManageSettings = hasPermission(permissions, "settings:manage");

  function applyUpdateState(currentVersion: VersionInfo, currentUpdateInfo: UpdateStatusInfo) {
    setVersionInfo(currentVersion);
    setUpdateInfo(currentUpdateInfo);
    setStatus(currentUpdateInfo.update_available ? "update-available" : "current");
  }

  async function checkForUpdates() {
    setStatus("checking");
    setError("");
    try {
      const [currentVersion, currentUpdateInfo] = await Promise.all([
        fetchVersionInfo(),
        fetchUpdateStatus(),
      ]);
      applyUpdateState(currentVersion, currentUpdateInfo);
    } catch {
      setStatus("unavailable");
      setError("No se pudo consultar GitHub o el estado de actualización.");
    }
  }

  async function installSelectedUpdate() {
    if (!updateInfo?.selected_release || !canManageSettings) {
      return;
    }
    setIsUpdating(true);
    setMessage("");
    setError("");
    try {
      const response = await startAutomaticUpdate(updateInfo.selected_release.tag_name, csrfToken);
      setMessage(response.message);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "No se pudo iniciar la actualización.");
    } finally {
      setIsUpdating(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [currentVersion, currentUpdateInfo] = await Promise.all([
          initialVersionInfo ? Promise.resolve(initialVersionInfo) : fetchVersionInfo(),
          fetchUpdateStatus(),
        ]);
        if (!isMounted) {
          return;
        }
        applyUpdateState(currentVersion, currentUpdateInfo);
      } catch {
        if (isMounted) {
          setStatus("unavailable");
          setError("No se pudo consultar GitHub o el estado de actualización.");
        }
      }
    }

    load().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [initialVersionInfo]);

  const selectedRelease = updateInfo?.selected_release ?? null;
  const updateCapability = updateInfo?.update_capability ?? null;
  const canAutoUpdate =
    canManageSettings &&
    Boolean(selectedRelease) &&
    Boolean(updateCapability?.automatic_updates_supported) &&
    status === "update-available";

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Actualizaciones</h1>
          <p>Versión instalada, releases de GitHub y actualización segura por plataforma.</p>
        </div>
        <button className="primary-action" onClick={() => checkForUpdates().catch(() => undefined)}>
          <RefreshCw size={18} strokeWidth={2} />
          Buscar actualización
        </button>
      </div>

      {message && <div className="inline-success">{message}</div>}
      {error && <div className="inline-error">{error}</div>}

      <section className="update-grid">
        <article className="panel update-card">
          <span className={`mini-pill ${statusTone(status)}`}>{statusLabel(status)}</span>
          <div>
            <h2>Versión instalada</h2>
            <strong>{versionInfo ? `v${versionInfo.version}` : "-"}</strong>
            <p>{versionInfo ? `${versionInfo.app_name} · ${versionInfo.release_channel}` : "-"}</p>
          </div>
        </article>

        <ReleaseCard
          label="Última release estable"
          release={updateInfo?.latest_release ?? null}
          fallbackUrl={versionInfo?.releases_url}
        />

        <ReleaseCard
          label="Última prerelease"
          release={updateInfo?.latest_prerelease ?? null}
          fallbackUrl={versionInfo?.releases_url}
        />
      </section>

      <section className="panel update-checklist">
        <h2>Canal seleccionado</h2>
        <p>
          AE NetScope usa el canal {updateInfo?.target_channel ?? "-"} para esta instalación.
          {selectedRelease ? ` Objetivo actual: ${selectedRelease.tag_name}.` : " No hay release disponible."}
        </p>
        <div className="row-actions">
          <a
            className="user-action support-link"
            href={selectedRelease?.html_url ?? versionInfo?.releases_url ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} />
            Abrir release
          </a>
          <button
            className="primary-action"
            disabled={!canAutoUpdate || isUpdating}
            onClick={() => installSelectedUpdate().catch(() => undefined)}
            title={updateCapability?.reason ?? "Iniciar actualización automática"}
          >
            <Rocket size={17} strokeWidth={2} />
            {isUpdating ? "Iniciando..." : "Actualizar automáticamente"}
          </button>
        </div>
        {updateCapability?.reason && <p className="muted-note">{updateCapability.reason}</p>}
      </section>

      <section className="panel update-checklist">
        <h2>Checklist de upgrade</h2>
        {upgradeChecklist.map((item) => (
          <label key={item}>
            <input type="checkbox" />
            <span>{item}</span>
          </label>
        ))}
      </section>
    </>
  );
}

function ReleaseCard({
  label,
  release,
  fallbackUrl,
}: {
  label: string;
  release: UpdateStatusInfo["latest_release"];
  fallbackUrl?: string;
}) {
  return (
    <article className="panel update-card">
      <span className="mini-pill gray">GitHub Releases</span>
      <div>
        <h2>{label}</h2>
        <strong>{release?.tag_name ?? "-"}</strong>
        <p>{release?.published_at ? new Date(release.published_at).toLocaleDateString() : "No disponible"}</p>
      </div>
      <a
        className="user-action support-link"
        href={release?.html_url ?? fallbackUrl ?? "#"}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={15} strokeWidth={1.8} />
        Abrir
      </a>
    </article>
  );
}

function statusTone(status: UpdateStatus) {
  if (status === "current") return "green";
  if (status === "update-available") return "orange";
  return "gray";
}

function statusLabel(status: UpdateStatus) {
  if (status === "checking") return "Comprobando";
  if (status === "current") return "Actualizado";
  if (status === "update-available") return "Actualización disponible";
  return "No disponible";
}
