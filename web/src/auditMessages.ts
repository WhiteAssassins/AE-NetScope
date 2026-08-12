import type { TFunction } from "i18next";
import type { AuditEvent } from "./types";

type AuditParameters = Record<string, string | number | boolean>;

export const SUPPORTED_AUDIT_EVENT_TYPES = [
  "auth.email_change_failed",
  "auth.email_changed",
  "auth.initial_setup",
  "auth.login_blocked",
  "auth.login_failed",
  "auth.login_locked",
  "auth.login_success",
  "auth.mfa_failed",
  "auth.logout",
  "auth.passkey_added",
  "auth.passkey_failed",
  "auth.passkey_login",
  "auth.passkey_removed",
  "auth.password_change_failed",
  "auth.password_changed",
  "auth.sessions_revoked",
  "auth.totp_disabled",
  "auth.totp_enabled",
  "inventory.device_created",
  "inventory.device_deactivated",
  "inventory.device_deleted",
  "inventory.device_updated",
  "inventory.exported",
  "inventory.imported",
  "inventory.interface_created",
  "inventory.ip_created",
  "inventory.ip_deleted",
  "inventory.ip_updated",
  "inventory.network_created",
  "inventory.network_deleted",
  "inventory.network_updated",
  "inventory.service_created",
  "inventory.service_deleted",
  "inventory.service_updated",
  "inventory.vlan_created",
  "inventory.vlan_deleted",
  "inventory.vlan_updated",
  "settings.maintenance_updated",
  "settings.search_indexing_updated",
  "users.created",
  "users.deactivated",
  "users.mfa_reset",
  "users.password_reset",
  "users.session_revoked",
  "users.sessions_revoked",
  "users.updated",
] as const;

function match(message: string, pattern: RegExp, names: string[]): AuditParameters | null {
  const values = message.match(pattern);
  if (!values) return null;
  return Object.fromEntries(names.map((name, index) => [name, values[index + 1] ?? ""]));
}

function suffix(message: string) {
  const separator = message.indexOf(": ");
  return separator >= 0 ? { target: message.slice(separator + 2) } : null;
}

export function auditEventMessage(event: AuditEvent, t: TFunction) {
  const parameters = auditParameters(event.event_type, event.message);
  if (!parameters) {
    return event.message;
  }
  if (typeof parameters.state === "string") {
    parameters.state = t(`values.states.${parameters.state}`, {
      defaultValue: parameters.state,
    });
  }
  if (typeof parameters.resource === "string") {
    parameters.format = `CSV: ${t(`audit.resources.${parameters.resource}`, {
      defaultValue: parameters.resource,
    })}`;
    delete parameters.resource;
  }
  for (const key of ["previousRole", "role"]) {
    if (typeof parameters[key] === "string") {
      parameters[key] = t(`values.roles.${parameters[key]}`, {
        defaultValue: parameters[key],
      });
    }
  }
  for (const key of ["previousActive", "active"]) {
    if (typeof parameters[key] === "string") {
      const state = parameters[key] === "True" ? "enabled" : "disabled";
      parameters[key] = t(`values.states.${state}`);
    }
  }
  if (typeof parameters.count === "string" && /^\d+$/.test(parameters.count)) {
    parameters.count = Number(parameters.count);
  }
  return t(`audit.events.${event.event_type}`, {
    ...parameters,
    defaultValue: event.message,
  });
}

function auditParameters(eventType: string, message: string): AuditParameters | null {
  switch (eventType) {
    case "auth.login_failed":
      return match(message, /^Login failed for (?:unknown user )?(.+)$/, ["subject"]);
    case "auth.login_blocked":
    case "auth.login_locked":
      return suffix(message);
    case "auth.mfa_failed":
    case "auth.login_success":
    case "auth.password_change_failed":
    case "auth.password_changed":
    case "auth.email_change_failed":
    case "auth.passkey_login":
      return match(message, / for (.+)$/, ["subject"]);
    case "auth.email_changed":
      return match(message, /^Email changed for (.+) to (.+)$/, ["previous", "current"]);
    case "auth.sessions_revoked":
      return match(message, /^Other sessions revoked: (\d+)$/, ["count"]);
    case "auth.passkey_added":
    case "auth.passkey_removed":
      return suffix(message);
    case "auth.totp_enabled":
    case "auth.totp_disabled":
    case "auth.initial_setup":
    case "auth.logout":
    case "auth.passkey_failed":
      return {};
    case "inventory.exported":
      return message === "Inventory exported as JSON"
        ? { format: "JSON" }
        : match(message, /^Inventory exported as CSV: (.+)$/, ["resource"]);
    case "inventory.imported":
      return match(
        message,
        /^Inventory restored from JSON backup \((\d+) devices, (\d+) IPs\)$/,
        ["devices", "ips"],
      );
    case "inventory.device_created":
    case "inventory.device_updated":
    case "inventory.interface_created":
    case "inventory.ip_created":
    case "inventory.ip_updated":
    case "inventory.ip_deleted":
    case "inventory.device_deactivated":
    case "inventory.device_deleted":
    case "inventory.network_created":
    case "inventory.network_updated":
    case "inventory.network_deleted":
    case "inventory.service_created":
    case "inventory.service_updated":
    case "inventory.service_deleted":
    case "inventory.vlan_created":
    case "inventory.vlan_updated":
    case "inventory.vlan_deleted":
    case "users.created":
    case "users.password_reset":
    case "users.mfa_reset":
    case "users.deactivated":
      return suffix(message);
    case "users.updated":
      return match(
        message,
        /^User updated: (.+)->(.+); username (.+)->(.+); role (.+)->(.+); active (.+)->(.+)$/,
        [
          "previousEmail",
          "email",
          "previousUsername",
          "username",
          "previousRole",
          "role",
          "previousActive",
          "active",
        ],
      );
    case "users.sessions_revoked":
      return match(message, /^Sessions revoked for (.+): (\d+)$/, ["subject", "count"]);
    case "users.session_revoked":
      return match(message, /^Session revoked for (.+): (\d+)$/, ["subject", "session"]);
    case "settings.maintenance_updated":
      return match(message, /^Maintenance mode (enabled|disabled)$/, ["state"]);
    case "settings.search_indexing_updated":
      return match(message, /^Search engine indexing (allowed|blocked)$/, ["state"]);
    default:
      return null;
  }
}
