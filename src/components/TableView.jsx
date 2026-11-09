import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import PokerTable from "./PokerTable";
import TableActions from "./TableActions";
import VariantPickModal from "./VariantPickModal";
import SideSheet from "./SideSheet";
import PlayerPicker from "./PlayerPicker";
import { useToast } from "./ToastProvider";
import { useSession } from "../hooks/useSession";
import { useAuth } from "../hooks/useAuth";
import { useAuthRetry } from "../hooks/useAuthRetry";
import { useTable, useNow } from "../hooks/useTable";
import {
    switchSeat, leaveTable, sitOut, cancelSitOut, sitIn, startHand, closeTable, secondsLeft,
} from "../api/tableApi";


import "../css/GameSimulator.css";
import "../css/TableView.css";

const label = (v) => (v ? String(v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—");
const EMPTY = [];
const FIRST_DEAL_MS = 1000;   // hand 1: deal almost immediately
const NEXT_DEAL_MS  = 4000;   // pause after a hand ends

// ── Event log ────────────────────────────────────────────────
const EventLog = ({ events }) => {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [events.length]);
    return (
        <div className="table-log" ref={ref}>
            {events.length === 0 && <div className="table-log__empty">No events yet.</div>}
            {events.map(e => (
                <div key={e.id} className={`table-log__row table-log__row--${e.type}`}>
                    <span className="table-log__time">
                        {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>
                        {e.type === "admin" && <span className="table-log__admin-tag">ADMIN</span>}
                        {e.text}
                    </span>
                </div>
            ))}
        </div>
    );
};

// ── Main ─────────────────────────────────────────────────────
const TableView = () => {
    const { id } = useParams();
    const tableId = Number(id);
    const navigate = useNavigate();
    const toast = useToast();
    const { playerId, refreshPlayer } = useSession();
    const { requestLogin } = useAuth();
    const withAuthRetry = useAuthRetry(playerId);

    const { state, events, connection, notFound, closed, apply, refresh } =
        useTable(Number.isInteger(tableId) ? tableId : null, playerId);

    // dialog: null | {type:"sit",seat} | {type:"rebuy"} | {type:"addon"} | {type:"variant"}
    const [dialog, setDialog] = useState(null);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState(EMPTY);   // cards chosen for CARD_SELECT / CARD_PASS
    const [dealAt, setDealAt] = useState(null);        // epoch ms of the scheduled auto-deal

    const table = state?.table;
    const seats = state?.seats ?? EMPTY;
    const viewer = state?.viewer;
    const can = viewer?.can ?? {};
    const hand = state?.hand ?? null;
    const decision = hand?.decision ?? null;
    const domain = decision?.domain ?? null;

    const needsNow = !!(table?.pick_deadline || dealAt || seats.some(s => s.rebuy_deadline));
    const now = useNow(needsNow);

    // ── Auto-deal ────────────────────────────────────────────
    // Re-arms whenever the table lands in STARTING for a new hand number.
    // Not armed while a variant pick is pending (can.start is false then).
    const dealKey = can.start && table?.status === "STARTING"
        ? `${table.id}|${table.hand_number}|${table.orbit_number}`
        : null;

    useEffect(() => {
        if (!dealKey) { setDealAt(null); return undefined; }
        const delay = table.hand_number > 0 ? NEXT_DEAL_MS : FIRST_DEAL_MS;
        setDealAt(Date.now() + delay);
        const t = setTimeout(async () => {
            setDealAt(null);
            try {
                const s = await withAuthRetry(() => startHand(tableId, playerId));
                apply(s);
            } catch (e) {
                // 409 = someone else dealt first / state moved on. Resync quietly.
                if (e.status === 409) refresh();
                else if (e.status === 404) navigate("/lobby");
                else toast.error(e);
            }
        }, delay);
        return () => clearTimeout(t);
    }, [dealKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const dealLeft = dealAt ? Math.max(0, Math.ceil((dealAt - now) / 1000)) : null;

    // ── Navigation on missing / closed table ─────────────────
    useEffect(() => {
        if (notFound) {
            toast.error("Table not found. It may have been closed or the server restarted.");
            navigate("/lobby");
        }
    }, [notFound]); // eslint-disable-line react-hooks/exhaustive-deps

    // Open the variant modal whenever a pick is requested of this viewer.
    const pickKey = can.pick_variant ? `${table?.hand_number}|${table?.orbit_number}|${table?.pick_deadline}` : null;
    useEffect(() => {
        if (pickKey) setDialog({ type: "variant" });
        else setDialog(d => (d?.type === "variant" ? null : d));
    }, [pickKey]);

    // Reset card selection when the decision changes.
    const decisionKey = `${hand?.street}|${domain}|${decision?.seat}|${hand?.hand_complete}`;
    useEffect(() => { setSelected(EMPTY); }, [decisionKey]);

    // Bankroll shown in the navbar/session should follow chip movement.
    const status = table?.status;
    useEffect(() => { if (status === "BETWEEN_HANDS" || status === "CLOSED") refreshPlayer(); },
        [status]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Spectator downgrade (bad / expired / missing token) ──
    // We have a player selected and seated here, but the server says
    // nobody is viewing. The server never errors on this; it just
    // downgrades the connection to spectator.
    const seatedHere = playerId != null && seats.some(s => s.player_id === playerId);
    const downgraded = !!state && playerId != null && viewer?.player_id == null && seatedHere;

    const promptedRef = useRef(false);
    useEffect(() => {
        if (!downgraded) { promptedRef.current = false; return; }
        if (promptedRef.current) return;
        promptedRef.current = true;
        // On success the token changes -> useTable reconnects the WS.
        requestLogin(playerId).then(ok => { if (ok) refresh(); });
    }, [downgraded]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Mutation runner (retries once after PIN login) ───────
    const run = useCallback(async (fn) => {
        setBusy(true);
        try {
            const s = await withAuthRetry(fn);
            apply(s);
            return s;
        } catch (e) {
            toast.error(e);
            if (e.status === 409) refresh();          // stale UI → resync
            if (e.status === 404) navigate("/lobby");
            return null;
        } finally {
            setBusy(false);
        }
    }, [apply, refresh, toast, navigate, withAuthRetry]);

    // ── Table data for PokerTable ────────────────────────────
    const players = useMemo(() => {
        const out = {};
        seats.forEach(s => {
            if (s.player_id == null) return;
            const hp = hand?.players?.[s.seat];
            const flags = `${s.sitting_out ? " 💤" : ""}${s.pending_leave ? " ↩" : ""}`
                + `${s.pending_sit_out ? " ⏳out@BB" : ""}${s.waiting_for_bb ? " ⏳BB" : ""}`;
            const name = `${s.name}${flags}`;
            out[s.seat] = hp
                ? { ...hp, name }
                : { seat: s.seat, name, stack: s.stack, bet: 0, folded: false, hand: [] };
        });
        return out;
    }, [seats, hand]);

    const selectable = can.act && (domain === "CARD_SELECT" || domain === "CARD_PASS");

    const playersForTable = useMemo(() => {
        if (!selectable || !viewer?.seat) return players;
        const mine = players[viewer.seat];
        if (!mine) return players;
        return {
            ...players,
            [viewer.seat]: {
                ...mine,
                hand: (mine.hand || []).map(c =>
                    c ? { ...c, selected: !c.hidden && selected.includes(c.card) } : c),
            },
        };
    }, [players, selectable, viewer?.seat, selected]);

    const handlePlayerCardClick = (seat, idx) => {
        if (!selectable || seat !== viewer?.seat) return;
        const c = players[seat]?.hand?.[idx];
        if (!c || c.hidden || !c.card) return;
        setSelected(prev => prev.includes(c.card) ? prev.filter(x => x !== c.card) : [...prev, c.card]);
    };

    const handleSeatClick = (seat) => {
        const s = seats.find(x => x.seat === seat);
        if (!s || s.player_id != null) return;                    // only empty seats
        if (can.sit) setDialog({ type: "sit", seat });
        else if (can.switch_seat) run(() => switchSeat(tableId, playerId, seat));
    };

    // ── Derived display ──────────────────────────────────────
    const actionSeat = hand && !hand.hand_complete ? (decision?.seat ?? null) : null;
    const pickLeft = secondsLeft(table?.pick_deadline, now);
    const picker = seats.find(s => s.seat === table?.picker_seat);
    const mySeat = seats.find(s => s.seat === viewer?.seat);
    const myRebuyLeft = secondsLeft(mySeat?.rebuy_deadline, now);

    const banner = (() => {
        if (!table) return "";
        if (closed || table.status === "CLOSED") return "Table closed";
        if (table.sub_state === "AWAITING_VARIANT_PICK") {
            return can.pick_variant
                ? `Your pick — choose the variant${pickLeft != null ? ` (${pickLeft}s)` : ""}`
                : `${picker?.name ?? "Dealer"} is choosing the variant…${pickLeft != null ? ` (${pickLeft}s)` : ""}`;
        }
        if (mySeat?.waiting_for_bb && table.status !== "CLOSED") {
            return "Waiting for the big blind to reach you…";
        }
        switch (table.status) {
            case "WAITING":       return "Waiting for players (need 2)";
            case "STARTING":
                return dealLeft != null
                    ? `Next hand in ${dealLeft}s…`
                    : "Waiting for the hand to start…";

            case "IN_HAND":
                return actionSeat != null
                    ? `Action on ${players[actionSeat]?.name ?? `seat ${actionSeat}`}`
                    : "Hand in progress";
            case "BETWEEN_HANDS": return "Hand complete";
            default:              return table.status;
        }
    })();

    // ── No player selected ───────────────────────────────────
    if (!playerId) {
        return <div className="table-view__center"><PlayerPicker /></div>;
    }
    if (!state) {
        return <div className="table-view__center">{notFound ? "Table not found." : "Loading table…"}</div>;
    }

    const tableElement = (
        <PokerTable
            players={playersForTable}
            boardCards={[]}
            nodes={hand?.nodes ?? EMPTY}
            layoutName={hand?.layout_name}
            points={hand?.points}
            showdown={hand?.showdown}
            dealerSeat={table.button_seat}
            actionSeat={actionSeat}
            heroSeat={viewer?.seat ?? null}
            onSeatClick={handleSeatClick}
            onPlayerCardClick={handlePlayerCardClick}
            onPlayerSlotClick={() => {}}
            onBoardCardClick={() => {}}
            onBoardSlotClick={() => {}}
            onBoardAreaClick={() => {}}
            loading={false}
        />
    );

    return (
        <div className="game-simulator">
            {/* ===== Header ===== */}
            <div className="game-header">
                <div className="game-header__left">
                    <button className="game-btn" onClick={() => navigate("/lobby")}>← Lobby</button>
                    <span className="game-header__title">{table.name}</span>
                    {table.recording === false && (
                        <span
                            className="table-view__badge"
                            title="Not recording: results won't affect your saved bankroll or history."
                        >
                            NOT RECORDING
                        </span>
                    )}
                    {connection !== "open" && (
                        <span className="table-view__conn">
                            {connection === "reconnecting" ? "⚠ reconnecting…" : "connecting…"}
                        </span>
                    )}
                </div>
                <div className="game-header__right">
                    <span className="game-variant-label">
                        Blinds {table.stakes.small_blind}/{table.stakes.big_blind}
                        {table.stakes.ante ? ` · ante ${table.stakes.ante}` : ""}
                    </span>
                    {viewer?.bankroll != null && (
                        <span className="game-variant-label">
                            Bankroll {Number(viewer.bankroll).toLocaleString()}
                        </span>
                    )}
                </div>
            </div>

            {/* ===== Info bar ===== */}
            <div className="game-info-bar">
                <div className="game-status-bar table-view__banner">{banner}</div>
                <div className="game-info-bar__right">
                    <span>
                        {label(table.current_variant)}
                        {table.next_variant && table.next_variant !== table.current_variant
                            ? ` → next: ${label(table.next_variant)}` : ""}
                    </span>
                    <span className="pot">Pot: {hand?.pot ?? 0}</span>
                    <span className="game-info-bar__street">
                        {table.hand_number > 0 ? `Hand #${table.hand_number}` : ""}
                    </span>
                </div>
            </div>

            {/* ===== Spectator-downgrade banner ===== */}
            {downgraded && (
                <div className="game-info-bar table-view__login-banner">
                    <span>🔒 Log in to see your cards</span>
                    <button
                        className="game-btn"
                        onClick={() => requestLogin(playerId).then(ok => ok && refresh())}
                    >
                        Log in
                    </button>
                </div>
            )}

            {/* ===== Layout ===== */}
            <div className="game-layout">
                <div className="game-layout__main">
                    <div className="table-container">{tableElement}</div>

                    {/* ── Controls ── */}
                    <div className="table-controls">
                        {can.pick_variant && dialog?.type !== "variant" && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => setDialog({ type: "variant" })}>
                                Choose variant
                            </button>
                        )}

                        {can.start && table.status === "STARTING" && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => { setDealAt(null); run(() => startHand(tableId, playerId)); }}>
                                ▶ Deal now
                            </button>
                        )}
                        {can.rebuy && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => setDialog({ type: "rebuy" })}>
                                Rebuy{myRebuyLeft != null ? ` (${myRebuyLeft}s)` : ""}
                            </button>
                        )}
                        {can.addon && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => setDialog({ type: "addon" })}>
                                Add-on
                            </button>
                        )}
                        {can.sit_out && !mySeat?.pending_sit_out && (
                            <>
                                <button className="game-btn" disabled={busy}
                                        onClick={() => run(() => sitOut(tableId, playerId, "now"))}>
                                    Sit out
                                </button>
                                <button className="game-btn" disabled={busy}
                                        title="Sit out when the big blind reaches you"
                                        onClick={() => run(() => sitOut(tableId, playerId, "next_bb"))}>
                                    Sit out at BB
                                </button>
                            </>
                        )}
                        {(can.cancel_sit_out || mySeat?.pending_sit_out) && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => run(() => cancelSitOut(tableId, playerId))}>
                                Cancel sit-out
                            </button>
                        )}
                        {can.sit_in && (
                            <button className="game-btn" disabled={busy}
                                    onClick={() => run(() => sitIn(tableId, playerId))}>
                                Sit in
                            </button>
                        )}
                         {can.leave && (
                            <button className="game-btn" disabled={busy || !!mySeat?.pending_leave}
                                     onClick={() => run(() => leaveTable(tableId, playerId))}>
                                {mySeat?.pending_leave
                                    ? "Standing up after hand…"
                                    : table.status === "IN_HAND" ? "Stand up after hand" : "Stand up"}
                             </button>
                         )}
                        {can.close && (
                            <button className="game-btn table-controls__danger" disabled={busy}
                                    onClick={() => {
                                        if (window.confirm("Close the table and cash everyone out?"))
                                            run(() => closeTable(tableId, playerId));
                                    }}>
                                Close table
                            </button>
                        )}
                        {mySeat?.pending_seat_change != null && (
                            <span className="table-view__conn">
                                Moving to seat {mySeat.pending_seat_change} after this hand
                            </span>
                        )}
                    </div>

                    <TableActions
                        tableId={tableId}
                        playerId={playerId}
                        state={state}
                        selected={selected}
                        setSelected={setSelected}
                        busy={busy}
                        run={run}
                        dialog={dialog}
                        setDialog={setDialog}
                    />

                    {dialog?.type === "variant" && can.pick_variant && (
                        <VariantPickModal
                            tableId={tableId}
                            playerId={playerId}
                            table={table}
                            run={run}
                            busy={busy}
                            onClose={() => setDialog(null)}
                        />
                    )}

                    {(closed || table.status === "CLOSED") && (
                        <div className="game-info-bar">
                            This table is closed.{" "}
                            <button className="game-btn" onClick={() => navigate("/lobby")}>
                                Back to lobby
                            </button>
                        </div>
                    )}
                </div>

                <SideSheet
                    className="game-layout__sidebar"
                    title={`Table log (${events.length})`}
                >
                    <EventLog events={events} />
                </SideSheet>
            </div>
        </div>
    );
};

export default TableView;