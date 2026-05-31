import { Clock3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../api";
import type { AuditEvent } from "../types";
import { hasPermission } from "../utils";

type AuditViewProps = {
  permissions: string[];
};

const eventGroups = [
  { value: "all", label: "Todos" },
  { value: "auth", label: "Auth" },
  { value: "users", label: "Usuarios" },
  { value: "inventory", label: "Inventario" },
];

export default function AuditView({ permissions }: AuditViewProps) {
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
    loadEvents().catch(() => setError("No se pudo cargar el historial de cambios."));
  }, [canReadAudit]);

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
        event.actor_email,
        event.actor_username,
        event.ip_address,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [events, eventGroup, query]);

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
        <h1>Cambios</h1>
        <p>No tienes permisos para ver el historial de auditoría.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Cambios</h1>
          <p>Historial de auditoría de sesiones, usuarios e inventario.</p>
        </div>
        <button className="primary-action" onClick={() => loadEvents().catch(() => undefined)}>
          <Clock3 size={18} strokeWidth={2} />
          Actualizar
        </button>
      </div>

      <section className="panel">
        <div className="device-toolbar">
          <label className="inline-search">
            <Search size={18} strokeWidth={1.8} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por evento, usuario, IP o mensaje..."
              value={query}
            />
          </label>
          <select
            className="filter-select"
            onChange={(event) => setEventGroup(event.target.value)}
            value={eventGroup}
          >
            {eventGroups.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </select>
          <span>{filteredEvents.length} eventos</span>
        </div>

        {error && <p className="login-error">{error}</p>}
        {isLoading ? (
          <p className="muted-line">Cargando historial...</p>
        ) : (
          <div className="audit-list">
            {filteredEvents.map((event) => (
              <article className="audit-row" key={event.id}>
                <div className={`audit-dot ${event.event_type.split(".")[0]}`} />
                <div>
                  <strong>{event.message}</strong>
                  <span>{event.event_type}</span>
                </div>
                <div>
                  <p>{event.actor_email ?? "Sistema"}</p>
                  <small>{event.ip_address ?? "Sin IP"}</small>
                </div>
                <time>{new Date(event.created_at).toLocaleString()}</time>
              </article>
            ))}
            {!filteredEvents.length && <p className="muted-line">No hay eventos para mostrar.</p>}
          </div>
        )}
      </section>
    </>
  );
}
