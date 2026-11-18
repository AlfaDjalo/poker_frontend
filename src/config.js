// src/config.js
// Single source of truth for the backend location.
// Vite inlines import.meta.env.* at BUILD time: changing VITE_API_URL
// on Render requires a redeploy (rebuild).

const raw = (import.meta.env.VITE_API_URL || "http://localhost:8000").trim();

// No trailing slash.
export const API_BASE_URL = raw.replace(/\/+$/, "");

// http -> ws, https -> wss (derived, never hardcoded separately).
export const WS_BASE_URL = API_BASE_URL.replace(/^http/i, "ws");

// Guard: an https page can't talk to an http backend (mixed content),
// except localhost.
if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    API_BASE_URL.startsWith("http://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)/.test(API_BASE_URL)
) {
    // eslint-disable-next-line no-console
    console.error(
        `[CAP] VITE_API_URL (${API_BASE_URL}) is http:// but this page is https:// — the browser will block it.`
    );
}