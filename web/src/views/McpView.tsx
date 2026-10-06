import { ExternalLink, Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import IntegrationSettings from "../components/IntegrationSettings";

type McpViewProps = {
  csrfToken: string;
  permissions: string[];
};

export default function McpView({ csrfToken, permissions }: McpViewProps) {
  const { t } = useTranslation();

  if (!permissions.includes("inventory:read")) {
    return (
      <div className="page-title">
        <h1>{t("integrations.title")}</h1>
        <p>{t("integrations.forbidden")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <h1>{t("integrations.title")}</h1>
        <p>{t("integrations.description")}</p>
      </div>

      <section className="panel settings-panel">
        <IntegrationSettings
          csrfToken={csrfToken}
          canWrite={permissions.includes("devices:create")}
        />
      </section>

      <section className="panel settings-panel mcp-guide">
        <div className="settings-section-heading">
          <Network size={20} />
          <div>
            <h2>{t("integrations.connectTitle")}</h2>
            <span>{t("integrations.connectDescription")}</span>
          </div>
        </div>
        <ol>
          <li>{t("integrations.connectToken")}</li>
          <li>{t("integrations.connectGateway")}</li>
          <li>{t("integrations.connectClient")}</li>
        </ol>
        <p>{t("integrations.truenasHint")}</p>
        <a
          className="secondary-action mcp-guide-link"
          href="https://github.com/WhiteAssassins/AE-NetScope/blob/main/docs/mcp.md"
          rel="noreferrer"
          target="_blank"
        >
          {t("integrations.openGuide")}
          <ExternalLink size={16} />
        </a>
      </section>
    </>
  );
}
