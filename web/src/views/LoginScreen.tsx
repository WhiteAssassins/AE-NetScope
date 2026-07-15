import { Network } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { User } from "../types";

export default function LoginScreen({
  message,
  onLogin,
}: {
  message?: string;
  onLogin: (user: User, csrfToken: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(response.status === 423 ? t("auth.locked") : t("auth.invalidCredentials"));
        return;
      }

      const data = (await response.json()) as { user: User; csrf_token: string };
      onLogin(data.user, data.csrf_token);
    } catch {
      setError(t("auth.apiUnavailable"));
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
          <strong>{t("common.appName")}</strong>
        </div>
        <div className="login-copy">
          <h1>{t("auth.secureAccess")}</h1>
          <p>{t("auth.loginDescription")}</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t("auth.email")}
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            {t("auth.password")}
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {message && <p className="login-notice">{message}</p>}
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("auth.verifying") : t("auth.signIn")}
          </button>
        </form>
      </section>
    </main>
  );
}
