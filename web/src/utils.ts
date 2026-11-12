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

export function deviceTypeLabel(value: string, t: TFunction) {
  return t(`values.deviceTypes.${value}`, { defaultValue: value });
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
  if (type === "server") return "server";
  if (type === "access_point") return "access";
  if (["ip_camera", "nvr", "dvr", "sensor", "access_control"].includes(type)) return "camera";
  if (["firewall", "ups"].includes(type)) return "security";
  if (["nas", "san", "virtualization", "container"].includes(type)) return "storage";
  if (["printer", "voip", "iot"].includes(type)) return "device";
  if (type === "workstation") return "workstation";
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

const nonPhysicalDeviceTypeTerms = [
  "container",
  "contenedor",
  "virtual",
  "virtualization",
  "virtualizacion",
  "vm",
];

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
