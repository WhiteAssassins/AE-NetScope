import { ChevronDown, ExternalLink, History, RefreshCw, Rocket } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchReleaseHistory,
  fetchUpdateStatus,
  fetchVersionInfo,
  startAutomaticUpdate,
} from "../api";
import { formatDate } from "../dateTime";
import type { GitHubReleaseDetails, UpdateStatusInfo, VersionInfo } from "../types";
import { hasPermission } from "../utils";

type UpdateStatus = "checking" | "current" | "update-available" | "unavailable";
type ReleaseHistoryStatus = "idle" | "loading" | "loaded" | "error";
type ReleaseFilter = "all" | "stable" | "prerelease";

type UpdateViewProps = {
  csrfToken: string;
  initialVersionInfo?: VersionInfo | null;
  permissions: string[];
};

const upgradeChecklist = ["releaseNotes", "jsonBackup", "postgresBackup", "environment", "health"] as const;

export default function UpdateView({
  csrfToken,
  initialVersionInfo = null,
  permissions,
}: UpdateViewProps) {
  const { t } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(initialVersionInfo);
  const [updateInfo, setUpdateInfo] = useState<UpdateStatusInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReleaseHistory, setShowReleaseHistory] = useState(false);
  const [releaseHistory, setReleaseHistory] = useState<GitHubReleaseDetails[]>([]);
  const [releaseHistoryStatus, setReleaseHistoryStatus] =
    useState<ReleaseHistoryStatus>("idle");
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
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
      setError(t("updates.checkFailed"));
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
      await startAutomaticUpdate(updateInfo.selected_release.tag_name, csrfToken);
      setMessage(t("updates.started"));
    } catch {
      setError(t("updates.startFailed"));
    } finally {
      setIsUpdating(false);
    }
  }

  async function loadReleaseHistory() {
    setReleaseHistoryStatus("loading");
    try {
      setReleaseHistory(await fetchReleaseHistory(8));
      setReleaseHistoryStatus("loaded");
    } catch {
      setReleaseHistoryStatus("error");
    }
  }

  function toggleReleaseHistory() {
    const nextVisible = !showReleaseHistory;
    setShowReleaseHistory(nextVisible);
    if (nextVisible && releaseHistoryStatus === "idle") {
      loadReleaseHistory().catch(() => undefined);
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
          setError(t("updates.checkFailed"));
        }
      }
    }

    load().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [initialVersionInfo, t]);

  const selectedRelease = updateInfo?.selected_release ?? null;
  const updateCapability = updateInfo?.update_capability ?? null;
  const capabilityReason = translateCapabilityReason(updateCapability?.reason, t);
  const canAutoUpdate =
    canManageSettings &&
    Boolean(selectedRelease) &&
    Boolean(updateCapability?.automatic_updates_supported) &&
    status === "update-available";
  const filteredReleases = releaseHistory.filter((release) => {
    if (releaseFilter === "stable") return !release.prerelease;
    if (releaseFilter === "prerelease") return release.prerelease;
    return true;
  });

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("updates.title")}</h1>
          <p>{t("updates.description")}</p>
        </div>
        <button className="primary-action" onClick={() => checkForUpdates().catch(() => undefined)}>
          <RefreshCw size={18} strokeWidth={2} />
          {t("updates.check")}
        </button>
      </div>

      {message && <div className="inline-success">{message}</div>}
      {error && <div className="inline-error">{error}</div>}

      <section className="update-grid">
        <article className="panel update-card">
          <span className={`mini-pill ${statusTone(status)}`}>{t(`updates.status.${status}`)}</span>
          <div>
            <h2>{t("updates.installedVersion")}</h2>
            <strong>{versionInfo ? `v${versionInfo.version}` : "-"}</strong>
            <p>{versionInfo ? `${versionInfo.app_name} · ${versionInfo.release_channel}` : "-"}</p>
          </div>
        </article>

        <ReleaseCard
          label={t("updates.latestStable")}
          release={updateInfo?.latest_release ?? null}
          fallbackUrl={versionInfo?.releases_url}
        />

        <ReleaseCard
          label={t("updates.latestPrerelease")}
          release={updateInfo?.latest_prerelease ?? null}
          fallbackUrl={versionInfo?.releases_url}
        />
      </section>

      <section className="panel release-history-panel">
        <div className="release-history-heading">
          <div>
            <div className="section-heading-with-icon">
              <History size={19} strokeWidth={1.9} />
              <h2>{t("updates.releaseHistory.title")}</h2>
            </div>
            <p>{t("updates.releaseHistory.description")}</p>
          </div>
          <button className="user-action" onClick={toggleReleaseHistory}>
            <History size={16} strokeWidth={1.8} />
            {t(
              showReleaseHistory
                ? "updates.releaseHistory.hide"
                : "updates.releaseHistory.show",
            )}
          </button>
        </div>

        {showReleaseHistory && (
          <div className="release-history-content">
            <div
              className="release-history-filters"
              role="group"
              aria-label={t("updates.releaseHistory.filterLabel")}
            >
              {(["all", "stable", "prerelease"] as const).map((filter) => (
                <button
                  className={releaseFilter === filter ? "active" : ""}
                  key={filter}
                  onClick={() => setReleaseFilter(filter)}
                  type="button"
                >
                  {t(`updates.releaseHistory.filters.${filter}`)}
                </button>
              ))}
            </div>

            {releaseHistoryStatus === "loading" && (
              <div className="release-history-state">
                <RefreshCw className="spin" size={19} />
                {t("updates.releaseHistory.loading")}
              </div>
            )}
            {releaseHistoryStatus === "error" && (
              <div className="release-history-state release-history-error">
                <span>{t("updates.releaseHistory.loadFailed")}</span>
                <button className="text-button" onClick={() => loadReleaseHistory()}>
                  {t("updates.releaseHistory.retry")}
                </button>
              </div>
            )}
            {releaseHistoryStatus === "loaded" && filteredReleases.length === 0 && (
              <div className="release-history-state">
                {t("updates.releaseHistory.empty")}
              </div>
            )}
            {releaseHistoryStatus === "loaded" && filteredReleases.length > 0 && (
              <div className="release-history-list">
                {filteredReleases.map((release, index) => (
                  <ReleaseNotes
                    installedVersion={versionInfo?.version ?? null}
                    key={release.tag_name}
                    open={index === 0}
                    release={release}
                    selectedTag={selectedRelease?.tag_name ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel update-checklist">
        <h2>{t("updates.selectedChannel")}</h2>
        <p>
          {t("updates.channelDescription", { channel: updateInfo?.target_channel ?? "-" })}
          {selectedRelease
            ? ` ${t("updates.currentTarget", { version: selectedRelease.tag_name })}`
            : ` ${t("updates.noRelease")}`}
        </p>
        <div className="row-actions">
          <a
            className="user-action support-link"
            href={selectedRelease?.html_url ?? versionInfo?.releases_url ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} />
            {t("updates.openRelease")}
          </a>
          <button
            className="primary-action"
            disabled={!canAutoUpdate || isUpdating}
            onClick={() => installSelectedUpdate().catch(() => undefined)}
            title={capabilityReason ?? t("updates.startAutomatic")}
          >
            <Rocket size={17} strokeWidth={2} />
            {isUpdating ? t("updates.starting") : t("updates.automaticUpdate")}
          </button>
        </div>
        {capabilityReason && <p className="muted-note">{capabilityReason}</p>}
      </section>

      <section className="panel update-checklist">
        <h2>{t("updates.checklistTitle")}</h2>
        {upgradeChecklist.map((item) => (
          <label key={item}>
            <input type="checkbox" />
            <span>{t(`updates.checklist.${item}`)}</span>
          </label>
        ))}
      </section>
    </>
  );
}

function ReleaseNotes({
  installedVersion,
  open,
  release,
  selectedTag,
}: {
  installedVersion: string | null;
  open: boolean;
  release: GitHubReleaseDetails;
  selectedTag: string | null;
}) {
  const { i18n, t } = useTranslation();
  const isInstalled = installedVersion
    ? normalizeReleaseTag(release.tag_name) === normalizeReleaseTag(installedVersion)
    : false;
  const isTarget = selectedTag === release.tag_name && !isInstalled;

  return (
    <details className="release-notes" open={open}>
      <summary>
        <div className="release-notes-summary">
          <strong>{release.name || release.tag_name}</strong>
          <span>
            {release.published_at
              ? formatDate(release.published_at, i18n.resolvedLanguage)
              : t("updates.unavailable")}
          </span>
        </div>
        <div className="release-notes-badges">
          <span className={`mini-pill ${release.prerelease ? "orange" : "green"}`}>
            {t(
              release.prerelease
                ? "updates.releaseHistory.prerelease"
                : "updates.releaseHistory.stable",
            )}
          </span>
          {isInstalled && (
            <span className="mini-pill blue">{t("updates.releaseHistory.installed")}</span>
          )}
          {isTarget && (
            <span className="mini-pill blue">{t("updates.releaseHistory.target")}</span>
          )}
          <ChevronDown className="release-notes-chevron" size={18} strokeWidth={1.8} />
        </div>
      </summary>
      <div className="release-notes-content">
        <div className="release-notes-body">
          <Markdown
            components={{
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
            remarkPlugins={[remarkGfm]}
          >
            {release.body?.trim() || t("updates.releaseHistory.noNotes")}
          </Markdown>
        </div>
        {release.body_truncated && (
          <p className="muted-note">{t("updates.releaseHistory.truncated")}</p>
        )}
        <a
          className="user-action support-link"
          href={release.html_url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} />
          {t("updates.releaseHistory.openFull")}
        </a>
      </div>
    </details>
  );
}

function normalizeReleaseTag(value: string) {
  return value.trim().replace(/^v/i, "");
}

function translateCapabilityReason(reason: string | null | undefined, t: TFunction) {
  if (!reason) {
    return null;
  }
  const translatedReasons: string[] = [];
  if (reason.includes("GitHub releases could not be checked")) {
    translatedReasons.push(t("updates.reasons.releaseCheckFailed"));
  }
  if (reason.includes("TrueNAS installations must be updated")) {
    translatedReasons.push(t("updates.reasons.truenas"));
  }
  if (reason.includes("Automatic updates are only supported")) {
    translatedReasons.push(t("updates.reasons.dockerOnly"));
  }
  if (reason.includes("AE_NETSCOPE_AUTO_UPDATE_ENABLED")) {
    translatedReasons.push(t("updates.reasons.configureDocker"));
  }
  return translatedReasons.length
    ? translatedReasons.join(" ")
    : t("updates.reasons.unknown");
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
  const { i18n, t } = useTranslation();
  return (
    <article className="panel update-card">
      <span className="mini-pill gray">{t("updates.githubReleases")}</span>
      <div>
        <h2>{label}</h2>
        <strong>{release?.tag_name ?? "-"}</strong>
        <p>
          {release?.published_at
            ? formatDate(release.published_at, i18n.resolvedLanguage)
            : t("updates.unavailable")}
        </p>
      </div>
      <a
        className="user-action support-link"
        href={release?.html_url ?? fallbackUrl ?? "#"}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={15} strokeWidth={1.8} />
        {t("updates.open")}
      </a>
    </article>
  );
}

function statusTone(status: UpdateStatus) {
  if (status === "current") return "green";
  if (status === "update-available") return "orange";
  return "gray";
}
