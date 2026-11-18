import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceDetail, DeviceRecord } from "../types";
import DevicesView from "./DevicesView";

function device(id: number, name: string, status = "active"): DeviceRecord {
  return {
    id,
    name,
    device_type: "server",
    status,
    vendor: null,
    model: null,
    serial_number: null,
    asset_tag: null,
    operating_system: null,
    firmware_version: null,
    cpu: null,
    memory: null,
    storage: null,
    warranty_expires: null,
    owner: null,
    rack_position: null,
    location: null,
    notes: null,
    primary_ip: null,
    primary_mac: null,
  };
}

function detail(record: DeviceRecord): DeviceDetail {
  return { ...record, interfaces: [] };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const allPermissions = ["devices:create", "devices:update", "devices:delete"];

function renderDevices(devices: DeviceRecord[], permissions = allPermissions) {
  return render(
    <DevicesView
      csrfToken="csrf"
      devices={devices}
      networks={[]}
      onCreated={vi.fn(() => Promise.resolve())}
      permissions={permissions}
    />,
  );
}

describe("DevicesView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the device opened last when an earlier detail answers later", async () => {
    const user = userEvent.setup();
    let releaseFirst: (response: Response) => void = () => undefined;
    const first = device(1, "SLOW-01");
    const second = device(2, "FAST-02");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input.endsWith("/devices/1")
          ? new Promise<Response>((resolve) => {
              releaseFirst = resolve;
            })
          : Promise.resolve(jsonResponse(detail(second))),
      ),
    );
    renderDevices([first, second]);

    await user.click(screen.getByRole("button", { name: "SLOW-01" }));
    await user.click(screen.getByRole("button", { name: "FAST-02" }));
    expect(await screen.findByRole("heading", { name: "FAST-02" })).toBeInTheDocument();
    releaseFirst(jsonResponse(detail(first)));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("heading", { name: "FAST-02" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "SLOW-01" })).not.toBeInTheDocument();
  });

  it("reports a network failure while saving and explains API validation errors", async () => {
    const user = userEvent.setup();
    const record = device(1, "SRV-01");
    let saveAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          saveAttempts += 1;
          return saveAttempts === 1
            ? Promise.reject(new Error("offline"))
            : Promise.resolve(
                jsonResponse(
                  { detail: [{ msg: "Value error, Warranty expiry must be a date in YYYY-MM-DD format." }] },
                  422,
                ),
              );
        }
        return Promise.resolve(jsonResponse(detail(record)));
      }),
    );
    renderDevices([record]);
    await user.click(screen.getByRole("button", { name: "SRV-01" }));
    await screen.findByRole("heading", { name: "SRV-01" });

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Could not connect to the API."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Enter the warranty expiry as a date, such as 2028-12-31."),
    ).toBeInTheDocument();
  });

  it("asks before deactivating and hides the action on inactive devices", async () => {
    const user = userEvent.setup();
    const active = device(1, "SW-01");
    const fetchMock = vi.fn((_input: string, init?: RequestInit) =>
      Promise.resolve(
        jsonResponse(init?.method === "POST" ? detail({ ...active, status: "inactive" }) : detail(active)),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderDevices([active]);
    await user.click(screen.getByRole("button", { name: "SW-01" }));
    await screen.findByRole("heading", { name: "SW-01" });

    await user.click(screen.getByRole("button", { name: "Deactivate device" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Deactivate device" }));
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Delete device" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate device" })).not.toBeInTheDocument();
  });

  it("colors the status dot by status and limits field lengths", async () => {
    const user = userEvent.setup();
    renderDevices([device(1, "ON", "active"), device(2, "OFF", "inactive"), device(3, "HOLD", "reserved")]);

    const dot = (name: string) =>
      within(screen.getByRole("button", { name }).closest("tr") as HTMLElement)
        .getByText((_, element) => element?.classList.contains("status-dot") ?? false);
    expect(dot("ON")).toHaveClass("green");
    expect(dot("OFF")).toHaveClass("gray");
    expect(dot("HOLD")).toHaveClass("orange");

    await user.click(screen.getByRole("button", { name: "New device" }));
    expect(screen.getAllByLabelText("Name")[0]).toHaveAttribute("maxLength", "120");
  });

  it("edits every field of a device and deletes it after confirmation", async () => {
    const user = userEvent.setup();
    const record = device(1, "SRV-01");
    const onCreated = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      if (init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ ...detail(record), ...JSON.parse(init.body as string) }));
      }
      return Promise.resolve(jsonResponse(detail(record)));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DevicesView
        csrfToken="csrf"
        devices={[record]}
        networks={[]}
        onCreated={onCreated}
        permissions={allPermissions}
      />,
    );
    await user.click(screen.getByRole("button", { name: "SRV-01" }));
    await screen.findByRole("heading", { name: "SRV-01" });

    const panel = screen.getByRole("heading", { name: "SRV-01" }).closest("article") as HTMLElement;
    for (const input of within(panel).getAllByRole("textbox")) {
      if ((input as HTMLInputElement).value === "SRV-01") continue;
      await user.type(input, "x");
    }
    await user.selectOptions(within(panel).getAllByRole("combobox")[1], "reserved");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(
      fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")![1]!.body as string,
    );
    expect(saved).toMatchObject({ status: "reserved", vendor: "x", location: "x", notes: "x" });

    await user.click(screen.getByRole("button", { name: "Delete device" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "SRV-01" })).not.toBeInTheDocument(),
    );
    expect(onCreated).toHaveBeenCalledTimes(2);
  });
});
