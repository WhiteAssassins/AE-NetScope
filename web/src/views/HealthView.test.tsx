import { act, render, screen } from "@testing-library/react";
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
  version: "0.1.7-alpha",
  release_channel: "alpha",
  checked_at: "2026-06-03T18:00:00Z",
  duration_ms: 8.4,
  checks: {
    api: {
      status: "ok",
      required: true,
      message: "API process is responding.",
      message_code: "health.checkMessages.apiOk",
      latency_ms: 0,
    },
    database: {
      status: "ok",
      required: true,
      message: "Database responded to SELECT 1.",
      message_code: "health.checkMessages.databaseOk",
      latency_ms: 4.2,
    },
    redis: {
      status: "ok",
      required: true,
      message: "Redis ping succeeded.",
      message_code: "health.checkMessages.redisOk",
      latency_ms: 3.1,
    },
  },
};

describe("HealthView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(readyHealth))));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a useful operational summary and dependency latency", async () => {
    render(<HealthView />);

    expect(screen.getByRole("heading", { name: "System status" })).toBeInTheDocument();
    expect(await screen.findByText("v0.1.7-alpha")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("The database responded successfully.")).toBeInTheDocument();
    expect(screen.getByText("4.2 ms")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/api/health/ready" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/health/ready"),
    );
  });

  it("refreshes health status on demand", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(readyHealth)));
    vi.stubGlobal("fetch", fetchMock);

    render(<HealthView />);
    await screen.findByText("v0.1.7-alpha");

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes automatically every 30 seconds while enabled", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(readyHealth)));
    vi.stubGlobal("fetch", fetchMock);

    render(<HealthView />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("highlights degraded required dependencies", async () => {
    const degradedHealth = {
      ...readyHealth,
      status: "degraded",
      checks: {
        ...readyHealth.checks,
        redis: {
          status: "error",
          required: true,
          message: "Redis ping failed.",
          message_code: "health.checkMessages.redisError",
          latency_ms: 12.5,
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(degradedHealth))));

    render(<HealthView />);

    expect(await screen.findByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("The Redis check failed.")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows a retry action when health cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 500))));

    render(<HealthView />);

    expect(await screen.findByText("System status could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
