import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createIntegrationToken, fetchIntegrationTokens, revokeIntegrationToken,
} from "../api";
import type { IntegrationToken } from "../api";
import { formatDateTime } from "../dateTime";

export default function IntegrationSettings({ csrfToken, canWrite }: {
  csrfToken: string; canWrite: boolean;
}) {
  const { i18n, t } = useTranslation();
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [allowWrite, setAllowWrite] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchIntegrationTokens().then((items) => {
      if (active) setTokens(items);
    }).catch(() => { if (active) setError(t("integrations.failed")); });
    return () => { active = false; };
  }, [t]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSecret("");
    try {
      const result = await createIntegrationToken({
        name, password, allow_write: allowWrite && canWrite, expires_in_days: days,
      }, csrfToken);
      setSecret(result.token);
      const metadata: IntegrationToken = {
        id: result.id, name: result.name, allow_write: result.allow_write,
        created_at: result.created_at, expires_at: result.expires_at, revoked_at: result.revoked_at,
      };
      setTokens((current) => [metadata, ...current]);
      setName("");
    } catch {
      setError(t("integrations.failed"));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    setBusy(true);
    setError("");
    try {
      await revokeIntegrationToken(id, csrfToken);
      setSecret("");
      setTokens(await fetchIntegrationTokens());
    } catch {
      setError(t("integrations.failed"));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="settings-section-heading">
      <KeyRound size={20} /><div><h2>{t("integrations.tokensTitle")}</h2>
        <span>{t("integrations.tokensDescription")}</span></div>
    </div>
    <form onSubmit={(event) => void create(event)}>
      <label className="settings-row"><strong>{t("integrations.name")}</strong>
        <input className="filter-select" required maxLength={120} value={name}
          onChange={(event) => setName(event.target.value)} /></label>
      <label className="settings-row"><strong>{t("integrations.password")}</strong>
        <input className="filter-select" required type="password" autoComplete="current-password"
          maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="settings-row"><strong>{t("integrations.days")}</strong>
        <input className="filter-select" required type="number" min={1} max={365} value={days}
          onChange={(event) => setDays(Number(event.target.value))} /></label>
      {canWrite && <label className="settings-row settings-check">
        <div><strong>{t("integrations.write")}</strong><span>{t("integrations.writeDescription")}</span></div>
        <input type="checkbox" checked={allowWrite}
          onChange={(event) => setAllowWrite(event.target.checked)} /></label>}
      <button className="primary-action" type="submit" disabled={busy}>{t("integrations.create")}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {secret && <div role="status">
      <p>{t("integrations.showOnce")}</p>
      <label>{t("integrations.token")}<textarea readOnly value={secret} /></label>
      <button className="secondary-action" onClick={() => setSecret("")}>{t("integrations.hide")}</button>
    </div>}
    {tokens.map((token) => <div className="settings-row" key={token.id}>
      <div><strong>{token.name}</strong><span>
        {token.allow_write ? t("integrations.write") : t("integrations.read")}
        {" · "}{t("integrations.expires", { date: formatDateTime(token.expires_at, i18n.language) })}
      </span></div>
      {token.revoked_at ? <span>{t("integrations.revoked")}</span>
        : <button className="secondary-action" disabled={busy} onClick={() => void revoke(token.id)}>
          {t("integrations.revoke")}</button>}
    </div>)}
  </>;
}
