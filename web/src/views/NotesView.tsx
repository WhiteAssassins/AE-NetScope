import { FileText, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { DeviceRecord } from "../types";
import { deviceTypeLabel, hasPermission, typeTone } from "../utils";

type NotesViewProps = {
  csrfToken: string;
  devices: DeviceRecord[];
  focusDeviceId?: number;
  onChanged: () => Promise<void>;
  onOpenDevice: (deviceId: number) => void;
  permissions: string[];
};

export default function NotesView({
  csrfToken,
  devices,
  focusDeviceId,
  onChanged,
  onOpenDevice,
  permissions,
}: NotesViewProps) {
  const { t } = useTranslation();
  const initialFocusedDevice = focusDeviceId
    ? devices.find((device) => device.id === focusDeviceId) ?? null
    : null;
  const [query, setQuery] = useState(initialFocusedDevice?.name ?? "");
  const [filter, setFilter] = useState(initialFocusedDevice ? "all" : "with-notes");
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(initialFocusedDevice);
  const [notes, setNotes] = useState(initialFocusedDevice?.notes ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canUpdateDevices = hasPermission(permissions, "devices:update");

  const normalizedQuery = query.trim().toLowerCase();
  const devicesWithNotes = devices.filter((device) => Boolean(device.notes?.trim())).length;
  const devicesWithoutNotes = devices.length - devicesWithNotes;
  const deviceTypes = Array.from(new Set(devices.map((device) => device.device_type))).sort();

  const filteredDevices = devices.filter((device) => {
    const hasNotes = Boolean(device.notes?.trim());
    const matchesFilter =
      filter === "all" ||
      (filter === "with-notes" && hasNotes) ||
      (filter === "without-notes" && !hasNotes) ||
      device.device_type === filter;

    const matchesQuery =
      !normalizedQuery ||
      [
        device.name,
        device.device_type,
        device.primary_ip,
        device.primary_mac,
        device.location,
        device.vendor,
        device.model,
        device.notes,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));

    return matchesFilter && matchesQuery;
  });

  function selectDevice(device: DeviceRecord) {
    setSelectedDevice(device);
    setNotes(device.notes ?? "");
    setMessage("");
    setError("");
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice || !canUpdateDevices) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/inventory/devices/${selectedDevice.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ notes: notes.trim() ? notes : null }),
      });

      if (!response.ok) {
        setError(t("notes.saveFailed"));
        return;
      }

      setMessage(t("notes.updated", { name: selectedDevice.name }));
      await onChanged();
      setSelectedDevice({ ...selectedDevice, notes: notes.trim() ? notes : null });
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>{t("notes.title")}</h1>
        <p>{t("notes.description")}</p>
      </div>

      <section className="ip-summary-grid" aria-label={t("notes.summary")}>
        <article className="mini-stat">
          <strong>{devices.length}</strong>
          <span>{t("navigation.devices")}</span>
        </article>
        <article className="mini-stat green">
          <strong>{devicesWithNotes}</strong>
          <span>{t("notes.withNotes")}</span>
        </article>
        <article className="mini-stat gray">
          <strong>{devicesWithoutNotes}</strong>
          <span>{t("notes.withoutNotes")}</span>
        </article>
        <article className="mini-stat orange">
          <strong>{deviceTypes.length}</strong>
          <span>{t("notes.deviceTypes")}</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("notes.searchPlaceholder")}
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">{t("common.all")}</option>
              <option value="with-notes">{t("notes.withNotes")}</option>
              <option value="without-notes">{t("notes.withoutNotes")}</option>
              {deviceTypes.map((type) => (
                <option key={type} value={type}>
                  {deviceTypeLabel(type, t)}
                </option>
              ))}
            </select>
            <span>{t("notes.recordCount", { count: filteredDevices.length })}</span>
          </div>

          <div className="notes-list">
            {filteredDevices.map((device) => (
              <article
                className={selectedDevice?.id === device.id ? "note-row selected" : "note-row"}
                key={device.id}
              >
                <button className="note-main button-reset" onClick={() => selectDevice(device)}>
                  <span className={`pill ${typeTone(device.device_type)}`}>
                    {deviceTypeLabel(device.device_type, t)}
                  </span>
                  <strong>{device.name}</strong>
                  <small>
                    {device.primary_ip ?? t("audit.withoutIp")} · {device.location ?? t("notes.withoutLocation")}
                  </small>
                  <p>{device.notes?.trim() || t("notes.noTechnicalNote")}</p>
                </button>
                <button className="user-action" onClick={() => onOpenDevice(device.id)}>
                  {t("hardware.openDevice")}
                </button>
              </article>
            ))}
            {!filteredDevices.length && <p className="muted-line">{t("notes.empty")}</p>}
          </div>
        </article>

        <article className="panel device-form-panel">
          <div className="detail-heading">
            <div>
              <h2>{selectedDevice ? selectedDevice.name : t("notes.selectDevice")}</h2>
              <p>{selectedDevice?.primary_ip ?? t("notes.noDeviceSelected")}</p>
            </div>
            <FileText size={24} strokeWidth={1.8} />
          </div>

          {selectedDevice ? (
            <form className="inventory-form" onSubmit={saveNotes}>
              <label className="form-wide">
                {t("notes.technicalNote")}
                <textarea
                  disabled={!canUpdateDevices}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("notes.notePlaceholder")}
                  value={notes}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={!canUpdateDevices || isSaving} type="submit">
                {isSaving ? t("common.saving") : t("notes.save")}
              </button>
            </form>
          ) : (
            <p className="muted-line">
              {t("notes.selectHint")}
            </p>
          )}
        </article>
      </section>
    </>
  );
}
