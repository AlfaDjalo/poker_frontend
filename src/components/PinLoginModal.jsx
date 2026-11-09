// src/components/PinLoginModal.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ToastProvider";
import { getPlayer } from "../api/tableApi";
import "../css/AuthModal.css";

const PinLoginModal = () => {
    const { pendingLogin, resolveLogin, login } = useAuth();
    const toast = useToast();

    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [lockLeft, setLockLeft] = useState(0);

    const playerId = pendingLogin?.playerId ?? null;

    // Reset + load player name each time the modal opens.
    useEffect(() => {
        if (playerId == null) return undefined;
        setPin(""); setError(null); setLockLeft(0); setBusy(false);
        let cancelled = false;
        getPlayer(playerId)
            .then(p => { if (!cancelled) setName(p.name); })
            .catch(() => { if (!cancelled) setName(`Player #${playerId}`); });
        return () => { cancelled = true; };
    }, [playerId]);

    // Retry-After countdown.
    useEffect(() => {
        if (lockLeft <= 0) return undefined;
        const id = setTimeout(() => setLockLeft(s => s - 1), 1000);
        return () => clearTimeout(id);
    }, [lockLeft]);

    if (playerId == null) return null;

    const submit = async () => {
        if (busy || lockLeft > 0 || !pin) return;
        setBusy(true);
        setError(null);
        try {
            await login(playerId, pin);
            resolveLogin(true);
        } catch (e) {
            if (e.status === 429) {
                setLockLeft(e.retryAfter ?? 60);
                setError(e.detail);
            } else {
                setError(e.detail ?? e.message);
                toast.error(e);
            }
            setPin("");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-modal__backdrop" onClick={() => resolveLogin(false)}>
            <div
                className="auth-modal"
                role="dialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
            >
                <div className="auth-modal__title">🔒 PIN required</div>
                <div className="auth-modal__hint">
                    Log in as <strong>{name || "…"}</strong> to continue.
                </div>

                <input
                    className="auth-modal__input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    autoFocus
                    maxLength={12}
                    placeholder="PIN"
                    value={pin}
                    disabled={busy || lockLeft > 0}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => { if (e.key === "Enter") submit(); }}
                />

                {lockLeft > 0 ? (
                    <div className="auth-modal__error">
                        Too many attempts. Try again in {lockLeft}s.
                    </div>
                ) : error ? (
                    <div className="auth-modal__error">{error}</div>
                ) : null}

                <div className="auth-modal__actions">
                    <button className="game-btn" onClick={() => resolveLogin(false)} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        className="game-btn auth-modal__ok"
                        onClick={submit}
                        disabled={busy || lockLeft > 0 || !pin}
                    >
                        {busy ? "…" : "Log in"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PinLoginModal;