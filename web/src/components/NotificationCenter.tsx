import {
  Bell,
  Boxes,
  CheckCheck,
  HeartPulse,
  PackageCheck,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../dateTime";
import { auditEventMessage } from "../auditMessages";
import type { AuditEvent, HealthStatus, UpdateStatusInfo } from "../types";

type NotificationCenterProps = {
  auditEvents: AuditEvent[];
  health: HealthStatus | null;
  isOpen: boolean;
  onOpenAudit: () => void;
  onOpenAuditEvent: (event: AuditEvent) => void;
  onOpenHealth: () => void;
  onOpenUpdates: () => void;
  onToggle: () => void;
  updateStatus: UpdateStatusInfo | null;
  userId: number;
};

type NotificationTone = "security" | "users" | "inventory" | "health" | "update" | "system";

type NotificationItem = {
  auditEvent?: AuditEvent;
  description: string;
  id: string;
  onOpen: () => void;
  timestamp: string | null;
  title: string;
  tone: NotificationTone;
};

const MAX_STORED_READ_IDS = 200;

function storageKey(userId: number) {
  return `ae-netscope-notifications-read:${userId}`;
}

function readStoredIds(userId: number) {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function auditTone(eventType: string): NotificationTone {
  if (eventType.startsWith("auth.")) return "security";
  if (eventType.startsWith("users.")) return "users";
  if (eventType.startsWith("inventory.")) return "inventory";
  return "system";
}

function NotificationIcon({ tone }: { tone: NotificationTone }) {
  if (tone === "security") return <ShieldAlert size={18} />;
  if (tone === "users") return <UsersRound size={18} />;
  if (tone === "inventory") return <Boxes size={18} />;
  if (tone === "health") return <HeartPulse size={18} />;
  if (tone === "update") return <PackageCheck size={18} />;
  return <Bell size={18} />;
}

export default function NotificationCenter({
  auditEvents,
  health,
  isOpen,
  onOpenAudit,
  onOpenAuditEvent,
  onOpenHealth,
  onOpenUpdates,
  onToggle,
  updateStatus,
  userId,
}: NotificationCenterProps) {
  const { i18n, t } = useTranslation();
  const [readIds, setReadIds] = useState<Set<string>>(() => readStoredIds(userId));
  const notifications: NotificationItem[] = [];

  if (health?.status === "degraded") {
    const failedCheckNames = Object.entries(health.checks)
      .filter(([, check]) => check.status === "error")
      .map(([name]) => name);
    const failedChecks = failedCheckNames
      .map((name) => t(`health.checkLabels.${name}`, { defaultValue: name }))
      .join(", ");
    notifications.push({
      description: failedChecks
        ? t("notifications.healthDescription", { checks: failedChecks })
        : t("notifications.healthDescriptionUnknown"),
      id: `health-degraded:${failedCheckNames.sort().join(",") || "unknown"}`,
      onOpen: onOpenHealth,
      timestamp: health.checked_at,
      title: t("notifications.healthTitle"),
      tone: "health",
    });
  }

  if (updateStatus?.update_available && updateStatus.selected_release) {
    notifications.push({
      description: t("notifications.updateDescription", {
        version: updateStatus.selected_release.tag_name,
      }),
      id: `update:${updateStatus.selected_release.tag_name}`,
      onOpen: onOpenUpdates,
      timestamp: updateStatus.selected_release.published_at,
      title: t("notifications.updateTitle"),
      tone: "update",
    });
  }

  for (const event of auditEvents.slice(0, 8)) {
    notifications.push({
      auditEvent: event,
      description: event.actor_email ?? event.actor_username ?? t("common.system"),
      id: `audit:${event.id}`,
      onOpen: () => onOpenAuditEvent(event),
      timestamp: event.created_at,
      title: auditEventMessage(event, t),
      tone: auditTone(event.event_type),
    });
  }

  const unreadCount = notifications.filter((notification) => !readIds.has(notification.id)).length;

  function persistReadIds(nextIds: Set<string>) {
    const limitedIds = [...nextIds].slice(-MAX_STORED_READ_IDS);
    const normalizedIds = new Set(limitedIds);
    setReadIds(normalizedIds);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(limitedIds));
  }

  function openNotification(notification: NotificationItem) {
    if (!readIds.has(notification.id)) {
      persistReadIds(new Set([...readIds, notification.id]));
    }
    notification.onOpen();
  }

  function markAllRead() {
    persistReadIds(new Set([...readIds, ...notifications.map((notification) => notification.id)]));
  }

  return (
    <div className="top-action-wrap">
      <button
        className="icon-button notification-trigger"
        aria-expanded={isOpen}
        aria-label={
          unreadCount
            ? t("notifications.unreadLabel", { count: unreadCount })
            : t("topbar.notifications")
        }
        onClick={onToggle}
      >
        <Bell size={22} strokeWidth={1.7} />
        {unreadCount > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="topbar-panel topbar-panel-right notification-panel">
          <div className="notification-panel-head">
            <div>
              <strong>{t("topbar.notifications")}</strong>
              <span>
                {unreadCount
                  ? t("notifications.unreadSummary", { count: unreadCount })
                  : t("notifications.noUnread")}
              </span>
            </div>
            <button className="text-button" disabled={!unreadCount} onClick={markAllRead}>
              <CheckCheck size={16} />
              {t("notifications.markAllRead")}
            </button>
          </div>

          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => {
                const isUnread = !readIds.has(notification.id);
                return (
                  <button
                    className={`notification-item ${isUnread ? "unread" : ""}`}
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                  >
                    <span className={`notification-icon ${notification.tone}`}>
                      <NotificationIcon tone={notification.tone} />
                    </span>
                    <span className="notification-content">
                      <strong>{notification.title}</strong>
                      <span>{notification.description}</span>
                      {notification.timestamp && (
                        <time>
                          {formatDateTime(notification.timestamp, i18n.resolvedLanguage)}
                        </time>
                      )}
                    </span>
                    {isUnread && <span className="notification-unread-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="topbar-empty notification-empty">
              <Bell size={20} />
              <strong>{t("topbar.noNotifications")}</strong>
              <span>{t("topbar.notificationHint")}</span>
            </div>
          )}

          {auditEvents.length > 0 && (
            <button className="notification-view-all text-button" onClick={onOpenAudit}>
              {t("notifications.viewAll")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
