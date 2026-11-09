import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import "../css/Toast.css";

const ToastContext = createContext(null);

const DEFAULT_MS = { error: 6000, warning: 5000, success: 3000, info: 4000 };
const MAX_TOASTS = 5;

/**
 * useToast() -> {
 *   toast(message, { type?, duration? }),
 *   error(errOrMessage),   // accepts ApiError / Error / string; shows `detail` verbatim
 *   success(message), info(message), warning(message),
 *   dismiss(id)
 * }
 * type: "error" | "warning" | "success" | "info"
 * duration: ms; 0 = sticky until dismissed.
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);
    const timers = useRef(new Map());

    const dismiss = useCallback((id) => {
        const t = timers.current.get(id);
        if (t) { clearTimeout(t); timers.current.delete(id); }
        setToasts(prev => prev.filter(x => x.id !== id));
    }, []);

    const arm = useCallback((id, duration) => {
        const old = timers.current.get(id);
        if (old) clearTimeout(old);
        if (duration > 0) {
            timers.current.set(id, setTimeout(() => dismiss(id), duration));
        }
    }, [dismiss]);

    const toast = useCallback((message, { type = "info", duration } = {}) => {
        const text = String(message ?? "").trim();
        if (!text) return null;
        const ms = duration ?? DEFAULT_MS[type] ?? 4000;

        let id = null;
        setToasts(prev => {
            // Identical message already showing → refresh it, don't stack.
            const dup = prev.find(t => t.text === text && t.type === type);
            if (dup) { id = dup.id; return prev; }
            id = nextId.current++;
            const next = [...prev, { id, text, type }];
            return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
        });
        // setState updater runs synchronously enough for id; guard anyway.
        if (id != null) arm(id, ms);
        return id;
    }, [arm]);

    const error = useCallback((e, opts) => {
        const msg = typeof e === "string" ? e : (e?.detail && typeof e.detail === "string" ? e.detail : e?.message);
        return toast(msg || "Something went wrong.", { type: "error", ...opts });
    }, [toast]);

    const success = useCallback((m, o) => toast(m, { type: "success", ...o }), [toast]);
    const info    = useCallback((m, o) => toast(m, { type: "info", ...o }), [toast]);
    const warning = useCallback((m, o) => toast(m, { type: "warning", ...o }), [toast]);

    // Clear all timers on unmount.
    useEffect(() => {
        const map = timers.current;
        return () => { map.forEach(clearTimeout); map.clear(); };
    }, []);

    const value = useMemo(
        () => ({ toast, error, success, info, warning, dismiss }),
        [toast, error, success, info, warning, dismiss]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-stack" aria-live="polite" aria-atomic="false">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast toast--${t.type}`}
                        role={t.type === "error" ? "alert" : "status"}
                    >
                        <span className="toast__text">{t.text}</span>
                        <button
                            type="button"
                            className="toast__close"
                            aria-label="Dismiss"
                            onClick={() => dismiss(t.id)}
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
    return ctx;
}