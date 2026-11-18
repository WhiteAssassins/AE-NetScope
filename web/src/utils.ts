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
  "access control",
  "access point",
  "control de acceso",
  "impresora",
  "iot",
  "phone",
  "printer",
  "sensor",
  "telefono",
  "voip",
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

export function isIpv4Cidr(cidr: string) {
  return !cidr.includes(":");
}

// IPv6 subnets are far larger than a JavaScript number can show exactly, so they are
// written as a power of two.
export function formatHostCount(count: number, cidr: string) {
  if (isIpv4Cidr(cidr)) return String(count);
  const prefix = Number(cidr.split("/")[1]);
  return Number.isInteger(prefix) ? `2^${128 - prefix}` : String(count);
}

// API reasons that tell the user what to change, mapped to translated messages.
const inventoryErrorPatterns: Array<[RegExp, string]> = [
  [/does not belong to the selected network/i, "inventoryErrors.ipOutsideNetwork"],
  [/would fall outside the new network CIDR/i, "inventoryErrors.cidrStrandsIps"],
  [/network or broadcast address/i, "inventoryErrors.networkOrBroadcast"],
  [/gateway must belong/i, "inventoryErrors.gatewayOutsideNetwork"],
  [/warranty/i, "inventoryErrors.invalidWarranty"],
  [/invalid mac address/i, "inventoryErrors.invalidMac"],
  [/does not appear to be an ipv4 or ipv6 (address|network)/i, "inventoryErrors.invalidAddress"],
  [/at least 1 character/i, "inventoryErrors.blankName"],
  [/already exists/i, "inventoryErrors.duplicate"],
  [/not found/i, "inventoryErrors.relatedNotFound"],
];

export async function inventoryErrorMessage(response: Response, fallbackKey: string, t: TFunction) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = payload?.detail;
  const reasons =
    typeof detail === "string"
      ? [detail]
      : Array.isArray(detail)
        ? detail.map((item) => (typeof item?.msg === "string" ? (item.msg as string) : ""))
        : [];
  for (const reason of reasons) {
    const match = inventoryErrorPatterns.find(([pattern]) => pattern.test(reason));
    if (match) return t(match[1]);
  }
  if (response.status === 409) return t("inventoryErrors.duplicate");
  return t(fallbackKey);
}

// Field limits enforced by the API, so the browser stops input before a failed save.
export const inventoryFieldLimits = {
  name: 120,
  serviceName: 80,
  interfaceName: 80,
  text: 120,
  longText: 160,
} as const;

/**
 * Copy text to the clipboard. The Clipboard API only exists on HTTPS and localhost, so
 * installations reached over plain HTTP, common on a LAN, use a temporary text field.
 */
export async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to the selection-based copy below.
    }
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
