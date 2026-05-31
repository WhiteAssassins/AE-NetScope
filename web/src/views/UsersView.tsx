import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { ManagedUser, User, UserRole } from "../types";
import { hasPermission } from "../utils";

type UsersViewProps = {
  csrfToken: string;
  currentUser: User;
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operador",
  viewer: "Solo lectura",
};

export default function UsersView({ csrfToken, currentUser }: UsersViewProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", role: "viewer" as UserRole });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManageUsers = hasPermission(currentUser.permissions, "users:manage");

  useEffect(() => {
    loadUsers().catch(() => setError("No se pudo cargar la lista de usuarios."));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedQuery) {
      return true;
    }
    return [user.email, user.username, user.role]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  async function loadUsers() {
    const response = await fetch(`${API_BASE_URL}/users`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("users");
    }
    setUsers((await response.json()) as ManagedUser[]);
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUsers) {
      return;
    }
    setError("");
    setMessage("");
    setTemporaryPassword("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        setError("No se pudo crear el usuario. Revisa email duplicado o campos.");
        return;
      }

      const data = (await response.json()) as {
        user: ManagedUser;
        temporary_password: string;
      };
      setTemporaryPassword(data.temporary_password);
      setMessage(`Usuario creado: ${data.user.email}`);
      setForm({ email: "", username: "", role: "viewer" });
      await loadUsers();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function patchUser(user: ManagedUser, payload: Partial<ManagedUser> & { clear_lock?: boolean }) {
    if (!canManageUsers) {
      return;
    }
    setError("");
    setMessage("");
    setTemporaryPassword("");

    const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("No se pudo actualizar el usuario. Revisa que quede al menos un admin activo.");
      return;
    }

    setMessage(`Usuario actualizado: ${user.email}`);
    await loadUsers();
  }

  async function resetPassword(user: ManagedUser) {
    if (!canManageUsers) {
      return;
    }
    setError("");
    setMessage("");
    setTemporaryPassword("");

    const response = await fetch(`${API_BASE_URL}/users/${user.id}/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });

    if (!response.ok) {
      setError("No se pudo resetear la contraseña.");
      return;
    }

    const data = (await response.json()) as {
      user: ManagedUser;
      temporary_password: string;
    };
    setTemporaryPassword(data.temporary_password);
    setMessage(`Contraseña temporal generada para ${data.user.email}`);
    await loadUsers();
  }

  async function deactivateUser(user: ManagedUser) {
    if (!canManageUsers) {
      return;
    }
    const confirmed = window.confirm(
      `Desactivar el usuario "${user.email}"? Sus sesiones dejarán de tener acceso.`,
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setMessage("");
    setTemporaryPassword("");

    const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });

    if (!response.ok) {
      setError("No se pudo desactivar el usuario. Revisa que quede al menos un admin activo.");
      return;
    }

    setMessage(`Usuario desactivado: ${user.email}`);
    await loadUsers();
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Usuarios</h1>
          <p>Altas, roles, bloqueos temporales y resets de contraseña.</p>
        </div>
        {canManageUsers && (
          <button className="primary-action" onClick={() => setShowForm((value) => !value)}>
            <Plus size={18} strokeWidth={2} />
            {showForm ? "Ocultar formulario" : "Nuevo usuario"}
          </button>
        )}
      </div>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por email, usuario o rol..."
                value={query}
              />
            </label>
            <span>{filteredUsers.length} usuarios</span>
          </div>

          {message && <p className="form-success">{message}</p>}
          {error && <p className="login-error">{error}</p>}
          {temporaryPassword && (
            <p className="form-success">
              Contraseña temporal: <strong>{temporaryPassword}</strong>
            </p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Cambio password</th>
                  <th>Último acceso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.username}</td>
                    <td>
                      <select
                        disabled={!canManageUsers}
                        onChange={(event) =>
                          patchUser(user, { role: event.target.value as UserRole })
                        }
                        value={user.role}
                      >
                        <option value="admin">Admin</option>
                        <option value="operator">Operador</option>
                        <option value="viewer">Solo lectura</option>
                      </select>
                    </td>
                    <td>
                      <span className={`mini-pill ${user.is_active ? "green" : "gray"}`}>
                        {user.is_active ? "Activo" : "Bloqueado"}
                      </span>
                    </td>
                    <td>{user.must_change_password ? "Forzado" : "No"}</td>
                    <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() =>
                            patchUser(user, {
                              is_active: !user.is_active,
                            })
                          }
                        >
                          {user.is_active ? "Bloquear" : "Activar"}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => patchUser(user, { must_change_password: true })}
                        >
                          Forzar cambio
                        </button>
                        <button className="text-button" onClick={() => resetPassword(user)}>
                          Reset password
                        </button>
                        <button className="danger-action" onClick={() => deactivateUser(user)}>
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {showForm && canManageUsers && (
          <article className="panel form-panel">
            <h2>Crear usuario</h2>
            <form className="inventory-form" onSubmit={createUser}>
              <label>
                Email
                <input
                  onChange={(event) => updateForm("email", event.target.value)}
                  required
                  type="email"
                  value={form.email}
                />
              </label>
              <label>
                Usuario
                <input
                  onChange={(event) => updateForm("username", event.target.value)}
                  required
                  value={form.username}
                />
              </label>
              <label>
                Rol
                <select
                  onChange={(event) => updateForm("role", event.target.value)}
                  value={form.role}
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creando..." : "Crear usuario"}
              </button>
            </form>
          </article>
        )}
      </section>
    </>
  );
}
