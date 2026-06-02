import { ShieldCheck } from "lucide-react";

type RoleKey = "admin" | "operator" | "viewer";

const roles: Array<{ key: RoleKey; label: string; description: string }> = [
  {
    key: "admin",
    label: "Admin",
    description: "Control completo de usuarios, seguridad, auditoría e inventario.",
  },
  {
    key: "operator",
    label: "Operador",
    description: "Puede operar el inventario y revisar auditoría, sin administrar usuarios.",
  },
  {
    key: "viewer",
    label: "Solo lectura",
    description: "Acceso de consulta al inventario, sin cambios.",
  },
];

const permissionGroups = [
  {
    title: "Usuarios y seguridad",
    items: [
      { label: "Gestionar usuarios", permission: "users:manage" },
      { label: "Gestionar ajustes", permission: "settings:manage" },
      { label: "Leer auditoría", permission: "audit:read" },
    ],
  },
  {
    title: "Inventario general",
    items: [{ label: "Leer inventario", permission: "inventory:read" }],
  },
  {
    title: "Dispositivos",
    items: [
      { label: "Crear dispositivos", permission: "devices:create" },
      { label: "Editar dispositivos", permission: "devices:update" },
      { label: "Eliminar dispositivos", permission: "devices:delete" },
    ],
  },
  {
    title: "IPs y MACs",
    items: [
      { label: "Crear IPs", permission: "ip_addresses:create" },
      { label: "Editar IPs", permission: "ip_addresses:update" },
      { label: "Eliminar IPs", permission: "ip_addresses:delete" },
    ],
  },
  {
    title: "Redes",
    items: [
      { label: "Crear subredes", permission: "networks:create" },
      { label: "Editar subredes", permission: "networks:update" },
      { label: "Eliminar subredes", permission: "networks:delete" },
      { label: "Crear VLANs", permission: "vlans:create" },
      { label: "Editar VLANs", permission: "vlans:update" },
      { label: "Eliminar VLANs", permission: "vlans:delete" },
    ],
  },
  {
    title: "Servicios",
    items: [
      { label: "Crear servicios", permission: "services:create" },
      { label: "Editar servicios", permission: "services:update" },
      { label: "Eliminar servicios", permission: "services:delete" },
    ],
  },
];

const rolePermissions: Record<RoleKey, Set<string>> = {
  admin: new Set(permissionGroups.flatMap((group) => group.items.map((item) => item.permission))),
  operator: new Set([
    "inventory:read",
    "devices:create",
    "devices:update",
    "ip_addresses:create",
    "ip_addresses:update",
    "networks:create",
    "networks:update",
    "vlans:create",
    "vlans:update",
    "services:create",
    "services:update",
    "audit:read",
  ]),
  viewer: new Set(["inventory:read"]),
};

export default function RolesPermissionsView() {
  return (
    <>
      <div className="page-title">
        <h1>Roles y permisos</h1>
        <p>Matriz de acceso aplicada por AE NetScope a usuarios, inventario y auditoría.</p>
      </div>

      <section className="role-summary-grid">
        {roles.map((role) => (
          <article className="panel role-card" key={role.key}>
            <ShieldCheck size={28} strokeWidth={1.8} />
            <div>
              <h2>{role.label}</h2>
              <p>{role.description}</p>
            </div>
            <strong>{rolePermissions[role.key].size} permisos</strong>
          </article>
        ))}
      </section>

      <section className="panel permissions-panel">
        <div className="permissions-table">
          <div className="permissions-row permissions-head">
            <strong>Permiso</strong>
            {roles.map((role) => (
              <strong key={role.key}>{role.label}</strong>
            ))}
          </div>

          {permissionGroups.map((group) => (
            <div className="permissions-group" key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <div className="permissions-row" key={item.permission}>
                  <span>{item.label}</span>
                  {roles.map((role) => (
                    <span
                      className={
                        rolePermissions[role.key].has(item.permission)
                          ? "mini-pill green"
                          : "mini-pill gray"
                      }
                      key={role.key}
                    >
                      {rolePermissions[role.key].has(item.permission) ? "Permitido" : "No"}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
