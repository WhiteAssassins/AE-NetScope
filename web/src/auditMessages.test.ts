import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import i18n from "./i18n";
import { localeResources } from "./i18n";
import { auditEventMessage, SUPPORTED_AUDIT_EVENT_TYPES } from "./auditMessages";
import type { AuditEvent } from "./types";

function event(event_type: string, message: string): AuditEvent {
  return {
    id: 1,
    event_type,
    message,
    actor_user_id: 1,
    actor_email: "admin@example.com",
    actor_username: "admin",
    ip_address: "127.0.0.1",
    created_at: "2026-07-21T00:00:00Z",
  };
}

function pythonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pythonFiles(path) : entry.name.endsWith(".py") ? [path] : [];
  });
}

function backendAuditEventTypes() {
  const source = pythonFiles(resolve(process.cwd(), "../api/app"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  return [
    ...source.matchAll(
      /write_audit_event\([\s\S]{0,180}?["']((?:auth|inventory|users|settings)\.[a-z_]+)["']/g,
    ),
  ].map((match) => match[1]);
}

function translationAt(resource: unknown, path: string) {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, resource);
}

describe("localized audit messages", () => {
  it("covers every audit event emitted by the backend in every locale", () => {
    const backendTypes = [...new Set(backendAuditEventTypes())].sort();
    expect([...SUPPORTED_AUDIT_EVENT_TYPES].sort()).toEqual(backendTypes);

    for (const [language, resource] of Object.entries(localeResources)) {
      for (const eventType of backendTypes) {
        const key = `audit.events.${eventType}`;
        const directValue = translationAt(resource, key);
        const singularValue = translationAt(resource, `${key}_one`);
        const pluralValue = translationAt(resource, `${key}_other`);
        expect(
          typeof directValue === "string" ||
            (typeof singularValue === "string" && typeof pluralValue === "string"),
          `${language} is missing ${key}`,
        ).toBe(true);
      }
    }
  });

  it("translates existing database messages without changing their dynamic values", async () => {
    await i18n.changeLanguage("es");

    expect(
      auditEventMessage(
        event("auth.login_success", "Login succeeded for admin@example.com"),
        i18n.t,
      ),
    ).toBe("Inicio de sesión correcto para admin@example.com");
    expect(
      auditEventMessage(
        event("inventory.device_created", "Device created: SW-Core-01"),
        i18n.t,
      ),
    ).toBe("Dispositivo creado: SW-Core-01");
    expect(
      auditEventMessage(
        event("inventory.exported", "Inventory exported as CSV: devices"),
        i18n.t,
      ),
    ).toBe("Inventario exportado como CSV: dispositivos");
    expect(
      auditEventMessage(event("auth.sessions_revoked", "Other sessions revoked: 2"), i18n.t),
    ).toBe("Se cerraron 2 sesiones adicionales");
  });

  it("falls back to the original message for unknown event types", async () => {
    await i18n.changeLanguage("en");
    expect(auditEventMessage(event("custom.event", "Custom event"), i18n.t)).toBe(
      "Custom event",
    );
  });

  it("keeps malformed legacy messages intact", async () => {
    await i18n.changeLanguage("es");
    expect(auditEventMessage(event("auth.login_success", "Legacy login entry"), i18n.t)).toBe(
      "Legacy login entry",
    );
  });
});
