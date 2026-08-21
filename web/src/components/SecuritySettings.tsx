import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  beginPasskeyRegistration,
  beginTotpSetup,
  confirmTotp,
  deletePasskey,
  disableTotp,
  fetchOwnSessions,
  fetchPasskeyCapability,
  fetchPasskeys,
  revokeOtherSessions,
  verifyPasskeyRegistration,
} from "../api";
import { formatDateTime } from "../dateTime";
import type { OwnSession, PasskeyCapability, PasskeyCredential, User } from "../types";
import { credentialToJson, registrationOptionsFromJson } from "../webauthn";

type Props = {
  csrfToken: string;
  onUserChanged: (user: User) => void;
  user: User;
};

function sessionDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown browser";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Firefox/")
    ? "Firefox" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/")
      ? "Safari" : "Browser";
  const os = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Android")
    ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : userAgent.includes("Mac OS")
      ? "macOS" : userAgent.includes("Linux") ? "Linux" : "Unknown OS";
  return `${browser} · ${os}`;
}

export default function SecuritySettings({ csrfToken, onUserChanged, user }: Props) {
  const { i18n, t } = useTranslation();
  const [sessions, setSessions] = useState<OwnSession[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [capability, setCapability] = useState<PasskeyCapability | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [passkeyName, setPasskeyName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [nextSessions, nextCapability, nextPasskeys] = await Promise.all([
      fetchOwnSessions(),
      fetchPasskeyCapability(),
      fetchPasskeys(),
    ]);
    setSessions(nextSessions);
    setCapability(nextCapability);
    setPasskeys(nextPasskeys);
  }

  useEffect(() => {
    void Promise.all([fetchOwnSessions(), fetchPasskeyCapability(), fetchPasskeys()])
      .then(([nextSessions, nextCapability, nextPasskeys]) => {
        setSessions(nextSessions);
        setCapability(nextCapability);
        setPasskeys(nextPasskeys);
      })
      .catch(() => setError(t("settings.security.loadFailed")));
  }, [t]);

  async function closeOtherSessions() {
    setError("");
    await revokeOtherSessions(csrfToken);
    await refresh();
    setMessage(t("settings.security.sessionsClosed"));
  }

  async function startTotp() {
    setError("");
    try {
      setTotpSetup(await beginTotpSetup(password, csrfToken));
      setPassword("");
    } catch {
      setError(t("settings.security.actionFailed"));
    }
  }

  async function finishTotp() {
    try {
      const result = await confirmTotp(code, csrfToken);
      onUserChanged(result.user);
      setTotpSetup(null);
      setCode("");
      setMessage(t("settings.security.totpEnabled"));
    } catch {
      setError(t("settings.security.actionFailed"));
    }
  }

  async function removeTotp() {
    try {
      const result = await disableTotp(password, code, csrfToken);
      onUserChanged(result.user);
      setPassword("");
      setCode("");
      setMessage(t("settings.security.totpDisabled"));
    } catch {
      setError(t("settings.security.actionFailed"));
    }
  }

  async function registerPasskey() {
    setError("");
    if (!navigator.credentials?.create) {
      setError(t("settings.security.passkeyUnsupported"));
      return;
    }
    try {
      const begin = await beginPasskeyRegistration(password, csrfToken);
      const credential = await navigator.credentials.create({
        publicKey: registrationOptionsFromJson(begin.options),
      });
      if (!(credential instanceof PublicKeyCredential)) return;
      await verifyPasskeyRegistration(
        begin.challenge_id,
        passkeyName || t("settings.security.defaultPasskeyName"),
        credentialToJson(credential),
        csrfToken,
      );
      setPassword("");
      setPasskeyName("");
      await refresh();
      setMessage(t("settings.security.passkeyAdded"));
    } catch {
      setError(t("settings.security.actionFailed"));
    }
  }

  async function removePasskey(credentialId: number) {
    if (!password) {
      setError(t("settings.security.passwordRequiredForPasskeyRemoval"));
      return;
    }
    try {
      await deletePasskey(credentialId, password, csrfToken);
      setPassword("");
      await refresh();
      setMessage(t("settings.security.passkeyRemoved"));
    } catch {
      setError(t("settings.security.actionFailed"));
    }
  }

  return (
    <>
      <div className="settings-section-heading">
        <ShieldCheck size={20} />
        <div><h2>{t("settings.sections.security")}</h2><span>{t("settings.sections.securityDescription")}</span></div>
      </div>

      <div className="settings-block">
        <div className="settings-block-title"><Laptop size={18} /><strong>{t("settings.security.sessions")}</strong></div>
        <div className="security-session-list">
          {sessions.map((session) => (
            <div className="security-session-row" key={session.id}>
              <Smartphone size={18} />
              <div>
                <strong>{sessionDevice(session.user_agent)} {session.is_current && `(${t("settings.security.current")})`}</strong>
                <span>{session.ip_address ?? t("common.notAvailable")} · {formatDateTime(session.created_at, i18n.resolvedLanguage)}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="user-action" onClick={() => void closeOtherSessions()} type="button">
          <LogOut size={16} /> {t("settings.security.closeOthers")}
        </button>
      </div>

      <div className="settings-block">
        <div className="settings-block-title"><KeyRound size={18} /><strong>{t("settings.security.totp")}</strong></div>
        <p>{user.totp_enabled ? t("settings.security.totpActive") : t("settings.security.totpDescription")}</p>
        {!totpSetup && (
          <div className="settings-inline-form">
            <input autoComplete="current-password" name="totp-current-password" onChange={(event) => setPassword(event.target.value)} placeholder={t("auth.password")} type="password" value={password} />
            {user.totp_enabled && <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} name="totp-code" onChange={(event) => setCode(event.target.value)} placeholder={t("settings.security.code")} value={code} />}
            <button className="user-action" onClick={() => void (user.totp_enabled ? removeTotp() : startTotp())} type="button">
              {user.totp_enabled ? t("settings.security.disableTotp") : t("settings.security.setupTotp")}
            </button>
          </div>
        )}
        {totpSetup && (
          <div className="totp-setup">
            <QRCodeSVG size={160} value={totpSetup.otpauth_uri} />
            <code>{totpSetup.secret}</code>
            <div className="settings-inline-form">
              <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} name="totp-code" onChange={(event) => setCode(event.target.value)} placeholder={t("settings.security.code")} value={code} />
              <button className="user-action" onClick={() => void finishTotp()} type="button">{t("settings.security.confirmTotp")}</button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-block">
        <div className="settings-block-title"><KeyRound size={18} /><strong>{t("settings.security.passkeys")}</strong></div>
        <p>
          {capability?.enabled
            ? t("settings.security.passkeysDescription")
            : t("settings.security.passkeysUnavailable")}
        </p>
        {passkeys.map((passkey) => <div className="security-session-row" key={passkey.id}><KeyRound size={18} /><div><strong>{passkey.name}</strong><span>{formatDateTime(passkey.created_at, i18n.resolvedLanguage)}</span></div><button aria-label={t("settings.security.removePasskey")} className="icon-button danger" onClick={() => void removePasskey(passkey.id)} type="button"><Trash2 size={16} /></button></div>)}
        {capability?.enabled && (
          <div className="settings-inline-form">
            <input autoComplete="off" name="passkey-name" onChange={(event) => setPasskeyName(event.target.value)} placeholder={t("settings.security.passkeyName")} value={passkeyName} />
            <input autoComplete="current-password" name="passkey-current-password" onChange={(event) => setPassword(event.target.value)} placeholder={t("auth.password")} type="password" value={password} />
            <button className="user-action" onClick={() => void registerPasskey()} type="button">{t("settings.security.addPasskey")}</button>
          </div>
        )}
      </div>
      {message && <p className="form-success">{message}</p>}
      {error && <p className="login-error">{error}</p>}
    </>
  );
}
