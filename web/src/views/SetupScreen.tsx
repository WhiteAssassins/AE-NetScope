import { Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { User } from "../types";

type SetupScreenProps = {
  onSetupComplete: (user: User, csrfToken: string) => void;
  tokenRequired?: boolean;
};

export default function SetupScreen({ onSetupComplete, tokenRequired = false }: SetupScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("setup.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
          setup_token: setupToken || null,
        }),
      });

      if (!response.ok) {
        setError(response.status === 409 ? t("setup.alreadyCompleted") : t("setup.failed"));
        return;
      }

      const data = (await response.json()) as { user: User; csrf_token: string };
      onSetupComplete(data.user, data.csrf_token);
    } catch {
      setError(t("auth.apiUnavailable"));
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
          <strong>{t("common.appName")}</strong>
        </div>
        <div className="login-copy">
          <h1>{t("setup.title")}</h1>
          <p>{t("setup.description")}</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {tokenRequired && (
            <label>
              {t("setup.setupToken")}
              <input
                autoComplete="one-time-code"
                minLength={16}
                onChange={(event) => setSetupToken(event.target.value)}
                required
                type="password"
                value={setupToken}
              />
            </label>
          )}
          <label>
            {t("setup.adminEmail")}
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            {t("setup.username")}
            <input
              autoComplete="nickname"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            {t("auth.password")}
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
            {t("setup.confirmPassword")}
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
            {t("setup.restrictedNotice")}
          </p>
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("setup.creating") : t("setup.createAdministrator")}
          </button>
        </form>
      </section>
    </main>
  );
}
