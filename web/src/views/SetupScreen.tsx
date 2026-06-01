import { Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { User } from "../types";

type SetupScreenProps = {
  onSetupComplete: (user: User, csrfToken: string) => void;
};

export default function SetupScreen({ onSetupComplete }: SetupScreenProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });

      if (!response.ok) {
        setError(
          response.status === 409
            ? "El primer usuario administrador ya fue creado."
            : "No se pudo completar la configuración inicial.",
        );
        return;
      }

      const data = (await response.json()) as { user: User; csrf_token: string };
      onSetupComplete(data.user, data.csrf_token);
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel setup-panel">
        <div className="login-brand">
          <span className="brand-mark">
            <Network size={31} strokeWidth={1.8} />
          </span>
          <strong>AE NetScope</strong>
        </div>
        <div className="login-copy">
          <h1>Primer setup</h1>
          <p>Crea el administrador inicial para proteger esta instalación.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo del admin
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Usuario
            <input
              autoComplete="nickname"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          <p className="setup-note">
            <ShieldCheck size={17} strokeWidth={1.9} />
            Este flujo solo está disponible cuando no existe ningún usuario.
          </p>
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creando..." : "Crear administrador"}
          </button>
        </form>
      </section>
    </main>
  );
}
