import { Code2, Globe, Mail, ShieldQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";

type SupportViewProps = {
  onOpenAbout: () => void;
};

export default function SupportView({ onOpenAbout }: SupportViewProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="page-title">
        <h1>{t("support.title")}</h1>
        <p>{t("support.description")}</p>
      </div>

      <section className="support-grid">
        <article className="panel support-card">
          <Mail size={28} strokeWidth={1.8} />
          <div>
            <h2>{t("support.primaryContact")}</h2>
            <p>{t("support.primaryContactDescription")}</p>
          </div>
          <a className="primary-action" href="mailto:contacto@aewhitedevs.com">
            contacto@aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <ShieldQuestion size={28} strokeWidth={1.8} />
          <div>
            <h2>{t("support.administration")}</h2>
            <p>{t("support.administrationDescription")}</p>
          </div>
          <a className="primary-action" href="mailto:admin@aewhitedevs.com">
            admin@aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <Globe size={28} strokeWidth={1.8} />
          <div>
            <h2>AE White Devs</h2>
            <p>{t("support.companyDescription")}</p>
          </div>
          <a className="user-action support-link" href="https://aewhitedevs.com" target="_blank" rel="noreferrer">
            aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <Code2 size={28} strokeWidth={1.8} />
          <div>
            <h2>GitHub</h2>
            <p>{t("support.githubDescription")}</p>
          </div>
          <a
            className="user-action support-link"
            href="https://github.com/WhiteAssassins/AE-NetScope"
            target="_blank"
            rel="noreferrer"
          >
            github.com/WhiteAssassins/AE-NetScope
          </a>
        </article>
      </section>

      <div className="support-about-band">
        <div>
          <strong>{t("support.aboutTitle")}</strong>
          <span>{t("support.aboutDescription")}</span>
        </div>
        <button className="user-action" type="button" onClick={onOpenAbout}>
          {t("support.openAbout")}
        </button>
      </div>
    </>
  );
}
