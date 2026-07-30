import {
  BookOpen,
  Building2,
  Code2,
  ExternalLink,
  Globe,
  Network,
  PackageCheck,
  Scale,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpdateStatusInfo, VersionInfo } from "../types";

type AboutViewProps = {
  onOpenSupport: () => void;
  onOpenUpdates: () => void;
  updateStatus: UpdateStatusInfo | null;
  versionInfo: VersionInfo | null;
};

const projectLinks = [
  {
    href: "https://github.com/WhiteAssassins/AE-NetScope",
    icon: Code2,
    labelKey: "about.links.repository",
  },
  {
    href: "https://github.com/WhiteAssassins/AE-NetScope#readme",
    icon: BookOpen,
    labelKey: "about.links.documentation",
  },
  {
    href: "https://github.com/WhiteAssassins/AE-NetScope/releases",
    icon: PackageCheck,
    labelKey: "about.links.releases",
  },
  {
    href: "https://github.com/WhiteAssassins/AE-NetScope/blob/main/LICENSE",
    icon: Scale,
    labelKey: "about.links.license",
  },
];

export default function AboutView({
  onOpenSupport,
  onOpenUpdates,
  updateStatus,
  versionInfo,
}: AboutViewProps) {
  const { t } = useTranslation();
  const installedVersion = versionInfo?.version ?? updateStatus?.installed_version ?? t("about.unknown");
  const channel = versionInfo?.release_channel ?? updateStatus?.installed_channel ?? t("about.unknown");
  const selectedRelease = updateStatus?.selected_release;
  const updateLabel = updateStatus
    ? updateStatus.update_available
      ? t("about.updateAvailable", { version: selectedRelease?.tag_name ?? t("about.unknown") })
      : t("about.upToDate")
    : t("about.updateUnknown");

  return (
    <div className="about-page">
      <header className="about-heading">
        <div className="about-brand-mark" aria-hidden="true">
          <Network size={32} strokeWidth={1.8} />
        </div>
        <div>
          <span className="about-eyebrow">{t("about.eyebrow")}</span>
          <h1>AE NetScope</h1>
          <p>{t("about.description")}</p>
        </div>
        <span className="about-preview-badge">{t("about.preview")}</span>
      </header>

      <section className="about-version-grid" aria-label={t("about.versionSummary")}>
        <div>
          <span>{t("about.installedVersion")}</span>
          <strong>v{installedVersion}</strong>
        </div>
        <div>
          <span>{t("about.releaseChannel")}</span>
          <strong>{channel}</strong>
        </div>
        <div>
          <span>{t("about.updateStatus")}</span>
          <strong className={updateStatus?.update_available ? "about-update-available" : ""}>
            {updateLabel}
          </strong>
        </div>
        <button className="user-action" type="button" onClick={onOpenUpdates}>
          <PackageCheck size={17} />
          {t("about.openUpdates")}
        </button>
      </section>

      <div className="about-content-grid">
        <section className="panel about-section">
          <div className="about-section-heading">
            <UserRound size={21} />
            <div>
              <h2>{t("about.peopleTitle")}</h2>
              <p>{t("about.peopleDescription")}</p>
            </div>
          </div>
          <dl className="about-details">
            <div>
              <dt>{t("about.creator")}</dt>
              <dd>Christopher David Alberto Roque</dd>
            </div>
            <div>
              <dt>{t("about.githubProfile")}</dt>
              <dd>
                <a href="https://github.com/WhiteAssassins" target="_blank" rel="noreferrer">
                  WhiteAssassins <ExternalLink size={14} />
                </a>
              </dd>
            </div>
            <div>
              <dt>{t("about.organization")}</dt>
              <dd>
                <a href="https://aewhitedevs.com/" target="_blank" rel="noreferrer">
                  AE White Devs LLC <ExternalLink size={14} />
                </a>
              </dd>
            </div>
            <div>
              <dt>{t("about.license")}</dt>
              <dd>MIT License</dd>
            </div>
          </dl>
        </section>

        <section className="panel about-section">
          <div className="about-section-heading">
            <Code2 size={21} />
            <div>
              <h2>{t("about.resourcesTitle")}</h2>
              <p>{t("about.resourcesDescription")}</p>
            </div>
          </div>
          <div className="about-link-list">
            {projectLinks.map((link) => (
              <a href={link.href} key={link.labelKey} target="_blank" rel="noreferrer">
                <link.icon size={18} />
                <span>{t(link.labelKey)}</span>
                <ExternalLink size={15} />
              </a>
            ))}
          </div>
        </section>

        <section className="panel about-section about-project-section">
          <div className="about-section-heading">
            <Building2 size={21} />
            <div>
              <h2>{t("about.projectTitle")}</h2>
              <p>{t("about.projectDescription")}</p>
            </div>
          </div>
          <div className="about-project-body">
            <p>{t("about.projectBody")}</p>
            <div className="about-tech-list" aria-label={t("about.technology")}>
              <span>React + TypeScript</span>
              <span>FastAPI + Python</span>
              <span>PostgreSQL</span>
              <span>Redis</span>
              <span>Docker</span>
              <span>TrueNAS</span>
            </div>
          </div>
        </section>

        <section className="about-contact-band">
          <Globe size={22} />
          <div>
            <strong>{t("about.contactTitle")}</strong>
            <span>{t("about.contactDescription")}</span>
          </div>
          <a className="user-action" href="https://netscope.aewhitedevs.com/" target="_blank" rel="noreferrer">
            {t("about.website")}
            <ExternalLink size={16} />
          </a>
          <button className="primary-action" type="button" onClick={onOpenSupport}>
            {t("about.openSupport")}
          </button>
        </section>
      </div>
    </div>
  );
}
