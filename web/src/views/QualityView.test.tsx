import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InventoryQualityReport } from "../types";
import QualityView from "./QualityView";

const report: InventoryQualityReport = {
  score: 72,
  status: "attention",
  records_reviewed: 12,
  checks_completed: 20,
  checks_passed: 14,
  issue_counts: { critical: 0, warning: 2, info: 1 },
  issues_total: 3,
  issues_truncated: false,
  relationships: {
    device_ip_links: 3,
    ip_network_links: 4,
    network_vlan_links: 2,
    disconnected_devices: 1,
    unassigned_ips: 1,
  },
  issues: [
    {
      code: "device_no_ip",
      severity: "warning",
      resource_type: "device",
      resource_id: 10,
      resource_name: "SW-Core-01",
      context: {},
    },
    {
      code: "ip_no_network",
      severity: "warning",
      resource_type: "ip_address",
      resource_id: 20,
      resource_name: "10.0.8.5",
      context: {},
    },
    {
      code: "network_no_gateway",
      severity: "info",
      resource_type: "network",
      resource_id: 30,
      resource_name: "10.0.9.0/24",
      context: {},
    },
  ],
};

describe("QualityView", () => {
  it("shows the score, relationships, and opens affected records", async () => {
    const user = userEvent.setup();
    const openIssue = vi.fn();
    render(<QualityView onOpenIssue={openIssue} onRefresh={vi.fn()} quality={report} />);

    expect(screen.getByRole("heading", { name: "Inventory quality" })).toBeInTheDocument();
    expect(screen.getByLabelText("Inventory quality score: 72 out of 100")).toBeInTheDocument();
    expect(screen.getByText("Devices linked to an IP")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /SW-Core-01/ }));
    expect(openIssue).toHaveBeenCalledWith(report.issues[0]);
  });

  it("filters findings by severity and refreshes the report", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn(() => Promise.resolve());
    render(<QualityView onOpenIssue={vi.fn()} onRefresh={refresh} quality={report} />);

    await user.click(screen.getByRole("button", { name: "Suggestions" }));
    expect(screen.getByText("10.0.9.0/24")).toBeInTheDocument();
    expect(screen.queryByText("SW-Core-01")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run checks" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows a recoverable unavailable state", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn(() => Promise.resolve());
    render(<QualityView onOpenIssue={vi.fn()} onRefresh={refresh} quality={null} />);

    expect(screen.getByText("Quality report unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run checks" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
