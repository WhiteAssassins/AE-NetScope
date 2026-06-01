import { Code2, Globe, Mail, ShieldQuestion } from "lucide-react";

export default function SupportView() {
  return (
    <>
      <div className="page-title">
        <h1>Soporte</h1>
        <p>Canales oficiales para ayuda, contacto y seguimiento del proyecto.</p>
      </div>

      <section className="support-grid">
        <article className="panel support-card">
          <Mail size={28} strokeWidth={1.8} />
          <div>
            <h2>Contacto principal</h2>
            <p>Para soporte general, dudas de uso o reportes del proyecto.</p>
          </div>
          <a className="primary-action" href="mailto:contacto@aewhitedevs.com">
            contacto@aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <ShieldQuestion size={28} strokeWidth={1.8} />
          <div>
            <h2>Administración</h2>
            <p>Canal para temas administrativos, seguridad o coordinación del proyecto.</p>
          </div>
          <a className="primary-action" href="mailto:admin@aewhitedevs.com">
            admin@aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <Globe size={28} strokeWidth={1.8} />
          <div>
            <h2>AE White Devs</h2>
            <p>Sitio oficial de la empresa detrás de AE NetScope.</p>
          </div>
          <a className="user-action support-link" href="https://aewhitedevs.com" target="_blank" rel="noreferrer">
            aewhitedevs.com
          </a>
        </article>

        <article className="panel support-card">
          <Code2 size={28} strokeWidth={1.8} />
          <div>
            <h2>GitHub</h2>
            <p>Repositorio público, issues, releases y seguimiento técnico.</p>
          </div>
          <a
            className="user-action support-link"
            href="https://github.com/WhiteAssassins"
            target="_blank"
            rel="noreferrer"
          >
            github.com/WhiteAssassins
          </a>
        </article>
      </section>
    </>
  );
}
