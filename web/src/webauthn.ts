function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeCredential(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return toBase64Url(value);
  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return toBase64Url(copy.buffer);
  }
  if (Array.isArray(value)) return value.map(normalizeCredential);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeCredential(item)]),
    );
  }
  return value;
}

export function credentialToJson(credential: PublicKeyCredential) {
  const response = credential.response;
  const common = {
    clientDataJSON: toBase64Url(response.clientDataJSON),
  };
  const serializedResponse = response instanceof AuthenticatorAttestationResponse
    ? {
        ...common,
        attestationObject: toBase64Url(response.attestationObject),
        transports: response.getTransports(),
      }
    : (() => {
        const assertion = response as AuthenticatorAssertionResponse;
        return {
        ...common,
        authenticatorData: toBase64Url(assertion.authenticatorData),
        signature: toBase64Url(assertion.signature),
        userHandle: assertion.userHandle ? toBase64Url(assertion.userHandle) : null,
        };
      })();
  return normalizeCredential({
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: serializedResponse,
  });
}

export function registrationOptionsFromJson(input: Record<string, unknown>) {
  const options = structuredClone(input) as Record<string, unknown> & {
    challenge: string | ArrayBuffer;
    user: { id: string | ArrayBuffer };
    excludeCredentials?: Array<Record<string, unknown>>;
  };
  options.challenge = fromBase64Url(String(options.challenge));
  options.user.id = fromBase64Url(String(options.user.id));
  options.excludeCredentials = (options.excludeCredentials ?? []).map(
    (item: Record<string, unknown>) => ({ ...item, id: fromBase64Url(String(item.id)) }),
  );
  return options as unknown as PublicKeyCredentialCreationOptions;
}

export function authenticationOptionsFromJson(input: Record<string, unknown>) {
  const options = structuredClone(input) as Record<string, unknown> & {
    challenge: string | ArrayBuffer;
    allowCredentials?: Array<Record<string, unknown>>;
  };
  options.challenge = fromBase64Url(String(options.challenge));
  options.allowCredentials = (options.allowCredentials ?? []).map(
    (item: Record<string, unknown>) => ({ ...item, id: fromBase64Url(String(item.id)) }),
  );
  return options as unknown as PublicKeyCredentialRequestOptions;
}
