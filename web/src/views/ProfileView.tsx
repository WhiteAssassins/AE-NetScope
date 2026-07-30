import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { User } from "../types";
import { roleLabel } from "../utils";

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
  const { t } = useTranslation();
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
            ? t("profile.emailConflict")
            : t("profile.emailChangeFailed"),
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onUserChanged(data.user);
      setEmail(data.user.email);
      setEmailPassword("");
      setEmailMessage(t("profile.emailChanged"));
    } catch {
      setEmailError(t("auth.apiUnavailable"));
    } finally {
      setIsEmailSaving(false);
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("profile.title")}</h1>
          <p>{t("profile.description")}</p>
        </div>
        <button className="primary-action" onClick={onChangePassword}>
          <KeyRound size={18} strokeWidth={2} />
          {t("profile.changePassword")}
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
            <span className="mini-pill blue">{roleLabel(user.role, t)}</span>
            <span className="mini-pill green">
              {t("profile.permissionCount", { count: user.permissions.length })}
            </span>
          </div>
        </article>

        <article className="panel profile-card">
          <Mail size={30} strokeWidth={1.8} />
          <div>
            <h2>{t("profile.accountEmail")}</h2>
            <p>{t("profile.accountEmailDescription")}</p>
          </div>
          <form className="account-settings-form" onSubmit={saveEmail}>
            <input
              aria-label={t("profile.newEmail")}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <input
              aria-label={t("profile.currentPasswordForEmail")}
              autoComplete="current-password"
              onChange={(event) => setEmailPassword(event.target.value)}
              placeholder={t("changePassword.currentPassword")}
              required
              type="password"
              value={emailPassword}
            />
            <button className="user-action" disabled={isEmailSaving} type="submit">
              {isEmailSaving ? t("common.saving") : t("profile.changeEmail")}
            </button>
            {emailMessage && <p className="form-success">{emailMessage}</p>}
            {emailError && <p className="login-error">{emailError}</p>}
          </form>
        </article>
      </section>

      <section className="panel permissions-panel">
        <div className="permissions-table">
          <div className="permissions-row permissions-head">
            <strong>{t("profile.activePermissions")}</strong>
            <strong>{t("profile.status")}</strong>
          </div>
          {user.permissions.map((permission) => (
            <div className="permissions-row" key={permission}>
              <span>{permission}</span>
              <span className="mini-pill green">{t("profile.allowed")}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
