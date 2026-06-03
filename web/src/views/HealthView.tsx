import { Activity, Database, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchHealthStatus } from "../api";
import type { HealthStatus } from "../types";

const checkIcons = {
  api: Server,
  database: Database,
  redis: Activity,
};

export default function HealthView() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refreshHealth() {
    setIsLoading(true);
    setError("");
    try {
      setHealth(await fetchHealthStatus());
    } catch {
      setError("No se pudo leer el estado del sistema.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialHealth() {
      try {
        const nextHealth = await fetchHealthStatus();
        if (isMounted) {
          setHealth(nextHealth);
        }
      } catch {
        if (isMounted) {
          setError("No se pudo leer el estado del sistema.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialHealth().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const checks = health ? Object.entries(health.checks) : [];

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Estado del sistema</h1>
          <p>Salud operativa de AE NetScope, versión instalada, base de datos y Redis.</p>
        </div>
        <button className="primary-action" disabled={isLoading} onClick={() => refreshHealth().catch(() => undefined)}>
          <RefreshCw size={18} strokeWidth={2} />
          {isLoading ? "Comprobando..." : "Actualizar"}
        </button>
      </div>

      <section className="ip-summary-grid" aria-label="Resumen del estado del sistema">
        <article className={`mini-stat ${health?.status === "ready" ? "green" : "orange"}`}>
          <strong>{health?.status === "ready" ? "Ready" : "Degraded"}</strong>
          <span>Estado general</span>
        </article>
        <article className="mini-stat">
          <strong>{health ? `v${health.version}` : "-"}</strong>
          <span>Versión instalada</span>
        </article>
        <article className="mini-stat gray">
          <strong>{health?.environment ?? "-"}</strong>
          <span>Entorno</span>
        </article>
        <article className="mini-stat gray">
          <strong>{health?.release_channel ?? "-"}</strong>
          <span>Canal</span>
        </article>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="health-grid">
        {checks.map(([name, check]) => {
          const Icon = checkIcons[name as keyof typeof checkIcons] ?? ShieldCheck;
          return (
            <article className="panel health-card" key={name}>
              <div className="health-card-head">
                <span className={`health-icon ${check.status === "ok" ? "green" : "orange"}`}>
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <span className={`mini-pill ${check.status === "ok" ? "green" : "orange"}`}>
                  {check.status === "ok" ? "OK" : "Error"}
                </span>
              </div>
              <div>
                <h2>{checkLabel(name)}</h2>
                <p>{check.message}</p>
              </div>
              <span className="muted-line">{check.required ? "Requerido" : "Opcional"}</span>
            </article>
          );
        })}
      </section>

      <section className="panel health-details">
        <h2>Detalles</h2>
        <dl>
          <div>
            <dt>Servicio</dt>
            <dd>{health?.service ?? "-"}</dd>
          </div>
          <div>
            <dt>Última comprobación</dt>
            <dd>{health ? new Date(health.checked_at).toLocaleString() : "-"}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd>/api/health/status</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function checkLabel(name: string) {
  if (name === "api") return "API";
  if (name === "database") return "Base de datos";
  if (name === "redis") return "Redis";
  return name;
}
