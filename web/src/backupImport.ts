import { API_BASE_URL } from "./api";

export type BackupCounts = {
  vlans: number;
  networks: number;
  devices: number;
  interfaces: number;
  ip_addresses: number;
  services: number;
};

export type BackupPreview = {
  valid: boolean;
  mode: "replace";
  counts: BackupCounts;
  current_counts: BackupCounts;
  warnings: string[];
  errors: string[];
};

export type ImportResult = {
  status: "imported";
  counts: BackupCounts;
  previous_backup: unknown;
  previous_backup_filename: string;
};

export async function previewBackup(payload: unknown, csrfToken: string) {
  const response = await fetch(`${API_BASE_URL}/inventory/import/preview`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("preview-failed");
  }
  return (await response.json()) as BackupPreview;
}

export async function restoreBackupPayload(payload: unknown, csrfToken: string) {
  const response = await fetch(`${API_BASE_URL}/inventory/import.json`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("restore-failed");
  }
  return (await response.json()) as ImportResult;
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function countsSummary(counts: BackupCounts) {
  return `${counts.devices} dispositivos, ${counts.ip_addresses} IPs, ${counts.networks} subredes, ${counts.vlans} VLANs y ${counts.services} servicios`;
}
