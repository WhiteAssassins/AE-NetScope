import type { TFunction } from "i18next";
import type { DeviceRecord } from "./types";

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

const physicalDeviceTypeTerms = [
  "access point",
  "camera",
  "camara",
  "computer",
  "dvr",
  "equipment",
  "equipo",
  "firewall",
  "nas",
  "nvr",
  "router",
  "san",
  "server",
  "servidor",
  "switch",
  "ups",
  "workstation",
];

const nonPhysicalDeviceTypeTerms = ["container", "contenedor", "virtual", "virtualizacion", "vm"];

function normalizedDeviceType(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isHardwareDevice(device: DeviceRecord) {
  const type = normalizedDeviceType(device.device_type);
  const words = new Set(type.split(" ").filter(Boolean));
  const matchesTerm = (term: string) => term.includes(" ") ? type.includes(term) : words.has(term);

  if (nonPhysicalDeviceTypeTerms.some(matchesTerm)) return false;
  if (physicalDeviceTypeTerms.some(matchesTerm)) return true;

  return [
    device.vendor,
    device.model,
    device.serial_number,
    device.asset_tag,
    device.cpu,
    device.memory,
    device.storage,
    device.warranty_expires,
    device.rack_position,
  ].some((value) => Boolean(value?.trim()));
}

export function hasPermission(permissions: string[], permission: string) {
  return permissions.includes(permission);
}
