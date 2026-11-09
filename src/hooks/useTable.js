import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, subscribeAuth } from "../api/authApi";

import {
    getTable,
    normalizeTableState,
    tableSocketUrl,
} from "../api/tableApi";

const PING_MS = 20000;
const POLL_MS = 1000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_EVENTS = 300;

// Merge event lists by id (REST responses may repeat events; the socket sends
// only new ones). Sorted by id, capped.
function mergeEvents(prev, incoming) {
    if (!incoming || incoming.length === 0) return prev;
    const byId = new Map(prev.map(e => [e.id, e]));
    let changed = false;
    for (const e of incoming) {
        if (!byId.has(e.id)) { byId.set(e.id, e); changed = true; }
    }
    if (!changed) return prev;
    const merged = [...byId.values()].sort((a, b) => a.id - b.id);
    return merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged;
}

/**
 * useTable(tableId, viewerPlayerId)
 *
 * Returns:
 *   state       - normalized TableStateDTO (without `events`), or null
 *   events      - accumulated local event log
 *   connection  - "idle" | "connecting" | "open" | "reconnecting" | "closed"
 *   notFound    - true on 404 / ws close 4404 (return to lobby)
 *   closed      - true once the table is CLOSED
 *   apply(s)    - apply a (normalized) state returned by a REST mutation
 *   refresh()   - ask the server for a fresh full state
 */
export function useTable(tableId, viewerPlayerId = null) {
    const [state, setState] = useState(null);
    const [events, setEvents] = useState([]);
    const [connection, setConnection] = useState("idle");
    const [notFound, setNotFound] = useState(false);
    const [closed, setClosed] = useState(false);

    const lastEventIdRef = useRef(0);
    const wsRef = useRef(null);
    const tableRef = useRef(null);
    const viewerRef = useRef(viewerPlayerId);
    viewerRef.current = viewerPlayerId;

    // Re-run the connection effect whenever the stored token changes
    // (login / logout / re-login after expiry) so the WS reconnects with it.
    const [token, setToken] = useState(getToken());
    useEffect(() => subscribeAuth(() => setToken(getToken())), []);

    // Take an already-normalized state.
    const apply = useCallback((s) => {
        if (!s) return;
        const { events: incoming, ...rest } = s;
        setEvents(prev => mergeEvents(prev, incoming));
        if (typeof s.last_event_id === "number") {
            lastEventIdRef.current = Math.max(lastEventIdRef.current, s.last_event_id);
        }
        setState(rest);
        if (s.table?.status === "CLOSED") setClosed(true);
    }, []);

    const fetchState = useCallback(async () => {
        const s = await getTable(tableId, viewerRef.current, lastEventIdRef.current);
        return s;
    }, [tableId]);

    const refresh = useCallback(async () => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send("refresh");
            return;
        }
        try { apply(await fetchState()); }
        catch (e) { if (e.status === 404) setNotFound(true); }
    }, [apply, fetchState]);

    // ── Connection lifecycle ─────────────────────────────────────
    useEffect(() => {
        if (tableId == null) return undefined;

        // New table → reset local log. Same table, new viewer → keep it.
        if (tableRef.current !== tableId) {
            tableRef.current = tableId;
            lastEventIdRef.current = 0;
            setEvents([]);
            setState(null);
            setNotFound(false);
            setClosed(false);
        }

        let cancelled = false;
        let attempt = 0;
        let reconnectTimer = null;
        let pingTimer = null;

        const clearTimers = () => {
            if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        };

        const connect = () => {
            if (cancelled) return;
            setConnection(attempt === 0 ? "connecting" : "reconnecting");

            let ws;
            try {
                ws = new WebSocket(
                    tableSocketUrl(tableId, viewerRef.current, lastEventIdRef.current)
                );
            } catch {
                scheduleReconnect();
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => {
                if (cancelled) return;
                attempt = 0;
                setConnection("open");
                pingTimer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
                }, PING_MS);
            };

            ws.onmessage = (ev) => {
                if (cancelled) return;
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                if (msg?.type === "state" && msg.data) {
                    apply(normalizeTableState(msg.data));
                }
            };

            ws.onclose = (ev) => {
                if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
                if (wsRef.current === ws) wsRef.current = null;
                if (cancelled) return;
                if (ev.code === 4404) {
                    setNotFound(true);
                    setConnection("closed");
                    return;
                }
                if (ev.code === 1000) {
                    setClosed(true);
                    setConnection("closed");
                    return;
                }
                scheduleReconnect();
            };

            ws.onerror = () => { /* onclose follows */ };
        };

        const scheduleReconnect = () => {
            if (cancelled) return;
            setConnection("reconnecting");
            const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
            attempt += 1;
            reconnectTimer = setTimeout(connect, delay);
        };

        // Initial REST fetch (fast first paint + 404 detection), then socket.
        (async () => {
            setConnection("connecting");
            try {
                const s = await fetchState();
                if (cancelled) return;
                apply(s);
            } catch (e) {
                if (cancelled) return;
                if (e.status === 404) {
                    setNotFound(true);
                    setConnection("closed");
                    return;
                }
                // other errors: polling fallback + socket retry will cover it
            }
            connect();
        })();

        return () => {
            cancelled = true;
            clearTimers();
            const ws = wsRef.current;
            wsRef.current = null;
            if (ws) {
                ws.onclose = null;
                ws.onmessage = null;
                try { ws.close(); } catch { /* ignore */ }
            }
            setConnection("idle");
        };
    }, [tableId, viewerPlayerId, token, apply, fetchState]);

    // ── Polling fallback while the socket isn't open ─────────────
    useEffect(() => {
        if (tableId == null || notFound || closed) return undefined;
        if (connection === "open" || connection === "idle" || connection === "closed") {
            return undefined;
        }
        let cancelled = false;
        const id = setInterval(async () => {
            try {
                const s = await fetchState();
                if (!cancelled) apply(s);
            } catch (e) {
                if (!cancelled && e.status === 404) setNotFound(true);
            }
        }, POLL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [tableId, connection, notFound, closed, apply, fetchState]);

    return { state, events, connection, notFound, closed, apply, refresh };
}

/**
 * useNow(active, ms) — re-renders every `ms` and returns Date.now().
 * Use with secondsLeft(deadline, now) for countdowns.
 */
export function useNow(active = true, ms = 1000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return undefined;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(id);
    }, [active, ms]);
    return now;
}