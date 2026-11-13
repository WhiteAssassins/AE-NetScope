const SIGNED_IN_STORAGE_KEY = "ae_netscope_signed_in";

// Remembers that this browser had an active session, so a later 401 can be reported as an
// expired session instead of greeting first-time visitors with that message.
export function rememberSignedIn(signedIn: boolean) {
  try {
    if (signedIn) {
      window.localStorage.setItem(SIGNED_IN_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(SIGNED_IN_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in private windows; the hint is optional.
  }
}

export function wasSignedIn() {
  try {
    return window.localStorage.getItem(SIGNED_IN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
