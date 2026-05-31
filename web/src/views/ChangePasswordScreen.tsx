import { Network } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { User } from "../types";
export default function ChangePasswordScreen({
  csrfToken,
  onPasswordChanged,
}: {
  csrfToken: string;
  onPasswordChanged: (user: User) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 403
            ? "La sesion expiro. Inicia sesion nuevamente."
            : "No se pudo cambiar la contrasena.",
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onPasswordChanged(data.user);
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">
            <Network size={31} strokeWidth={1.8} />
          </span>
          <strong>AE NetScope</strong>
        </div>
        <div className="login-copy">
          <h1>Cambia tu contrasena</h1>
          <p>Debes reemplazar la contrasena inicial antes de entrar al panel.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Contraseña actual
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            Nueva contrasena
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label>
            Confirmar contrasena
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Guardando..." : "Actualizar contrasena"}
          </button>
        </form>
      </section>
    </main>
  );
}

