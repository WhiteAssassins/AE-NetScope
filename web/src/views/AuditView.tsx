import { Clock3, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const eventGroups = ["all", "auth", "users", "inventory", "settings", "integration"] as const;

export default function AuditView({ initialQuery, permissions }: AuditViewProps) {
  const { i18n, t } = useTranslation();
  const canReadAudit = hasPermission(permissions, "audit:read");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [eventGroup, setEventGroup] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(canReadAudit);

  const loadEvents = useCallback(async (serverQuery = "", group = "all") => {
    async function fetchEvents(params: Record<string, string>) {
      const search = new URLSearchParams({ limit: "150", ...params });
      const response = await fetch(`${API_BASE_URL}/audit/events?${search}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("audit");
      }
      return (await response.json()) as AuditEvent[];
    }

    setIsLoading(true);
    setError("");
    try {
      const groupParams: Record<string, string> = group === "all" ? {} : { group };
      // Stored messages are English, so a translated search also needs the recent
      // events, which are matched below against their translated text.
      const [recent, matches] = await Promise.all([
        fetchEvents(groupParams),
        serverQuery ? fetchEvents({ ...groupParams, q: serverQuery }) : Promise.resolve([]),
      ]);
      const merged = new Map([...recent, ...matches].map((event) => [event.id, event]));
      setEvents(
        [...merged.values()].sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime() ||
            right.id - left.id,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const serverQuery = query.trim();
  useEffect(() => {
    if (!canReadAudit) {
      return undefined;
    }
    // Searching and grouping reach older events through the API, not only the latest
    // page that is already loaded.
    const timer = window.setTimeout(() => {
      loadEvents(serverQuery, eventGroup).catch(() => setError(t("audit.loadError")));
    }, serverQuery ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [canReadAudit, eventGroup, loadEvents, serverQuery, t]);

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
        <button className="primary-action" onClick={() =>
            loadEvents(serverQuery, eventGroup).catch(() => setError(t("audit.loadError")))
          }>
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
