import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { DeviceRecord, ServiceRecord } from "../types";
import { deviceTypeLabel, hasPermission, stateLabel, stateTone } from "../utils";
export default function ServicesView({
  csrfToken,
  focusServiceId,
  services,
  devices,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  focusServiceId?: number;
  services: ServiceRecord[];
  devices: DeviceRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [form, setForm] = useState({
    device_id: "",
    name: "",
    port: "",
    protocol: "tcp",
    status: "active",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = hasPermission(permissions, "services:create");
  const canUpdate = hasPermission(permissions, "services:update");
  const canDelete = hasPermission(permissions, "services:delete");

  useEffect(() => {
    if (!focusServiceId) {
      return;
    }
    const service = services.find((item) => item.id === focusServiceId);
    if (service) {
      queueMicrotask(() => {
        selectService(service);
        setQuery(service.name);
      });
    }
  }, [focusServiceId, services]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredServices = services.filter((service) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        service.name,
        service.device_name,
        service.device_type,
        service.primary_ip,
        service.protocol,
        service.status,
        service.port ? String(service.port) : null,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesStatus = statusFilter === "all" || service.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const activeCount = services.filter((service) => service.status === "active").length;
  const warningCount = services.filter((service) => service.status === "warning").length;
  const inactiveCount = services.filter((service) => service.status === "inactive").length;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setSelectedService(null);
    setForm({ device_id: "", name: "", port: "", protocol: "tcp", status: "active" });
  }

  function selectService(service: ServiceRecord) {
    setSelectedService(service);
    setShowForm(true);
    setMessage("");
    setError("");
    setForm({
      device_id: String(service.device_id),
      name: service.name,
      port: service.port ? String(service.port) : "",
      protocol: service.protocol,
      status: service.status,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedService ? !canUpdate : !canCreate) {
      return;
    }
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const payload = {
      device_id: Number(form.device_id),
      name: form.name,
      port: form.port ? Number(form.port) : null,
      protocol: form.protocol,
      status: form.status,
    };
    const endpoint = selectedService
      ? `${API_BASE_URL}/inventory/services/${selectedService.id}`
      : `${API_BASE_URL}/inventory/services`;

    try {
      const response = await fetch(endpoint, {
        method: selectedService ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(t("services.errors.save"));
        return;
      }

      setMessage(t(selectedService ? "services.updated" : "services.created"));
      resetForm();
      await onChanged();
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedService() {
    if (!selectedService || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      t("services.confirmDelete", {
        name: selectedService.name,
        device: selectedService.device_name,
      }),
    );
    if (!confirmed) {
      return;
    }
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/services/${selectedService.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      if (!response.ok) {
        setError(t("services.errors.delete"));
        return;
      }

      setMessage(t("services.deleted"));
      resetForm();
      setShowForm(false);
      await onChanged();
    } catch {
      setError(t("auth.apiUnavailable"));
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("services.title")}</h1>
          <p>{t("services.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action"
            onClick={() => {
              setShowForm((value) => !value);
              if (!showForm) {
                resetForm();
              }
            }}
          >
            <Plus size={18} strokeWidth={2} />
            {showForm ? t("common.hideForm") : t("services.new")}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label={t("services.summaryLabel")}>
        <article className="mini-stat">
          <strong>{services.length}</strong>
          <span>{t("services.title")}</span>
        </article>
        <article className="mini-stat green">
          <strong>{activeCount}</strong>
          <span>{t("values.states.active")}</span>
        </article>
        <article className="mini-stat orange">
          <strong>{warningCount}</strong>
          <span>{t("values.states.warning")}</span>
        </article>
        <article className="mini-stat gray">
          <strong>{inactiveCount}</strong>
          <span>{t("values.states.inactive")}</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("services.searchPlaceholder")}
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">{t("services.allStates")}</option>
              <option value="active">{t("values.states.active")}</option>
              <option value="warning">{t("values.states.warning")}</option>
              <option value="inactive">{t("values.states.inactive")}</option>
            </select>
            <span>{t("services.count", { count: filteredServices.length })}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("services.service")}</th>
                  <th>{t("ipMacs.device")}</th>
                  <th>IP</th>
                  <th>{t("services.port")}</th>
                  <th>{t("services.protocol")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <button
                        className="device-name row-action"
                        onClick={() => selectService(service)}
                      >
                        {service.name}
                      </button>
                    </td>
                    <td>{service.device_name}</td>
                    <td>{service.primary_ip ?? "-"}</td>
                    <td>{service.port ?? "-"}</td>
                    <td>{service.protocol.toUpperCase()}</td>
                    <td>
                      <span className={`mini-pill ${stateTone(service.status)}`}>
                        {stateLabel(service.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      {showForm && (selectedService ? canUpdate : canCreate) && (
          <article className="panel device-form-panel">
            <h2>{t(selectedService ? "services.edit" : "services.new")}</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label className="form-wide">
                {t("ipMacs.device")}
                <select
                  onChange={(event) => updateField("device_id", event.target.value)}
                  required
                  value={form.device_id}
                >
                  <option value="">{t("services.selectDevice")}</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name} - {deviceTypeLabel(device.device_type, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("services.service")}
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="SSH"
                  required
                  value={form.name}
                />
              </label>
              <label>
                {t("services.port")}
                <input
                  max={65535}
                  min={1}
                  onChange={(event) => updateField("port", event.target.value)}
                  placeholder="22"
                  type="number"
                  value={form.port}
                />
              </label>
              <label>
                {t("services.protocol")}
                <select
                  onChange={(event) => updateField("protocol", event.target.value)}
                  value={form.protocol}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="other">{t("services.otherProtocol")}</option>
                </select>
              </label>
              <label>
                {t("common.status")}
                <select
                  onChange={(event) => updateField("status", event.target.value)}
                  value={form.status}
                >
                  <option value="active">{t("values.states.active")}</option>
                  <option value="warning">{t("values.states.warning")}</option>
                  <option value="inactive">{t("values.states.inactive")}</option>
                </select>
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? t("common.saving")
                  : selectedService
                    ? t("services.save")
                    : t("services.create")}
              </button>
            </form>
            {selectedService && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedService}>
                {t("services.delete")}
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
