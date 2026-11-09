// src/api/authApi.js
export const API_BASE_URL = "http://localhost:8000";
export const WS_BASE_URL = "ws://localhost:8000";

const TOKEN_KEY = "cap.token";
const ADMIN_KEY = "cap.isAdmin";

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────

export class ApiError extends Error {
    constructor(status, message, { retryAfter = null } = {}) {
        super(message);
        this.status = status;
        this.detail = message;
        this.retryAfter = retryAfter; // seconds (429) or null
    }
    /** 401, or 403 "PIN required — log in" */
    get isAuthRequired() {
        return this.status === 401 || (this.status === 403 && /PIN required/i.test(this.detail ?? ""));
    }
    get isLockedOut() { return this.status === 429; }
}

// FastAPI 422 → detail is [{loc,msg}]; custom errors → string.
export function detailToMessage(detail, fallback) {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
        return detail
            .map(d => {
                if (typeof d === "string") return d;
                const field = Array.isArray(d.loc) ? d.loc.filter(p => p !== "body").join(".") : "";
                return field ? `${field}: ${d.msg}` : (d.msg ?? JSON.stringify(d));
            })
            .join("; ");
    }
    try { return JSON.stringify(detail); } catch { return fallback; }
}

// ─────────────────────────────────────────────
// Token storage (+ change subscription for AuthContext)
// ─────────────────────────────────────────────

const listeners = new Set();
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });
export const subscribeAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function getStoredIsAdmin() {
    try { return localStorage.getItem(ADMIN_KEY) === "1"; } catch { return false; }
}
export function storeAuth(token, isAdmin = false) {
    try {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(ADMIN_KEY, isAdmin ? "1" : "0");
        } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ADMIN_KEY);
        }
    } catch { /* storage unavailable */ }
    notify();
}
export const clearStoredAuth = () => storeAuth(null);

/** Append &token= / ?token= to a WebSocket URL when logged in. */
export function withToken(url) {
    const t = getToken();
    if (!t) return url;
    return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}`;
}

// ─────────────────────────────────────────────
// Central fetch wrapper
// ─────────────────────────────────────────────

export const qs = (params) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") p.append(k, v);
    });
    const s = p.toString();
    return s ? `?${s}` : "";
};

/**
 * request(method, path, body?, { token? })
 * Sends Authorization: Bearer <token> whenever one exists
 * (pass opts.token to override, e.g. right after login).
 */
export async function request(method, path, body, opts = {}) {
    const token = opts.token !== undefined ? opts.token : getToken();
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError(0, "Cannot reach the server.");
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const ra = Number(res.headers.get("Retry-After"));
        throw new ApiError(
            res.status,
            detailToMessage(data?.detail, `Request failed (${res.status})`),
            { retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null }
        );
    }
    return res.status === 204 ? null : res.json();
}

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

/** -> { player: {...}|null, is_admin: bool }. Stale token => anonymous (never throws on 401). */
export async function fetchMe() {
    try {
        const me = await request("GET", "/auth/me");
        return { player: me?.player ?? null, is_admin: !!me?.is_admin };
    } catch (e) {
        if (e.status === 401) return { player: null, is_admin: false };
        throw e;
    }
}

/** -> { token, player }. Stores token on success. */
export async function login(playerId, pin) {
    const body = { player_id: playerId };
    if (pin) body.pin = pin;
    const res = await request("POST", "/auth/login", body, { token: null });
    storeAuth(res.token, false);
    return res;
}

export async function logout() {
    try { await request("POST", "/auth/logout"); }
    catch { /* best-effort; clear locally regardless */ }
    clearStoredAuth();
}

/** -> { token, is_admin:true }. 503 = admin disabled (detail surfaced). */
export async function adminLogin(password) {
    const res = await request("POST", "/auth/admin-login", { password }, { token: null });
    storeAuth(res.token, true);
    return res;
}

// ─────────────────────────────────────────────
// Profile (self)
// ─────────────────────────────────────────────

/** Send only the fields provided. 409 name taken, 422 invalid. */
export const updateProfile = (playerId, { name, avatar } = {}) => {
    const body = {};
    if (name !== undefined) body.name = name;
    if (avatar !== undefined) body.avatar = avatar;
    return request("PATCH", `/players/${playerId}`, body);
};

/** newPin: 4-12 digit string, or null to remove. currentPin required if a PIN exists. */
export const setPin = (playerId, { currentPin, newPin }) => {
    const body = { new_pin: newPin ?? null };
    if (currentPin) body.current_pin = currentPin;
    return request("PUT", `/players/${playerId}/pin`, body);
};

export const isValidPin = (v) => /^\d{4,12}$/.test(v ?? "");