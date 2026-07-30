import { HardDrive, Search } from "lucide-react";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeviceRecord } from "../types";
import { deviceTypeLabel, typeTone } from "../utils";

type HardwareViewProps = {
  devices: DeviceRecord[];
  onOpenDevice: (deviceId: number) => void;
};

const hardwareFocusedTypes = new Set([
  "Servidor",
  "Switch",
  "Router",
  "Firewall",
  "Access Point",
  "Cámara IP",
  "NVR",
  "DVR",
  "NAS",
  "SAN",
  "UPS",
  "Equipo",
]);

export default function HardwareView({ devices, onOpenDevice }: HardwareViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const hardwareDevices = devices.filter((device) => hardwareFocusedTypes.has(device.device_type));
  const missingSerial = hardwareDevices.filter((device) => !device.serial_number?.trim()).length;
  const missingAssetTag = hardwareDevices.filter((device) => !device.asset_tag?.trim()).length;
  const warrantySoon = hardwareDevices.filter((device) => warrantyState(device.warranty_expires) === "soon").length;
  const deviceTypes = Array.from(new Set(hardwareDevices.map((device) => device.device_type))).sort();

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDevices = hardwareDevices.filter((device) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "missing-serial" && !device.serial_number?.trim()) ||
      (filter === "missing-asset" && !device.asset_tag?.trim()) ||
      (filter === "warranty-soon" && warrantyState(device.warranty_expires) === "soon") ||
      (filter === "warranty-expired" && warrantyState(device.warranty_expires) === "expired") ||
      device.device_type === filter;

    const matchesQuery =
      !normalizedQuery ||
      [
        device.name,
        device.device_type,
        device.vendor,
        device.model,
        device.serial_number,
        device.asset_tag,
        device.firmware_version,
        device.cpu,
        device.memory,
        device.storage,
        device.warranty_expires,
        device.owner,
        device.rack_position,
        device.location,
        device.primary_ip,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));

    return matchesFilter && matchesQuery;
  });

  return (
    <>
      <div className="page-title">
        <h1>{t("hardware.title")}</h1>
        <p>{t("hardware.description")}</p>
      </div>

      <section className="ip-summary-grid" aria-label={t("hardware.summary")}>
        <article className="mini-stat">
          <strong>{hardwareDevices.length}</strong>
          <span>{t("hardware.physicalAssets")}</span>
        </article>
        <article className="mini-stat orange">
          <strong>{missingSerial}</strong>
          <span>{t("hardware.missingSerial")}</span>
        </article>
        <article className="mini-stat gray">
          <strong>{missingAssetTag}</strong>
          <span>{t("hardware.missingAssetTag")}</span>
        </article>
        <article className="mini-stat green">
          <strong>{warrantySoon}</strong>
          <span>{t("hardware.warrantySoon")}</span>
        </article>
      </section>

      <section className="panel">
        <div className="device-toolbar">
          <label className="inline-search">
            <Search size={18} strokeWidth={1.8} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("hardware.searchPlaceholder")}
              value={query}
            />
          </label>
          <select className="filter-select" onChange={(event) => setFilter(event.target.value)} value={filter}>
            <option value="all">{t("hardware.filters.all")}</option>
            <option value="missing-serial">{t("hardware.missingSerial")}</option>
            <option value="missing-asset">{t("hardware.missingAssetTag")}</option>
            <option value="warranty-soon">{t("hardware.warrantySoon")}</option>
            <option value="warranty-expired">{t("hardware.warrantyExpired")}</option>
            {deviceTypes.map((type) => (
              <option key={type} value={type}>
                {deviceTypeLabel(type, t)}
              </option>
            ))}
          </select>
          <span>{t("hardware.deviceCount", { count: filteredDevices.length })}</span>
        </div>

        <div className="hardware-grid">
          {filteredDevices.map((device) => (
            <article className="hardware-card" key={device.id}>
              <div className="hardware-card-head">
                <span className={`pill ${typeTone(device.device_type)}`}>
                  {deviceTypeLabel(device.device_type, t)}
                </span>
                <span className={`mini-pill ${warrantyTone(device.warranty_expires)}`}>
                  {warrantyLabel(device.warranty_expires, t)}
                </span>
              </div>
              <div>
                <h2>{device.name}</h2>
                <p>
                  {device.vendor ?? t("hardware.withoutVendor")} {device.model ?? ""}
                </p>
              </div>
              <dl className="hardware-facts">
                <div>
                  <dt>{t("devices.fields.serial")}</dt>
                  <dd>{device.serial_number ?? "-"}</dd>
                </div>
                <div>
                  <dt>{t("devices.fields.assetTag")}</dt>
                  <dd>{device.asset_tag ?? "-"}</dd>
                </div>
                <div>
                  <dt>CPU</dt>
                  <dd>{device.cpu ?? "-"}</dd>
                </div>
                <div>
                  <dt>RAM</dt>
                  <dd>{device.memory ?? "-"}</dd>
                </div>
                <div>
                  <dt>{t("devices.fields.storage")}</dt>
                  <dd>{device.storage ?? "-"}</dd>
                </div>
                <div>
                  <dt>{t("devices.fields.firmware")}</dt>
                  <dd>{device.firmware_version ?? "-"}</dd>
                </div>
                <div>
                  <dt>{t("devices.fields.rackPosition")}</dt>
                  <dd>{device.rack_position ?? "-"}</dd>
                </div>
                <div>
                  <dt>{t("hardware.owner")}</dt>
                  <dd>{device.owner ?? "-"}</dd>
                </div>
              </dl>
              <button className="user-action" onClick={() => onOpenDevice(device.id)}>
                {t("hardware.openDevice")}
              </button>
            </article>
          ))}
          {!filteredDevices.length && (
            <div className="hardware-empty">
              <HardDrive size={30} strokeWidth={1.8} />
              <strong>{t("hardware.emptyTitle")}</strong>
              <span>{t("hardware.emptyDescription")}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function warrantyDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function warrantyState(value: string | null) {
  const date = warrantyDate(value);
  if (!date) return "unknown";
  const now = new Date();
  if (date < now) return "expired";
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days <= 90) return "soon";
  return "ok";
}

function warrantyTone(value: string | null) {
  const state = warrantyState(value);
  if (state === "expired") return "orange";
  if (state === "soon") return "orange";
  if (state === "ok") return "green";
  return "gray";
}

function warrantyLabel(value: string | null, t: TFunction) {
  const state = warrantyState(value);
  return t(`hardware.warranty.${state}`);
}
