import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthView from "./HealthView";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const readyHealth = {
  status: "ready",
  service: "AE NetScope",
  environment: "local",
  version: "0.1.1-alpha",
  release_channel: "alpha",
  checked_at: "2026-06-03T18:00:00Z",
  checks: {
    api: { status: "ok", required: true, message: "API process is responding." },
    database: { status: "ok", required: true, message: "Database responded to SELECT 1." },
    redis: { status: "ok", required: true, message: "Redis ping succeeded." },
  },
};

describe("HealthView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(readyHealth))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows installed version and dependency health", async () => {
    render(<HealthView />);

    expect(screen.getByRole("heading", { name: "Estado del sistema" })).toBeInTheDocument();
    expect(await screen.findByText("v0.1.1-alpha")).toBeInTheDocument();
    expect(screen.getByText("Base de datos")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText("Database responded to SELECT 1.")).toBeInTheDocument();
    expect(screen.getByText("Redis ping succeeded.")).toBeInTheDocument();
  });

  it("refreshes health status on demand", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(readyHealth)));
    vi.stubGlobal("fetch", fetchMock);

    render(<HealthView />);
    await screen.findByText("v0.1.1-alpha");

    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an error when health cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 500))));

    render(<HealthView />);

    expect(await screen.findByText("No se pudo leer el estado del sistema.")).toBeInTheDocument();
  });
});
