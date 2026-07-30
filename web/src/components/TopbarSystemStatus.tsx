import { HeartPulse, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HealthStatus, UpdateStatusInfo, VersionInfo } from "../types";

type TopbarSystemStatusProps = {
  health: HealthStatus | null;
  onOpenHealth: () => void;
  onOpenUpdates: () => void;
  updateStatus: UpdateStatusInfo | null;
  version: VersionInfo | null;
};

export default function TopbarSystemStatus({
  health,
  onOpenHealth,
  onOpenUpdates,
  updateStatus,
  version,
}: TopbarSystemStatusProps) {
  const { t } = useTranslation();
  const healthState = health?.status ?? "unknown";
  const healthLabel = t(`topbar.health.${healthState}`);
  const installedVersion = version ? `v${version.version}` : t("topbar.versionUnknown");
  const versionLabel = updateStatus?.update_available
    ? t("topbar.versionWithUpdate", { version: installedVersion })
    : t("topbar.installedVersion", { version: installedVersion });

  return (
    <div className="topbar-system-status">
      <button
        aria-label={healthLabel}
        className={`topbar-health topbar-health-${healthState}`}
        onClick={onOpenHealth}
        title={healthLabel}
        type="button"
      >
        <span className="topbar-health-icon">
          <HeartPulse aria-hidden="true" size={18} strokeWidth={1.9} />
          <span aria-hidden="true" className="topbar-health-dot" />
        </span>
        <span className="topbar-health-copy">{healthLabel}</span>
      </button>

      <button
        aria-label={versionLabel}
        className={updateStatus?.update_available ? "topbar-version has-update" : "topbar-version"}
        onClick={onOpenUpdates}
        title={versionLabel}
        type="button"
      >
        <PackageCheck aria-hidden="true" size={18} strokeWidth={1.9} />
        <strong>{installedVersion}</strong>
        {updateStatus?.update_available && (
          <span className="topbar-update-badge">{t("topbar.updateAvailable")}</span>
        )}
      </button>
    </div>
  );
}
