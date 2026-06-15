import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchLatestGitHubRelease, fetchVersionInfo } from "../api";
import type { GitHubReleaseInfo, VersionInfo } from "../types";

type UpdateStatus = "checking" | "current" | "update-available" | "unavailable";

type UpdateViewProps = {
  initialVersionInfo?: VersionInfo | null;
};

const upgradeChecklist = [
  "Leer las release notes antes de actualizar.",
  "Descargar un backup JSON desde Respaldos.",
  "Guardar una copia de .env o variables globales de producción.",
  "Ejecutar migraciones de base de datos después de actualizar.",
  "Verificar Estado del sistema: API, base de datos y Redis.",
];

export default function UpdateView({ initialVersionInfo = null }: UpdateViewProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(initialVersionInfo);
  const [latestRelease, setLatestRelease] = useState<GitHubReleaseInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");

  async function checkForUpdates() {
    setStatus("checking");
    try {
      const [currentVersion, latestGitHubRelease] = await Promise.all([
        fetchVersionInfo(),
        fetchLatestGitHubRelease(),
      ]);
      setVersionInfo(currentVersion);
      setLatestRelease(latestGitHubRelease);
      if (!latestGitHubRelease) {
        setStatus("unavailable");
        return;
      }
      setStatus(
        normalizeVersion(latestGitHubRelease.tag_name) === normalizeVersion(currentVersion.version)
          ? "current"
          : "update-available",
      );
    } catch {
      setStatus("unavailable");
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [currentVersion, latestGitHubRelease] = await Promise.all([
          initialVersionInfo ? Promise.resolve(initialVersionInfo) : fetchVersionInfo(),
          fetchLatestGitHubRelease(),
        ]);
        if (!isMounted) {
          return;
        }
        setVersionInfo(currentVersion);
        setLatestRelease(latestGitHubRelease);
        if (!latestGitHubRelease) {
          setStatus("unavailable");
          return;
        }
        setStatus(
          normalizeVersion(latestGitHubRelease.tag_name) === normalizeVersion(currentVersion.version)
            ? "current"
            : "update-available",
        );
      } catch {
        if (isMounted) {
          setStatus("unavailable");
        }
      }
    }

    load().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [initialVersionInfo]);

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Actualizaciones</h1>
          <p>Versión instalada, última release pública y checklist de upgrade.</p>
        </div>
        <button className="primary-action" onClick={() => checkForUpdates().catch(() => undefined)}>
          <RefreshCw size={18} strokeWidth={2} />
          Buscar actualización
        </button>
      </div>

      <section className="update-grid">
        <article className="panel update-card">
          <span className={`mini-pill ${statusTone(status)}`}>{statusLabel(status)}</span>
          <div>
            <h2>Versión instalada</h2>
            <strong>{versionInfo ? `v${versionInfo.version}` : "-"}</strong>
            <p>{versionInfo ? `${versionInfo.app_name} · ${versionInfo.release_channel}` : "-"}</p>
          </div>
        </article>

        <article className="panel update-card">
          <span className="mini-pill gray">GitHub Releases</span>
          <div>
            <h2>Última versión</h2>
            <strong>{latestRelease?.tag_name ?? "-"}</strong>
            <p>{latestRelease?.prerelease ? "Pre-release" : "Release estable o no disponible"}</p>
          </div>
          <a
            className="user-action support-link"
            href={latestRelease?.html_url ?? versionInfo?.releases_url ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} />
            Abrir release
          </a>
        </article>
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

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
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
