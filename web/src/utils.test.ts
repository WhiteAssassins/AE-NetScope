import { describe, expect, it } from "vitest";
import { hasPermission, stateLabel, stateTone, titleCase, typeTone } from "./utils";

describe("utils", () => {
  it("formats simple labels without changing unknown values", () => {
    expect(titleCase("router")).toBe("Router");
    expect(stateLabel("active")).toBe("Activa");
    expect(stateLabel("reserved")).toBe("Reservada");
    expect(stateLabel("unknown")).toBe("Unknown");
  });

  it("maps state values to stable visual tones", () => {
    expect(stateTone("active")).toBe("green");
    expect(stateTone("reserved")).toBe("orange");
    expect(stateTone("unassigned")).toBe("gray");
  });

  it("maps expanded device types to the expected visual tones", () => {
    expect(typeTone("Servidor")).toBe("server");
    expect(typeTone("Cámara IP")).toBe("camera");
    expect(typeTone("Virtualización")).toBe("storage");
    expect(typeTone("Firewall")).toBe("security");
    expect(typeTone("Equipo")).toBe("workstation");
    expect(typeTone("Switch")).toBe("network");
  });

  it("checks permissions exactly", () => {
    expect(hasPermission(["inventory:read", "devices:update"], "devices:update")).toBe(true);
    expect(hasPermission(["inventory:read"], "devices:update")).toBe(false);
  });
});
