import {
  Copy,
  KeyRound,
  LockKeyhole,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import { formatDateTime } from "../dateTime";
import type { ManagedUser, ManagedUserSession, User, UserRole } from "../types";
import { hasPermission, roleLabel } from "../utils";

type UsersViewProps = {
  csrfToken: string;
  currentUser: User;
  focusUserId?: number;
  onCurrentUserChanged: (user: User) => void;
};

type UserStatusFilter = "all" | "active" | "inactive" | "locked";
type UserEditForm = {
  email: string;
  username: string;
  role: UserRole;
  is_active: boolean;
};

const emptyCreateForm = { email: "", username: "", role: "viewer" as UserRole };

export default function UsersView({
  csrfToken,
  currentUser,
  focusUserId,
  onCurrentUserChanged,
}: UsersViewProps) {
  const { i18n, t } = useTranslation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<UserEditForm | null>(null);
  const [sessions, setSessions] = useState<ManagedUserSession[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    email: string;
    value: string;
  } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const selectedUserIdRef = useRef<number | null>(null);
  const sessionRequestIdRef = useRef(0);
  const canManageUsers = hasPermission(currentUser.permissions, "users:manage");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const activeAdminCount = users.filter((user) => user.role === "admin" && user.is_active).length;

  const loadSessions = useCallback(
    async (user: ManagedUser) => {
      if (selectedUserIdRef.current !== user.id) return;

      const requestId = ++sessionRequestIdRef.current;
      setSessions([]);
      setSessionsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/users/${user.id}/sessions`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("sessions");
        const nextSessions = (await response.json()) as ManagedUserSession[];
        if (
          requestId === sessionRequestIdRef.current &&
          selectedUserIdRef.current === user.id
        ) {
          setSessions(nextSessions);
        }
      } catch {
        if (
          requestId === sessionRequestIdRef.current &&
          selectedUserIdRef.current === user.id
        ) {
          setError(t("users.errors.loadSessions"));
        }
      } finally {
        if (
          requestId === sessionRequestIdRef.current &&
          selectedUserIdRef.current === user.id
        ) {
          setSessionsLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    loadUsers().catch(() => setError(t("users.errors.load")));
  }, [t]);

  useEffect(() => {
    if (!focusUserId || !users.length || selectedUserId === focusUserId) return;
    const focusedUser = users.find((item) => item.id === focusUserId);
    if (!focusedUser) return;
    queueMicrotask(() => {
      setQuery(focusedUser.email);
      setShowForm(false);
      selectedUserIdRef.current = focusedUser.id;
      setSelectedUserId(focusedUser.id);
      setEditForm(toEditForm(focusedUser));
      void loadSessions(focusedUser);
    });
  }, [focusUserId, loadSessions, selectedUserId, users]);

  useEffect(
    () => () => {
      sessionRequestIdRef.current += 1;
    },
    [],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const matchesQuery =
      !normalizedQuery ||
      [user.email, user.username, user.role].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const state = userAccountState(user);
    const matchesStatus = statusFilter === "all" || state === statusFilter;
    return matchesQuery && matchesRole && matchesStatus;
  });

  const summary = {
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    admins: users.filter((user) => user.role === "admin" && user.is_active).length,
    secured: users.filter((user) => user.is_active && hasMfa(user)).length,
  };

  async function loadUsers() {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users`, { credentials: "include" });
      if (!response.ok) throw new Error("users");
      const nextUsers = (await response.json()) as ManagedUser[];
      setUsers(nextUsers);
      return nextUsers;
    } finally {
      setIsLoading(false);
    }
  }

  async function openUser(user: ManagedUser) {
    setShowForm(false);
    selectedUserIdRef.current = user.id;
    setSelectedUserId(user.id);
    setEditForm(toEditForm(user));
    setError("");
    await loadSessions(user);
  }

  function openCreateForm() {
    selectedUserIdRef.current = null;
    sessionRequestIdRef.current += 1;
    setSelectedUserId(null);
    setEditForm(null);
    setSessions([]);
    setShowForm((current) => !current);
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUsers) return;
    setError("");
    setMessage("");
    setTemporaryPassword(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(csrfToken),
        body: JSON.stringify(createForm),
      });
      if (!response.ok) {
        setError(await userError(response, "create", t));
        return;
      }
      const data = (await response.json()) as {
        user: ManagedUser;
        temporary_password: string;
      };
      setTemporaryPassword({ email: data.user.email, value: data.temporary_password });
      setPasswordCopied(false);
      setMessage(t("users.created", { email: data.user.email }));
      setCreateForm(emptyCreateForm);
      setShowForm(false);
      const nextUsers = await loadUsers();
      const createdUser = nextUsers.find((user) => user.id === data.user.id);
      if (createdUser) await openUser(createdUser);
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveSelectedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !editForm || !canManageUsers) return;
    if (
      selectedUser.role === "admin" &&
      editForm.role !== "admin" &&
      !window.confirm(
        t("users.confirmRoleChange", {
          email: selectedUser.email,
          role: roleLabel(editForm.role, t),
        }),
      )
    ) {
      return;
    }
    if (
      selectedUser.is_active &&
      !editForm.is_active &&
      !window.confirm(t("users.confirmDeactivate", { email: selectedUser.email }))
    ) {
      return;
    }
    await patchUser(selectedUser, editForm, "save");
  }

  async function patchUser(
    user: ManagedUser,
    payload: Partial<UserEditForm> & { must_change_password?: boolean; clear_lock?: boolean },
    action: string,
  ) {
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: jsonHeaders(csrfToken),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(await userError(response, "update", t));
        return;
      }
      setMessage(t("users.updated", { email: user.email }));
      const nextUsers = await loadUsers();
      const refreshed = nextUsers.find((item) => item.id === user.id);
      if (refreshed) {
        setEditForm(toEditForm(refreshed));
        await loadSessions(refreshed);
      }
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setBusyAction("");
    }
  }

  async function resetPassword(user: ManagedUser) {
    if (!window.confirm(t("users.confirmResetPassword", { email: user.email }))) return;
    setBusyAction("password");
    setError("");
    setTemporaryPassword(null);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) {
        setError(await userError(response, "resetPassword", t));
        return;
      }
      const data = (await response.json()) as {
        user: ManagedUser;
        temporary_password: string;
      };
      setTemporaryPassword({ email: data.user.email, value: data.temporary_password });
      setPasswordCopied(false);
      setMessage(t("users.passwordGenerated", { email: data.user.email }));
      await refreshSelectedUser(user.id);
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setBusyAction("");
    }
  }

  async function resetMfa(user: ManagedUser) {
    if (!window.confirm(t("users.confirmResetMfa", { email: user.email }))) return;
    setBusyAction("mfa");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/reset-mfa`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) {
        setError(await userError(response, "resetMfa", t));
        return;
      }
      setMessage(t("users.mfaReset", { email: user.email }));
      await refreshSelectedUser(user.id);
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setBusyAction("");
    }
  }

  async function revokeSessions(user: ManagedUser) {
    if (!window.confirm(t("users.confirmRevokeSessions", { email: user.email }))) return;
    setBusyAction("sessions");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/sessions`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) {
        setError(await userError(response, "revokeSessions", t));
        return;
      }
      setMessage(t("users.sessionsRevoked", { email: user.email }));
      await refreshSelectedUser(user.id);
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setBusyAction("");
    }
  }

  async function revokeSession(user: ManagedUser, userSession: ManagedUserSession) {
    if (!window.confirm(t("users.confirmRevokeSession"))) return;
    setBusyAction(`session-${userSession.id}`);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/users/${user.id}/sessions/${userSession.id}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRF-Token": csrfToken },
        },
      );
      if (!response.ok) {
        setError(await userError(response, "revokeSessions", t));
        return;
      }
      setMessage(t("users.sessionRevoked"));
      await refreshSelectedUser(user.id);
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setBusyAction("");
    }
  }

  async function refreshSelectedUser(userId: number) {
    const nextUsers = await loadUsers();
    const refreshed = nextUsers.find((item) => item.id === userId);
    if (refreshed) {
      setEditForm(toEditForm(refreshed));
      await loadSessions(refreshed);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword.value);
      setPasswordCopied(true);
    } catch {
      setError(t("users.errors.copyPassword"));
    }
  }

  const protectedAdmin = Boolean(
    selectedUser?.role === "admin" && selectedUser.is_active && activeAdminCount <= 1,
  );
  const isCurrentUser = selectedUser?.id === currentUser.id;

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("users.title")}</h1>
          <p>{t("users.description")}</p>
        </div>
        {canManageUsers && (
          <button className="primary-action" onClick={openCreateForm}>
            <Plus size={18} strokeWidth={2} />
            {showForm ? t("common.hideForm") : t("users.new")}
          </button>
        )}
      </div>

      <section className="users-summary-grid" aria-label={t("users.summary.title")}>
        <UserSummary icon={Users} label={t("users.summary.total")} value={summary.total} />
        <UserSummary icon={UserCheck} label={t("users.summary.active")} value={summary.active} />
        <UserSummary icon={UserCog} label={t("users.summary.admins")} value={summary.admins} />
        <UserSummary icon={ShieldCheck} label={t("users.summary.mfa")} value={summary.secured} />
      </section>

      {message && <div className="inline-success">{message}</div>}
      {error && <div className="inline-error">{error}</div>}
      {temporaryPassword && (
        <div className="temporary-password-banner" role="status">
          <div>
            <KeyRound size={20} strokeWidth={1.9} />
            <div>
              <strong>{t("users.temporaryPasswordFor", { email: temporaryPassword.email })}</strong>
              <span>{t("users.temporaryPasswordHint")}</span>
            </div>
          </div>
          <code>{temporaryPassword.value}</code>
          <div className="row-actions">
            <button className="user-action" onClick={() => copyTemporaryPassword()}>
              <Copy size={16} />
              {t(passwordCopied ? "users.passwordCopied" : "users.copyPassword")}
            </button>
            <button
              aria-label={t("common.close")}
              className="icon-button"
              onClick={() => setTemporaryPassword(null)}
              title={t("common.close")}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      <section className={selectedUser || showForm ? "users-layout has-panel" : "users-layout"}>
        <article className="panel users-table-panel">
          <div className="users-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("users.searchPlaceholder")}
                value={query}
              />
            </label>
            <label className="compact-filter">
              <span>{t("users.filters.role")}</span>
              <select
                onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}
                value={roleFilter}
              >
                <option value="all">{t("users.filters.allRoles")}</option>
                {(["admin", "operator", "viewer"] as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-filter">
              <span>{t("users.filters.status")}</span>
              <select
                onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)}
                value={statusFilter}
              >
                {(["all", "active", "inactive", "locked"] as const).map((state) => (
                  <option key={state} value={state}>
                    {t(`users.filters.${state}`)}
                  </option>
                ))}
              </select>
            </label>
            <span className="users-result-count">{t("users.count", { count: filteredUsers.length })}</span>
          </div>

          <div className="table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>{t("users.account")}</th>
                  <th>{t("users.role")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("users.security")}</th>
                  <th>{t("users.sessions")}</th>
                  <th>{t("users.lastAccess")}</th>
                  <th><span className="sr-only">{t("users.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const accountState = userAccountState(user);
                  return (
                    <tr className={selectedUserId === user.id ? "selected-row" : ""} key={user.id}>
                      <td>
                        <div className="user-identity-cell">
                          <strong>{user.username}</strong>
                          <span>{user.email}</span>
                          {user.id === currentUser.id && <small>{t("users.you")}</small>}
                        </div>
                      </td>
                      <td><span className="mini-pill blue">{roleLabel(user.role, t)}</span></td>
                      <td>
                        <span className={`mini-pill ${accountStateTone(accountState)}`}>
                          {t(`users.states.${accountState}`)}
                        </span>
                      </td>
                      <td>
                        <SecuritySummary user={user} />
                      </td>
                      <td>{t("users.sessionCount", { count: user.active_session_count })}</td>
                      <td>
                        {user.last_login_at
                          ? formatDateTime(user.last_login_at, i18n.resolvedLanguage)
                          : t("users.never")}
                      </td>
                      <td>
                        <button className="user-action" onClick={() => openUser(user)}>
                          <UserCog size={16} />
                          {t("users.manage")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && filteredUsers.length === 0 && (
            <div className="users-empty-state">
              <Users size={28} strokeWidth={1.5} />
              <strong>{t("users.empty.title")}</strong>
              <span>{t("users.empty.description")}</span>
            </div>
          )}
          {isLoading && (
            <div className="users-empty-state">
              <RefreshCw className="spin" size={22} />
              <span>{t("users.loading")}</span>
            </div>
          )}
        </article>

        {showForm && canManageUsers && (
          <aside className="panel user-management-panel">
            <PanelHeading title={t("users.create")} onClose={() => setShowForm(false)} />
            <p className="panel-description">{t("users.createDescription")}</p>
            <form className="user-management-form" onSubmit={createUser}>
              <label>
                {t("common.email")}
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                  type="email"
                  value={createForm.email}
                />
              </label>
              <label>
                {t("users.username")}
                <input
                  autoComplete="off"
                  minLength={2}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, username: event.target.value }))
                  }
                  required
                  value={createForm.username}
                />
              </label>
              <label>
                {t("users.role")}
                <select
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                    }))
                  }
                  value={createForm.role}
                >
                  {(["admin", "operator", "viewer"] as UserRole[]).map((role) => (
                    <option key={role} value={role}>{roleLabel(role, t)}</option>
                  ))}
                </select>
              </label>
              <p className="muted-note">{t("users.createPasswordNotice")}</p>
              <button className="primary-action form-wide" disabled={isSubmitting} type="submit">
                <Plus size={17} />
                {isSubmitting ? t("users.creating") : t("users.create")}
              </button>
            </form>
          </aside>
        )}

        {selectedUser && editForm && (
          <aside className="panel user-management-panel">
            <PanelHeading
              title={selectedUser.username}
              onClose={() => {
                selectedUserIdRef.current = null;
                sessionRequestIdRef.current += 1;
                setSelectedUserId(null);
                setEditForm(null);
                setSessions([]);
                setSessionsLoading(false);
              }}
            />
            <div className="user-panel-meta">
              <span className={`mini-pill ${accountStateTone(userAccountState(selectedUser))}`}>
                {t(`users.states.${userAccountState(selectedUser)}`)}
              </span>
              <span className="mini-pill blue">{roleLabel(selectedUser.role, t)}</span>
              {isCurrentUser && <span className="mini-pill gray">{t("users.you")}</span>}
            </div>

            <form className="user-management-form" onSubmit={saveSelectedUser}>
              <h3>{t("users.sections.account")}</h3>
              <label>
                {t("common.email")}
                <input
                  onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  required
                  type="email"
                  value={editForm.email}
                />
              </label>
              <label>
                {t("users.username")}
                <input
                  minLength={2}
                  onChange={(event) => setEditForm({ ...editForm, username: event.target.value })}
                  required
                  value={editForm.username}
                />
              </label>
              <label>
                {t("users.role")}
                <select
                  disabled={isCurrentUser || protectedAdmin}
                  onChange={(event) =>
                    setEditForm({ ...editForm, role: event.target.value as UserRole })
                  }
                  value={editForm.role}
                >
                  {(["admin", "operator", "viewer"] as UserRole[]).map((role) => (
                    <option key={role} value={role}>{roleLabel(role, t)}</option>
                  ))}
                </select>
              </label>
              <label className="account-active-toggle">
                <span>
                  <strong>{t("users.accountActive")}</strong>
                  <small>{t("users.accountActiveDescription")}</small>
                </span>
                <input
                  checked={editForm.is_active}
                  disabled={isCurrentUser || protectedAdmin}
                  onChange={(event) =>
                    setEditForm({ ...editForm, is_active: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>
              {(isCurrentUser || protectedAdmin) && (
                <p className="muted-note">
                  {t(isCurrentUser ? "users.currentAccountProtected" : "users.lastAdminProtected")}
                </p>
              )}
              <button className="primary-action form-wide" disabled={busyAction === "save"} type="submit">
                <Save size={17} />
                {busyAction === "save" ? t("common.saving") : t("common.save")}
              </button>
            </form>

            <section className="user-security-actions">
              <h3>{t("users.sections.security")}</h3>
              <div className="user-action-grid">
                <button
                  className="user-action"
                  disabled={Boolean(busyAction)}
                  onClick={() => patchUser(selectedUser, { must_change_password: true }, "force")}
                >
                  <KeyRound size={16} />
                  {t("users.forcePasswordChange")}
                </button>
                {userAccountState(selectedUser) === "locked" && (
                  <button
                    className="user-action"
                    disabled={Boolean(busyAction)}
                    onClick={() => patchUser(selectedUser, { clear_lock: true }, "unlock")}
                  >
                    <Unlock size={16} />
                    {t("users.unlockLogin")}
                  </button>
                )}
                <button
                  className="user-action"
                  disabled={Boolean(busyAction)}
                  onClick={() => resetPassword(selectedUser)}
                >
                  <RefreshCw size={16} />
                  {t("users.resetPassword")}
                </button>
                <button
                  className="user-action"
                  disabled={Boolean(busyAction) || !hasMfa(selectedUser)}
                  onClick={() => resetMfa(selectedUser)}
                >
                  <ShieldCheck size={16} />
                  {t("users.resetMfa")}
                </button>
              </div>
            </section>

            <section className="managed-sessions-section">
              <div className="managed-sessions-heading">
                <div>
                  <h3>{t("users.sections.sessions")}</h3>
                  <span>{t("users.sessionCount", { count: selectedUser.active_session_count })}</span>
                </div>
                <button
                  aria-label={t("common.refresh")}
                  className="icon-button"
                  disabled={sessionsLoading}
                  onClick={() => loadSessions(selectedUser)}
                  title={t("common.refresh")}
                >
                  <RefreshCw className={sessionsLoading ? "spin" : ""} size={16} />
                </button>
              </div>
              <div className="managed-session-list">
                {sessions.map((session) => (
                  <div className="managed-session-row" key={session.id}>
                    <Monitor size={17} strokeWidth={1.7} />
                    <div>
                      <strong>
                        {sessionClient(
                          session.user_agent,
                          t("users.unknownClient"),
                          t("users.genericBrowser"),
                          t("users.unknownPlatform"),
                        )}
                      </strong>
                      <span>{session.ip_address ?? t("users.unknownIp")}</span>
                      <small>
                        {formatDateTime(session.created_at, i18n.resolvedLanguage)}
                        {session.is_current ? ` · ${t("users.current")}` : ""}
                      </small>
                    </div>
                    {sessionIsActive(session) ? (
                      session.is_current ? (
                        <span className="mini-pill green">{t("users.current")}</span>
                      ) : (
                        <button
                          aria-label={t("users.revokeSession")}
                          className="icon-button danger-icon-button"
                          disabled={busyAction === `session-${session.id}`}
                          onClick={() => revokeSession(selectedUser, session)}
                          title={t("users.revokeSession")}
                        >
                          <X size={15} />
                        </button>
                      )
                    ) : (
                      <span className="mini-pill gray">{t("users.states.expired")}</span>
                    )}
                  </div>
                ))}
                {!sessionsLoading && sessions.length === 0 && (
                  <p className="muted-note">{t("users.noSessions")}</p>
                )}
              </div>
              <button
                className="danger-action form-wide"
                disabled={Boolean(busyAction) || selectedUser.active_session_count === 0}
                onClick={() => revokeSessions(selectedUser)}
              >
                <LockKeyhole size={16} />
                {t("users.revokeActiveSessions")}
              </button>
            </section>
          </aside>
        )}
      </section>
    </>
  );
}

function UserSummary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="users-summary-item">
      <Icon size={19} strokeWidth={1.8} />
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

function SecuritySummary({ user }: { user: ManagedUser }) {
  const { t } = useTranslation();
  if (!hasMfa(user)) return <span className="muted-cell">{t("users.passwordOnly")}</span>;
  const methods = [
    user.totp_enabled ? "TOTP" : "",
    user.passkey_count ? t("users.passkeyCount", { count: user.passkey_count }) : "",
  ].filter(Boolean);
  return <span className="security-methods"><ShieldCheck size={15} />{methods.join(" · ")}</span>;
}

function PanelHeading({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="user-panel-heading">
      <h2>{title}</h2>
      <button aria-label={t("common.close")} className="icon-button" onClick={onClose} title={t("common.close")}>
        <X size={18} />
      </button>
    </div>
  );
}

function toEditForm(user: ManagedUser): UserEditForm {
  return { email: user.email, username: user.username, role: user.role, is_active: user.is_active };
}

function userAccountState(user: ManagedUser): Exclude<UserStatusFilter, "all"> {
  if (!user.is_active) return "inactive";
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) return "locked";
  return "active";
}

