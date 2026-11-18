import { API_BASE_URL } from "./api";

// Requests that answer 401 for a reason other than an ended session.
const CREDENTIAL_CHECK_PATHS = [
  "/auth/login",
  "/auth/me",
  "/auth/setup",
  "/security/passkeys/authenticate/",
];

/**
 * Report an API 401 from any view, so an ended session returns to sign-in instead of
 * every action failing with a generic error. Returns a function that removes the watch.
 */
export function watchForEndedSession(onEnded: () => void): () => void {
  const originalFetch = window.fetch;
  const watchedFetch: typeof window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (response.status === 401) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.startsWith(API_BASE_URL) ? url.slice(API_BASE_URL.length) : null;
      if (path !== null && !CREDENTIAL_CHECK_PATHS.some((prefix) => path.startsWith(prefix))) {
        onEnded();
      }
    }
    return response;
  };
  window.fetch = watchedFetch;
  return () => {
    if (window.fetch === watchedFetch) window.fetch = originalFetch;
  };
}
