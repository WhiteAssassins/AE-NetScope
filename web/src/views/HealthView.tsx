import {
  Activity,
  Clock3,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL, fetchHealthStatus } from "../api";
import type { HealthCheckStatus, HealthStatus } from "../types";

const AUTO_REFRESH_INTERVAL_MS = 30_000;

const checkIcons = {
  api: Server,
  database: Database,
  redis: Activity,
};

export default function HealthView() {
  const { i18n, t } = useTranslation();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const requestIdRef = useRef(0);

  const refreshHealth = useCallback(
    async (showLoading = true) => {
      const requestId = ++requestIdRef.current;
      if (showLoading) {
        setIsLoading(true);
      }
      setError("");

      try {
        const nextHealth = await fetchHealthStatus();
        if (requestId === requestIdRef.current) {
          setHealth(nextHealth);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setError(t("health.loadError"));
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void refreshHealth(), 0);
    return () => {
      window.clearTimeout(initialLoadId);
      requestIdRef.current += 1;
    };
  }, [refreshHealth]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      void refreshHealth(false);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, refreshHealth]);

  const checks = health ? Object.entries(health.checks) : [];
  const healthyChecks = checks.filter(([, check]) => check.status === "ok").length;
  const isReady = health?.status === "ready";

  return (
    <>
      <div className="page-title page-title-row health-page-title">
        <div>
          <h1>{t("health.title")}</h1>
          <p>{t("health.description")}</p>
        </div>
        <div className="health-actions">
          <label className="health-auto-refresh">
            <input
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{t("health.autoRefresh")}</strong>
              <small>{t("health.autoRefreshHint")}</small>
            </span>
          </label>
          <button
            className="primary-action"
            disabled={isLoading}
            onClick={() => void refreshHealth()}
          >
            <RefreshCw
              className={isLoading ? "health-refresh-spinning" : undefined}
              size={18}
              strokeWidth={2}
            />
            {isLoading ? t("health.checking") : t("health.refresh")}
          </button>
        </div>
      </div>

      <section
        aria-label={t("health.overallStatus")}
        aria-live="polite"
        className="health-summary-grid"
      >
        <article
          className={`health-summary-item ${health ? (isReady ? "green" : "orange") : ""}`}
        >
          <ShieldCheck size={21} strokeWidth={1.9} />
          <div>
            <strong>{health ? (isReady ? t("health.ready") : t("health.degraded")) : "-"}</strong>
            <span>{t("health.overallStatus")}</span>
          </div>
        </article>
        <article className="health-summary-item">
          <Activity size={21} strokeWidth={1.9} />
          <div>
            <strong>
              {health
                ? t("health.healthyValue", { healthy: healthyChecks, total: checks.length })
                : "-"}
            </strong>
            <span>{t("health.healthyChecks")}</span>
          </div>
        </article>
        <article className="health-summary-item">
          <Timer size={21} strokeWidth={1.9} />
          <div>
            <strong>{formatLatency(health?.duration_ms, t)}</strong>
            <span>{t("health.checkDuration")}</span>
          </div>
        </article>
        <article className="health-summary-item">
          <Clock3 size={21} strokeWidth={1.9} />
          <div>
            <strong>{formatCheckedAt(health?.checked_at, i18n.resolvedLanguage)}</strong>
            <span>{t("health.lastCheck")}</span>
          </div>
        </article>
      </section>

      {error && (
        <section className="health-error-panel" role="alert">
          <div>
            <strong>{t("health.degraded")}</strong>
            <span>{error}</span>
          </div>
          <button className="user-action" onClick={() => void refreshHealth()}>
            <RefreshCw size={16} strokeWidth={2} />
            {t("health.retry")}
          </button>
        </section>
      )}

      <section className="health-grid">
        {checks.map(([name, check]) => {
          const Icon = checkIcons[name as keyof typeof checkIcons] ?? ShieldCheck;
          const checkOk = check.status === "ok";
          return (
            <article className={`panel health-card ${checkOk ? "" : "has-error"}`} key={name}>
              <div className="health-card-head">
                <span className={`health-icon ${checkOk ? "green" : "orange"}`}>
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <span className={`mini-pill ${checkOk ? "green" : "orange"}`}>
                  {checkOk ? t("health.ok") : t("health.error")}
                </span>
              </div>
              <div className="health-card-copy">
                <h2>{checkLabel(name, t)}</h2>
                <p>{checkMessage(check, t)}</p>
              </div>
              <div className="health-card-meta">
                <span>{check.required ? t("health.required") : t("health.optional")}</span>
                <span>
                  {t("health.latency")}: <strong>{formatLatency(check.latency_ms, t)}</strong>
                </span>
              </div>
            </article>
          );
        })}
        {!isLoading && !checks.length && (
          <div className="panel health-empty">{t("health.noChecks")}</div>
        )}
      </section>

      <section className="panel health-details">
        <h2>{t("health.details")}</h2>
        <dl>
          <div>
            <dt>{t("health.service")}</dt>
            <dd>{health?.service ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("health.version")}</dt>
            <dd>{health ? `v${health.version}` : "-"}</dd>
          </div>
          <div>
            <dt>{t("health.environment")}</dt>
            <dd>{health?.environment ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("health.channel")}</dt>
            <dd>{health?.release_channel ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("health.statusEndpoint")}</dt>
            <dd>
              <a
                className="health-endpoint"
                href={`${API_BASE_URL}/health/status`}
                rel="noreferrer"
                target="_blank"
              >
                /api/health/status
              </a>
            </dd>
          </div>
          <div>
            <dt>{t("health.readinessEndpoint")}</dt>
            <dd>
              <a
                className="health-endpoint"
                href={`${API_BASE_URL}/health/ready`}
                rel="noreferrer"
                target="_blank"
              >
                /api/health/ready
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function checkLabel(name: string, t: TFunction) {
  const key = `health.checkLabels.${name}`;
  return t(key, { defaultValue: name });
}

function checkMessage(check: HealthCheckStatus, t: TFunction) {
  return check.message_code
    ? t(check.message_code, { defaultValue: check.message })
    : check.message;
}

function formatLatency(value: number | null | undefined, t: TFunction) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (value < 1) {
    return t("health.lessThanMillisecond");
  }
  return t("health.milliseconds", { value: Math.round(value * 10) / 10 });
}

function formatCheckedAt(value: string | undefined, language: string | undefined) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
