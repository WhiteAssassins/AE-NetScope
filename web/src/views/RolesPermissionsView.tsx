import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

type RoleKey = "admin" | "operator" | "viewer";

const roles: Array<{ key: RoleKey; labelKey: string; descriptionKey: string }> = [
  {
    key: "admin",
    labelKey: "values.roles.admin",
    descriptionKey: "roles.descriptions.admin",
  },
  {
    key: "operator",
    labelKey: "values.roles.operator",
    descriptionKey: "roles.descriptions.operator",
  },
  {
    key: "viewer",
    labelKey: "values.roles.viewer",
    descriptionKey: "roles.descriptions.viewer",
  },
];

const permissionGroups = [
  {
    titleKey: "roles.groups.usersSecurity",
    items: [
      { labelKey: "roles.permissions.manageUsers", permission: "users:manage" },
      { labelKey: "roles.permissions.manageSettings", permission: "settings:manage" },
      { labelKey: "roles.permissions.readAudit", permission: "audit:read" },
    ],
  },
  {
    titleKey: "roles.groups.inventory",
    items: [{ labelKey: "roles.permissions.readInventory", permission: "inventory:read" }],
  },
  {
    titleKey: "roles.groups.devices",
    items: [
      { labelKey: "roles.permissions.createDevices", permission: "devices:create" },
      { labelKey: "roles.permissions.updateDevices", permission: "devices:update" },
      { labelKey: "roles.permissions.deleteDevices", permission: "devices:delete" },
    ],
  },
  {
    titleKey: "roles.groups.ipMacs",
    items: [
      { labelKey: "roles.permissions.createIps", permission: "ip_addresses:create" },
      { labelKey: "roles.permissions.updateIps", permission: "ip_addresses:update" },
      { labelKey: "roles.permissions.deleteIps", permission: "ip_addresses:delete" },
    ],
  },
  {
    titleKey: "roles.groups.networks",
    items: [
      { labelKey: "roles.permissions.createNetworks", permission: "networks:create" },
      { labelKey: "roles.permissions.updateNetworks", permission: "networks:update" },
      { labelKey: "roles.permissions.deleteNetworks", permission: "networks:delete" },
      { labelKey: "roles.permissions.createVlans", permission: "vlans:create" },
      { labelKey: "roles.permissions.updateVlans", permission: "vlans:update" },
      { labelKey: "roles.permissions.deleteVlans", permission: "vlans:delete" },
    ],
  },
  {
    titleKey: "roles.groups.services",
    items: [
      { labelKey: "roles.permissions.createServices", permission: "services:create" },
      { labelKey: "roles.permissions.updateServices", permission: "services:update" },
      { labelKey: "roles.permissions.deleteServices", permission: "services:delete" },
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
  const { t } = useTranslation();

  return (
    <>
      <div className="page-title">
        <h1>{t("roles.title")}</h1>
        <p>{t("roles.description")}</p>
      </div>

      <section className="role-summary-grid">
        {roles.map((role) => (
          <article className="panel role-card" key={role.key}>
            <ShieldCheck size={28} strokeWidth={1.8} />
            <div>
              <h2>{t(role.labelKey)}</h2>
              <p>{t(role.descriptionKey)}</p>
            </div>
            <strong>{t("roles.permissionCount", { count: rolePermissions[role.key].size })}</strong>
          </article>
        ))}
      </section>

      <section className="panel permissions-panel">
        <div className="permissions-table">
          <div className="permissions-row permissions-head">
            <strong>{t("roles.permission")}</strong>
            {roles.map((role) => (
              <strong key={role.key}>{t(role.labelKey)}</strong>
            ))}
          </div>

          {permissionGroups.map((group) => (
            <div className="permissions-group" key={group.titleKey}>
              <h2>{t(group.titleKey)}</h2>
              {group.items.map((item) => (
                <div className="permissions-row" key={item.permission}>
                  <span>{t(item.labelKey)}</span>
                  {roles.map((role) => (
                    <span
                      className={
                        rolePermissions[role.key].has(item.permission)
                          ? "mini-pill green"
                          : "mini-pill gray"
                      }
                      key={role.key}
                    >
                      {t(
                        rolePermissions[role.key].has(item.permission)
                          ? "roles.allowed"
                          : "roles.denied",
                      )}
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
