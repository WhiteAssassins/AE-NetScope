import { Clock3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import { auditEventMessage } from "../auditMessages";
import { formatDateTime } from "../dateTime";
import type { AuditEvent } from "../types";
import { hasPermission } from "../utils";

type AuditViewProps = {
  initialQuery?: string;
  permissions: string[];
};

const eventGroups = ["all", "auth", "users", "inventory"] as const;

export default function AuditView({ initialQuery, permissions }: AuditViewProps) {
  const { i18n, t } = useTranslation();
  const canReadAudit = hasPermission(permissions, "audit:read");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [eventGroup, setEventGroup] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(canReadAudit);

  useEffect(() => {
    if (!canReadAudit) {
      return;
    }
    loadEvents().catch(() => setError(t("audit.loadError")));
  }, [canReadAudit, t]);

  useEffect(() => {
    if (initialQuery) {
      queueMicrotask(() => setQuery(initialQuery));
    }
  }, [initialQuery]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesGroup = eventGroup === "all" || event.event_type.startsWith(`${eventGroup}.`);
      if (!matchesGroup) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        event.event_type,
        event.message,
        auditEventMessage(event, t),
        event.actor_email,
        event.actor_username,
        event.ip_address,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [events, eventGroup, query, t]);

  async function loadEvents() {
    setIsLoading(true);
    setError("");
    const response = await fetch(`${API_BASE_URL}/audit/events?limit=150`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("audit");
    }
    setEvents((await response.json()) as AuditEvent[]);
    setIsLoading(false);
  }

  if (!canReadAudit) {
    return (
      <div className="page-title">
        <h1>{t("audit.title")}</h1>
        <p>{t("audit.forbidden")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("audit.title")}</h1>
          <p>{t("audit.description")}</p>
        </div>
        <button className="primary-action" onClick={() => loadEvents().catch(() => undefined)}>
          <Clock3 size={18} strokeWidth={2} />
          {t("audit.refresh")}
        </button>
      </div>

      <section className="panel">
        <div className="device-toolbar">
          <label className="inline-search">
            <Search size={18} strokeWidth={1.8} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("audit.searchPlaceholder")}
              value={query}
            />
          </label>
          <select
            className="filter-select"
            onChange={(event) => setEventGroup(event.target.value)}
            value={eventGroup}
          >
            {eventGroups.map((group) => (
              <option key={group} value={group}>
                {t(`audit.groups.${group}`)}
              </option>
            ))}
          </select>
          <span>{t("audit.eventCount", { count: filteredEvents.length })}</span>
        </div>

        {error && <p className="login-error">{error}</p>}
        {isLoading ? (
          <p className="muted-line">{t("audit.loading")}</p>
        ) : (
          <div className="audit-list">
            {filteredEvents.map((event) => (
              <article className="audit-row" key={event.id}>
                <div className={`audit-dot ${event.event_type.split(".")[0]}`} />
                <div>
                  <strong>{auditEventMessage(event, t)}</strong>
                  <span>{event.event_type}</span>
                </div>
                <div>
                  <p>{event.actor_email ?? t("common.system")}</p>
                  <small>{event.ip_address ?? t("audit.withoutIp")}</small>
                </div>
                <time>{formatDateTime(event.created_at, i18n.resolvedLanguage)}</time>
              </article>
            ))}
            {!filteredEvents.length && <p className="muted-line">{t("audit.empty")}</p>}
          </div>
        )}
      </section>
    </>
  );
}
