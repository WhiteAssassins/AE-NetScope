import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { User } from "../types";

type ProfileViewProps = {
  csrfToken: string;
  onChangePassword: () => void;
  onUserChanged: (user: User) => void;
  user: User;
};

export default function ProfileView({
  csrfToken,
  onChangePassword,
  onUserChanged,
  user,
}: ProfileViewProps) {
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isEmailSaving, setIsEmailSaving] = useState(false);

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailMessage("");
    setEmailError("");
    setIsEmailSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ current_password: emailPassword, new_email: email }),
      });

      if (!response.ok) {
        setEmailError(
          response.status === 409
            ? "Ese correo ya esta en uso."
            : "No se pudo cambiar el correo. Verifica tu contrasena.",
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onUserChanged(data.user);
      setEmail(data.user.email);
      setEmailPassword("");
      setEmailMessage("Correo actualizado correctamente.");
    } catch {
      setEmailError("No se pudo conectar con la API.");
    } finally {
      setIsEmailSaving(false);
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Perfil</h1>
          <p>Cuenta, correo, contrasena y permisos activos.</p>
        </div>
        <button className="primary-action" onClick={onChangePassword}>
          <KeyRound size={18} strokeWidth={2} />
          Cambiar contrasena
        </button>
      </div>

      <section className="profile-grid">
        <article className="panel profile-card">
          <ShieldCheck size={30} strokeWidth={1.8} />
          <div>
            <h2>{user.username}</h2>
            <p>{user.email}</p>
          </div>
          <div className="profile-meta">
            <span className="mini-pill blue">{user.role}</span>
            <span className="mini-pill green">{user.permissions.length} permisos</span>
          </div>
        </article>

        <article className="panel profile-card">
          <Mail size={30} strokeWidth={1.8} />
          <div>
            <h2>Correo de la cuenta</h2>
            <p>Cambia el correo con el que inicias sesion. Requiere tu contrasena actual.</p>
          </div>
          <form className="account-settings-form" onSubmit={saveEmail}>
            <input
              aria-label="Nuevo correo"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <input
              aria-label="Contrasena actual para cambiar correo"
              autoComplete="current-password"
              onChange={(event) => setEmailPassword(event.target.value)}
              placeholder="Contrasena actual"
              required
              type="password"
              value={emailPassword}
            />
            <button className="user-action" disabled={isEmailSaving} type="submit">
              {isEmailSaving ? "Guardando..." : "Cambiar correo"}
            </button>
            {emailMessage && <p className="form-success">{emailMessage}</p>}
            {emailError && <p className="login-error">{emailError}</p>}
          </form>
        </article>
      </section>

      <section className="panel permissions-panel">
        <div className="permissions-table">
          <div className="permissions-row permissions-head">
            <strong>Permisos activos</strong>
            <strong>Estado</strong>
          </div>
          {user.permissions.map((permission) => (
            <div className="permissions-row" key={permission}>
              <span>{permission}</span>
              <span className="mini-pill green">Permitido</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
