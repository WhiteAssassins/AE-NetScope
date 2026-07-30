import type { TFunction } from "i18next";

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function stateLabel(value: string, t?: TFunction) {
  if (t) {
    return t(`values.states.${value}`, { defaultValue: titleCase(value) });
  }
  if (value === "active") return "Activa";
  if (value === "reserved") return "Reservada";
  if (value === "unassigned") return "Sin asignar";
  return titleCase(value);
}

const deviceTypeKeys: Record<string, string> = {
  Equipo: "workstation",
  Servidor: "server",
  Switch: "switch",
  Router: "router",
  Firewall: "firewall",
  "Access Point": "accessPoint",
  "Cámara IP": "ipCamera",
  NVR: "nvr",
  DVR: "dvr",
  NAS: "nas",
  SAN: "san",
  Impresora: "printer",
  VoIP: "voip",
  UPS: "ups",
  IoT: "iot",
  "Virtualización": "virtualization",
  Contenedor: "container",
  Sensor: "sensor",
  "Control de acceso": "accessControl",
  Otro: "other",
};

export function deviceTypeLabel(value: string, t: TFunction) {
  const key = deviceTypeKeys[value];
  return key ? t(`values.deviceTypes.${key}`) : value;
}

export function assignmentTypeLabel(value: string, t: TFunction) {
  return t(`values.assignmentTypes.${value}`, { defaultValue: titleCase(value) });
}

export function roleLabel(value: string, t: TFunction) {
  return t(`values.roles.${value}`, { defaultValue: titleCase(value) });
}

export function stateTone(value: string) {
  if (value === "active") return "green";
  if (value === "reserved") return "orange";
  return "gray";
}

export function typeTone(type: string) {
  if (type === "Servidor") return "server";
  if (type === "Access Point") return "access";
  if (["Cámara IP", "NVR", "DVR", "Sensor", "Control de acceso"].includes(type)) return "camera";
  if (["Firewall", "UPS"].includes(type)) return "security";
  if (["NAS", "SAN", "Virtualización", "Contenedor"].includes(type)) return "storage";
  if (["Impresora", "VoIP", "IoT"].includes(type)) return "device";
  if (type === "Equipo") return "workstation";
  return "network";
}

export function hasPermission(permissions: string[], permission: string) {
  return permissions.includes(permission);
}
