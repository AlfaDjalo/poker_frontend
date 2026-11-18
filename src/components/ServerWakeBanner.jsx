import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

const SHOW_AFTER_MS = 2000;    // don't flash the banner if the server answers fast
const RETRY_MS = 3000;
const TIMEOUT_MS = 8000;       // per attempt
const GIVE_UP_MS = 120000;

const barStyle = {
    position: "fixed",
    left: 0,
    right: 0,
    top: "calc(var(--navbar-h, 56px) + env(safe-area-inset-top, 0px))",
    zIndex: 190,
    padding: "8px 14px",
    background: "#1a1208",
    borderBottom: "1px solid #f59e0b",
    color: "#f59e0b",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    textAlign: "center",
};

const ServerWakeBanner = () => {
    const [status, setStatus] = useState("checking"); // checking | ok | failed
    const [visible, setVisible] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const started = Date.now();
        setStatus("checking");
        setVisible(false);
        const showTimer = setTimeout(() => { if (!cancelled) setVisible(true); }, SHOW_AFTER_MS);

        (async () => {
            while (!cancelled) {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
                try {
                    const res = await fetch(`${API_BASE_URL}/health`, { signal: ctrl.signal });
                    if (res.ok) {
                        if (!cancelled) setStatus("ok");
                        return;
                    }
                } catch { /* sleeping, network, or CORS: retry */ }
                finally { clearTimeout(t); }

                if (Date.now() - started > GIVE_UP_MS) {
                    if (!cancelled) setStatus("failed");
                    return;
                }
                await new Promise(r => setTimeout(r, RETRY_MS));
            }
        })();

        return () => { cancelled = true; clearTimeout(showTimer); };
    }, [attempt]);

    if (status === "ok" || !visible) return null;

    return (
        <div style={barStyle} role="status" aria-live="polite">
            {status === "checking" ? (
                "⏳ Waking up the server (free tier, can take up to a minute)…"
            ) : (
                <>
                    ⚠ Can't reach the server.{" "}
                    <button
                        className="game-btn"
                        onClick={() => setAttempt(a => a + 1)}
                    >
                        Retry
                    </button>
                </>
            )}
        </div>
    );
};

export default ServerWakeBanner;