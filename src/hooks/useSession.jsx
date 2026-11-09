import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import {
    getPlayer,
    getRecordingSetting,
    setRecordingSetting,
} from "../api/tableApi";

const STORAGE_KEY = "cap.playerId";

const SessionContext = createContext(null);

function readStoredId() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        const n = v == null ? NaN : Number(v);
        return Number.isInteger(n) ? n : null;
    } catch {
        return null;
    }
}

function writeStoredId(id) {
    try {
        if (id == null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, String(id));
    } catch { /* storage unavailable */ }
}

/**
 * Holds the active player (the `player_id` sent on every call) and the
 * global recording setting.
 *
 * player        - full player object (with bankroll) or null
 * playerId      - player.player_id or null
 * ready         - false until the stored player has been resolved
 * selectPlayer  - (player) => void   (also used for hot-seat switching)
 * clearPlayer   - () => void
 * refreshPlayer - () => Promise<void>  (re-fetch bankroll etc.)
 * recording     - { enabled: bool|null, loading: bool, error: string|null }
 * saveRecording - (enabled) => Promise<void>   (default for NEW tables only)
 */
export function SessionProvider({ children }) {
    const [player, setPlayer] = useState(null);
    const [ready, setReady] = useState(false);
    const [recording, setRecording] = useState({ enabled: null, loading: true, error: null });

    // Resolve stored player once.
    useEffect(() => {
        let cancelled = false;
        const id = readStoredId();
        if (id == null) { setReady(true); return undefined; }
        getPlayer(id)
            .then(p => { if (!cancelled) setPlayer(p); })
            .catch(e => {
                // 404 → player no longer exists; forget it.
                if (e.status === 404) writeStoredId(null);
            })
            .finally(() => { if (!cancelled) setReady(true); });
        return () => { cancelled = true; };
    }, []);

    // Global recording default.
    useEffect(() => {
        let cancelled = false;
        getRecordingSetting()
            .then(r => { if (!cancelled) setRecording({ enabled: !!r.enabled, loading: false, error: null }); })
            .catch(e => { if (!cancelled) setRecording({ enabled: null, loading: false, error: e.message }); });
        return () => { cancelled = true; };
    }, []);

    const selectPlayer = useCallback((p) => {
        setPlayer(p ?? null);
        writeStoredId(p?.player_id ?? null);
    }, []);

    const clearPlayer = useCallback(() => {
        setPlayer(null);
        writeStoredId(null);
    }, []);

    const refreshPlayer = useCallback(async () => {
        const id = player?.player_id;
        if (id == null) return;
        try { setPlayer(await getPlayer(id)); }
        catch (e) { if (e.status === 404) clearPlayer(); }
    }, [player?.player_id, clearPlayer]);

    const saveRecording = useCallback(async (enabled) => {
        const prev = recording.enabled;
        setRecording(r => ({ ...r, enabled, error: null }));      // optimistic
        try {
            const res = await setRecordingSetting(enabled);
            setRecording({ enabled: !!res.enabled, loading: false, error: null });
        } catch (e) {
            setRecording({ enabled: prev, loading: false, error: e.message });
            throw e;                                              // caller toasts
        }
    }, [recording.enabled]);

    const value = useMemo(() => ({
        player,
        playerId: player?.player_id ?? null,
        ready,
        selectPlayer,
        clearPlayer,
        refreshPlayer,
        recording,
        saveRecording,
    }), [player, ready, selectPlayer, clearPlayer, refreshPlayer, recording, saveRecording]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
    return ctx;
}