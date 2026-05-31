export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function stateLabel(value: string) {
  if (value === "active") return "Activa";
  if (value === "reserved") return "Reservada";
  if (value === "unassigned") return "Sin asignar";
  return titleCase(value);
}

export function stateTone(value: string) {
  if (value === "active") return "green";
  if (value === "reserved") return "orange";
  return "gray";
}

export function typeTone(type: string) {
  if (type === "Servidor") return "server";
  if (type === "Access Point") return "access";
  if (type === "Equipo") return "workstation";
  return "network";
}

export function hasPermission(permissions: string[], permission: string) {
  return permissions.includes(permission);
}
