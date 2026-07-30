import { Network } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { User } from "../types";

export default function ChangePasswordScreen({
  csrfToken,
  onPasswordChanged,
}: {
  csrfToken: string;
  onPasswordChanged: (user: User) => void;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("changePassword.passwordMismatch"));
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
            ? t("auth.sessionExpired")
            : t("changePassword.changeFailed"),
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onPasswordChanged(data.user);
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
          <strong>AE NetScope</strong>
        </div>
        <div className="login-copy">
          <h1>{t("changePassword.title")}</h1>
          <p>{t("changePassword.description")}</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t("changePassword.currentPassword")}
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            {t("changePassword.newPassword")}
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
            {t("changePassword.confirmPassword")}
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
            {isSubmitting ? t("common.saving") : t("changePassword.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