function accountStateTone(state: Exclude<UserStatusFilter, "all">) {
  if (state === "active") return "green";
  if (state === "locked") return "orange";
  return "gray";
}

function hasMfa(user: ManagedUser) {
  return user.totp_enabled || user.passkey_count > 0;
}

function sessionIsActive(session: ManagedUserSession) {
  return !session.revoked_at && new Date(session.expires_at).getTime() > Date.now();
}

function sessionClient(
  userAgent: string | null,
  unknownClient: string,
  genericBrowser: string,
  unknownPlatform: string,
) {
  if (!userAgent) return unknownClient;
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/")
        ? "Chrome"
        : userAgent.includes("Safari/")
          ? "Safari"
          : genericBrowser;
  const platform = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("iPhone") || userAgent.includes("iPad")
        ? "iOS"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : userAgent.includes("Linux")
            ? "Linux"
            : unknownPlatform;
  return `${browser} · ${platform}`;
}

function jsonHeaders(csrfToken: string) {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };
}

async function userError(response: Response, fallback: string, t: ReturnType<typeof useTranslation>["t"]) {
  const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
  const detail = payload?.detail ?? "";
  if (detail.includes("email already exists")) return t("users.errors.duplicateEmail");
  if (detail.includes("active admin")) return t("users.errors.lastAdmin");
  if (detail.includes("current account") || detail.includes("own role")) {
    return t("users.errors.currentAccount");
  }
  return t(`users.errors.${fallback}`);
}
