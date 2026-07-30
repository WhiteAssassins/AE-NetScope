import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  InventoryQualityIssue,
  InventoryQualityReport,
  InventoryQualitySeverity,
} from "../types";

type QualityViewProps = {
  quality: InventoryQualityReport | null;
  onOpenIssue: (issue: InventoryQualityIssue) => void;
  onRefresh: () => Promise<void>;
};

type SeverityFilter = "all" | InventoryQualitySeverity;

const severityIcons = {
  critical: CircleAlert,
  warning: AlertTriangle,
  info: ShieldCheck,
};

export default function QualityView({ quality, onOpenIssue, onRefresh }: QualityViewProps) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const filteredIssues = useMemo(
    () => quality?.issues.filter((issue) => severity === "all" || issue.severity === severity) ?? [],
    [quality, severity],
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (!quality) {
    return (
      <>
        <PageTitle refreshing={refreshing} onRefresh={refresh} />
        <section className="panel quality-unavailable">
          <CircleAlert size={24} />
          <div>
            <h2>{t("quality.unavailableTitle")}</h2>
            <p>{t("quality.unavailableDescription")}</p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageTitle refreshing={refreshing} onRefresh={refresh} />

      <section className={`quality-overview quality-${quality.status}`}>
        <div className="quality-score" aria-label={t("quality.scoreLabel", { score: quality.score })}>
          <strong>{quality.score}</strong>
          <span>/ 100</span>
        </div>
        <div className="quality-overview-copy">
          <span className="quality-status">{t(`quality.status.${quality.status}`)}</span>
          <h2>{t("quality.overviewTitle")}</h2>
          <p>
            {t("quality.overviewDescription", {
              passed: quality.checks_passed,
              total: quality.checks_completed,
              records: quality.records_reviewed,
            })}
          </p>
          <meter max={100} min={0} value={quality.score} />
        </div>
      </section>

      <section className="quality-summary-grid" aria-label={t("quality.issueSummary")}>
        <SummaryItem
          count={quality.issue_counts.critical}
          label={t("quality.severity.critical")}
          tone="critical"
        />
        <SummaryItem
          count={quality.issue_counts.warning}
          label={t("quality.severity.warning")}
          tone="warning"
        />
        <SummaryItem
          count={quality.issue_counts.info}
          label={t("quality.severity.info")}
          tone="info"
        />
        <SummaryItem
          count={quality.issues_total}
          label={t("quality.totalIssues")}
          tone="total"
        />
      </section>

      <section className="quality-layout">
        <article className="panel quality-issues-panel">
          <div className="quality-panel-head">
            <div>
              <h2>{t("quality.findingsTitle")}</h2>
              <p>{t("quality.findingsDescription")}</p>
            </div>
            <div className="quality-filters" aria-label={t("quality.filterLabel")}>
              {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((filter) => (
                <button
                  aria-pressed={severity === filter}
                  className={severity === filter ? "active" : ""}
                  key={filter}
                  onClick={() => setSeverity(filter)}
                  type="button"
                >
                  {t(`quality.filters.${filter}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="quality-issue-list">
            {filteredIssues.length ? (
              filteredIssues.map((issue, index) => {
                const Icon = severityIcons[issue.severity];
                return (
                  <button
                    className={`quality-issue quality-issue-${issue.severity}`}
                    key={`${issue.code}-${issue.resource_type}-${issue.resource_id}-${index}`}
                    onClick={() => onOpenIssue(issue)}
                    type="button"
                  >
                    <span className="quality-issue-icon">
                      <Icon size={18} strokeWidth={1.9} />
                    </span>
                    <span className="quality-issue-copy">
                      <strong>{issue.resource_name}</strong>
                      <span>{issueMessage(t, issue)}</span>
                    </span>
                    <span className={`quality-severity severity-${issue.severity}`}>
                      {t(`quality.severity.${issue.severity}`)}
                    </span>
                    <ArrowUpRight aria-hidden="true" size={17} />
                  </button>
                );
              })
            ) : (
              <div className="quality-empty">
                <CheckCircle2 size={26} strokeWidth={1.8} />
                <strong>{t("quality.noIssuesTitle")}</strong>
                <span>{t("quality.noIssuesDescription")}</span>
              </div>
            )}
          </div>
          {quality.issues_truncated && (
            <p className="quality-truncated">{t("quality.truncated")}</p>
          )}
        </article>

        <aside className="panel quality-relations-panel">
          <div className="quality-panel-head">
            <div>
              <h2>{t("quality.relationshipsTitle")}</h2>
              <p>{t("quality.relationshipsDescription")}</p>
            </div>
            <Link2 size={21} strokeWidth={1.8} />
          </div>
          <div className="quality-relation-list">
            {Object.entries(quality.relationships).map(([key, value]) => (
              <div key={key}>
                <span>{t(`quality.relationships.${key}`)}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}

function PageTitle({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="page-title page-title-row">
      <div>
        <h1>{t("quality.title")}</h1>
        <p>{t("quality.description")}</p>
      </div>
      <button className="primary-action" disabled={refreshing} onClick={onRefresh} type="button">
        <RefreshCw className={refreshing ? "spin" : ""} size={18} strokeWidth={2} />
        {refreshing ? t("quality.refreshing") : t("quality.refresh")}
      </button>
    </div>
  );
}

function SummaryItem({ count, label, tone }: { count: number; label: string; tone: string }) {
  return (
    <article className={`quality-summary quality-summary-${tone}`}>
      <strong>{count}</strong>
      <span>{label}</span>
    </article>
  );
}

function issueMessage(
  t: ReturnType<typeof useTranslation>["t"],
  issue: InventoryQualityIssue,
) {
  const context = { ...issue.context };
  if (issue.code === "device_missing_documentation" && typeof context.fields === "string") {
    context.fields = context.fields
      .split(", ")
      .map((field) => t(`quality.fields.${field}`))
      .join(", ");
  }
  return t(`quality.issueMessages.${issue.code}`, context);
}
