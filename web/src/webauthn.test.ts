import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticationOptionsFromJson,
  credentialToJson,
  registrationOptionsFromJson,
} from "./webauthn";

function bytes(value: BufferSource) {
  const view = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Array.from(view);
}

function buffer(...values: number[]) {
  return Uint8Array.from(values).buffer;
}

describe("WebAuthn serialization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes registration options without mutating the API payload", () => {
    const input = {
      challenge: "AQID",
      user: { id: "BAUG", name: "admin@example.com", displayName: "admin" },
      excludeCredentials: [{ id: "BwgJ", type: "public-key" }],
    };

    const result = registrationOptionsFromJson(input);

    expect(bytes(result.challenge)).toEqual([1, 2, 3]);
    expect(bytes(result.user.id)).toEqual([4, 5, 6]);
    expect(bytes(result.excludeCredentials![0].id)).toEqual([7, 8, 9]);
    expect(input.challenge).toBe("AQID");
  });

  it("decodes authentication options with and without allowed credentials", () => {
    const withCredentials = authenticationOptionsFromJson({
      challenge: "AQI",
      allowCredentials: [{ id: "AwQ", type: "public-key" }],
    });
    const withoutCredentials = authenticationOptionsFromJson({ challenge: "BQY" });

    expect(bytes(withCredentials.challenge)).toEqual([1, 2]);
    expect(bytes(withCredentials.allowCredentials![0].id)).toEqual([3, 4]);
    expect(bytes(withoutCredentials.challenge)).toEqual([5, 6]);
    expect(withoutCredentials.allowCredentials).toEqual([]);
  });

  it("serializes attestation credentials and nested binary extension values", () => {
    class AttestationResponse {
      clientDataJSON = buffer(1, 2);
      attestationObject = buffer(3, 4);
      getTransports = () => ["internal"];
    }
    vi.stubGlobal("AuthenticatorAttestationResponse", AttestationResponse);

    const result = credentialToJson({
      id: "credential-id",
      rawId: buffer(5, 6),
      type: "public-key",
      authenticatorAttachment: "platform",
      response: new AttestationResponse(),
      getClientExtensionResults: () => ({ nested: [new Uint8Array([7, 8])] }),
    } as unknown as PublicKeyCredential) as Record<string, unknown>;

    expect(result).toMatchObject({
      id: "credential-id",
      rawId: "BQY",
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: { nested: ["Bwg"] },
      response: {
        clientDataJSON: "AQI",
        attestationObject: "AwQ",
        transports: ["internal"],
      },
    });
  });

  it("serializes assertion credentials with present and absent user handles", () => {
    class AttestationResponse {}
    vi.stubGlobal("AuthenticatorAttestationResponse", AttestationResponse);
    const makeCredential = (userHandle: ArrayBuffer | null) => ({
      id: "assertion-id",
      rawId: buffer(1),
      type: "public-key",
      authenticatorAttachment: null,
      response: {
        clientDataJSON: buffer(2),
        authenticatorData: buffer(3),
        signature: buffer(4),
        userHandle,
      },
      getClientExtensionResults: () => ({}),
    });

    const withHandle = credentialToJson(
      makeCredential(buffer(5)) as unknown as PublicKeyCredential,
    ) as Record<string, unknown>;
    const withoutHandle = credentialToJson(
      makeCredential(null) as unknown as PublicKeyCredential,
    ) as Record<string, unknown>;

    expect(withHandle.response).toEqual({
      clientDataJSON: "Ag",
      authenticatorData: "Aw",
      signature: "BA",
      userHandle: "BQ",
    });
    expect(withoutHandle.response).toEqual({
      clientDataJSON: "Ag",
      authenticatorData: "Aw",
      signature: "BA",
      userHandle: null,
    });
  });
});
