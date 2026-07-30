import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent, HealthStatus, UpdateStatusInfo } from "../types";
import NotificationCenter from "./NotificationCenter";

const event: AuditEvent = {
  id: 14,
  actor_user_id: 1,
  actor_username: "admin",
  actor_email: "admin@example.com",
  event_type: "auth.login_success",
  message: "Login succeeded for admin@example.com",
  ip_address: "127.0.0.1",
  created_at: "2026-07-20T12:00:00Z",
};

const readyHealth: HealthStatus = {
  status: "ready",
  service: "AE NetScope",
  environment: "production",
  version: "0.1.8-alpha",
  release_channel: "alpha",
  checked_at: "2026-07-20T12:00:00Z",
  checks: {},
};

function renderCenter(overrides: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) {
  const props: React.ComponentProps<typeof NotificationCenter> = {
    auditEvents: [event],
    health: readyHealth,
    isOpen: true,
    onOpenAudit: vi.fn(),
    onOpenAuditEvent: vi.fn(),
    onOpenHealth: vi.fn(),
    onOpenUpdates: vi.fn(),
    onToggle: vi.fn(),
    updateStatus: null,
    userId: 1,
    ...overrides,
  };
  render(<NotificationCenter {...props} />);
  return props;
}

describe("NotificationCenter", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows an unread badge and marks an opened audit event as read", () => {
    const props = renderCenter();

    expect(screen.getByRole("button", { name: "1 unread notification" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Login succeeded/i }));

    expect(props.onOpenAuditEvent).toHaveBeenCalledWith(event);
    expect(JSON.parse(window.localStorage.getItem("ae-netscope-notifications-read:1") ?? "[]"))
      .toContain("audit:14");
  });

  it("adds health and update alerts and marks all visible notifications as read", () => {
    const health: HealthStatus = {
      ...readyHealth,
      status: "degraded",
      checks: {
        database: { status: "error", required: true, message: "failed" },
      },
    };
    const updateStatus = {
      update_available: true,
      selected_release: {
        tag_name: "v0.1.9-alpha",
        html_url: "https://example.com/release",
        name: "AE NetScope v0.1.9-alpha",
        prerelease: true,
        draft: false,
        published_at: "2026-07-20T11:00:00Z",
      },
    } as UpdateStatusInfo;
    renderCenter({ health, updateStatus });

    expect(screen.getByText("System health needs attention")).toBeInTheDocument();
    expect(screen.getByText("A new version is available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 unread notifications" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mark all as read/i }));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("No unread notifications")).toBeInTheDocument();
  });
});
