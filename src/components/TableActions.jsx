import React, { useEffect, useState } from "react";
import PlayerActionPanel from "./PlayerActionPanel";
import CardSelectPanel from "./CardSelectPanel";
import BooleanDecisionPanel from "./BooleanDecisionPanel";
import {
    sendTableAction, sitAtTable, rebuy, addon,
} from "../api/tableApi";
import "../css/TableActions.css";

const EMPTY = [];

// ─────────────────────────────────────────────
// Amount dialog (buy-in / rebuy / add-on)
// ─────────────────────────────────────────────

const AmountDialog = ({ title, hint, min, max, confirmLabel, busy, onConfirm, onClose, children }) => {
    const lo = Math.max(0, Math.floor(min));
    const hi = Math.max(lo, Math.floor(max));
    const [amount, setAmount] = useState(hi);

    useEffect(() => { setAmount(hi); }, [hi]);

    const n = Number(amount);
    const valid = Number.isFinite(n) && n >= lo && n <= hi && hi > 0;

    return (
        <div className="amount-dialog__backdrop" onClick={onClose}>
            <div
                className="amount-dialog"
                role="dialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
            >
                <div className="amount-dialog__title">{title}</div>
                {hint && <div className="amount-dialog__hint">{hint}</div>}

                {hi <= 0 || lo > hi ? (
                    <div className="amount-dialog__error">
                        Nothing available to add (check your bankroll and table limits).
                    </div>
                ) : (
                    <>
                        <div className="amount-dialog__row">
                            <input
                                type="range"
                                min={lo}
                                max={hi}
                                value={Math.min(Math.max(n || lo, lo), hi)}
                                onChange={e => setAmount(Number(e.target.value))}
                                disabled={lo === hi}
                            />
                            <input
                                className="amount-dialog__num"
                                type="number"
                                min={lo}
                                max={hi}
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                            />
                        </div>
                        <div className="amount-dialog__range">
                            {lo.toLocaleString()} – {hi.toLocaleString()}
                        </div>
                        {children}
                    </>
                )}

                <div className="amount-dialog__actions">
                    <button type="button" className="game-btn" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="game-btn amount-dialog__ok"
                        disabled={!valid || busy}
                        onClick={() => onConfirm(n)}
                    >
                        {busy ? "…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// TableActions
// ─────────────────────────────────────────────

/**
 * Props:
 *   tableId, playerId
 *   state         - normalized state (from useTable)
 *   selected      - string[] cards chosen for CARD_SELECT / CARD_PASS
 *   setSelected   - setter for the above
 *   busy          - bool
 *   run           - async (fn) => state|null  (applies state, toasts errors)
 *   dialog        - null | {type:"sit",seat} | {type:"rebuy"} | {type:"addon"} | ...
 *   setDialog     - setter
 */
const TableActions = ({
    tableId, playerId, state, selected, setSelected, busy, run, dialog, setDialog,
}) => {
    const table = state?.table;
    const viewer = state?.viewer;
    const can = viewer?.can ?? {};
    const hand = state?.hand ?? null;
    const decision = hand?.decision ?? null;
    const domain = decision?.domain ?? null;
    const seats = state?.seats ?? EMPTY;

    const mySeat = seats.find(s => s.seat === viewer?.seat);
    const myPlayer = viewer?.seat != null ? hand?.players?.[viewer.seat] : null;
    const options = decision?.options ?? EMPTY;
    const bankroll = viewer?.bankroll ?? 0;

    const send = (body) => run(() => sendTableAction(tableId, playerId, body));
    const [waitBB, setWaitBB] = useState(false);
    const closeDialog = () => { setDialog(null); setWaitBB(false); };

    // ── Per-domain panel ─────────────────────────────────────
    let panel = null;
    if (can.act && decision && myPlayer) {
        const first = options[0] ?? null;

        if (domain === "BETTING") {
            panel = (
                <PlayerActionPanel
                    player={myPlayer}
                    options={options}
                    toCall={decision.to_call}
                    disabled={busy}
                    onAction={(type, amount) =>
                        send(amount != null ? { type, amount } : { type })}
                />
            );
        } else if (domain === "CARD_SELECT" || domain === "CARD_PASS") {
            const dir = decision.node_metadata?.pass_direction;
            const prompt = domain === "CARD_PASS" && Number.isInteger(first?.min_count)
                ? `Choose ${first.min_count} card${first.min_count !== 1 ? "s" : ""} to pass to your ${dir === "right" ? "right" : "left"}`
                : null;
            panel = (
                <CardSelectPanel
                    player={myPlayer}
                    minCount={first?.min_count}
                    maxCount={first?.max_count}
                    selectedCards={selected}
                    onConfirm={() => send({ selected_cards: selected })}
                    onClear={() => setSelected(EMPTY)}
                    submitting={busy}
                    promptOverride={prompt}
                />
            );
        } else if (domain === "BOOLEAN") {
            panel = (
                <BooleanDecisionPanel
                    player={myPlayer}
                    prompt={decision.context?.prompt ?? decision.node_metadata?.prompt ?? null}
                    options={options}
                    onDecide={(v) => send({ bool_value: v })}
                    submitting={busy}
                />
            );
        } else if (domain === "CHOICE") {
            panel = (
                <div className="table-actions__choice">
                    <span className="table-actions__prompt">
                        {myPlayer.name} — choose:
                    </span>
                    {options.map(o => (
                        <button
                            key={o.action_name}
                            className="game-btn"
                            disabled={busy}
                            onClick={() => send({ choice: o.action_name })}
                        >
                            {o.label ?? o.action_name}
                        </button>
                    ))}
                </div>
            );
        } else {
            panel = (
                <div className="table-actions__unknown">
                    Unsupported decision type: {String(domain)}
                </div>
            );
        }
    }

    // ── Dialogs ──────────────────────────────────────────────
    let modal = null;

    if (dialog?.type === "sit") {
        modal = (
            <AmountDialog
                title={`Sit at seat ${dialog.seat}`}
                hint={`Buy-in ${table.min_buyin.toLocaleString()}–${table.max_buyin.toLocaleString()} · bankroll ${Number(bankroll).toLocaleString()}`}
                min={table.min_buyin}
                max={Math.min(table.max_buyin, bankroll)}
                confirmLabel="Sit down"
                busy={busy}
                onClose={closeDialog}
                onConfirm={async (amt) => {
                    const s = await run(() =>
                        sitAtTable(tableId, playerId, dialog.seat, amt, { waitForBB: waitBB }));

                    if (s) closeDialog();
                }}
            >
                <label className="amount-dialog__check">
                    <input
                        type="checkbox"
                        checked={waitBB}
                        disabled={busy}
                        onChange={e => setWaitBB(e.target.checked)}
                    />
                    Wait for the big blind
                </label>
            </AmountDialog>
        );
    } else if (dialog?.type === "rebuy") {
        modal = (
            <AmountDialog
                title="Rebuy"
                hint={`Amount ${table.min_buyin.toLocaleString()}–${table.max_buyin.toLocaleString()} · bankroll ${Number(bankroll).toLocaleString()}`}
                min={table.min_buyin}
                max={Math.min(table.max_buyin, bankroll)}
                confirmLabel="Rebuy"
                busy={busy}
                onClose={closeDialog}
                onConfirm={async (amt) => {
                    const s = await run(() => rebuy(tableId, playerId, amt));
                    if (s) closeDialog();
                }}
            />
        );
    } else if (dialog?.type === "addon") {
        const stack = mySeat?.stack ?? 0;
        const room = Math.max(0, table.max_buyin - stack);
        modal = (
            <AmountDialog
                title="Add-on"
                hint={`Stack ${Number(stack).toLocaleString()} · room ${room.toLocaleString()} · bankroll ${Number(bankroll).toLocaleString()}`}
                min={1}
                max={Math.min(room, bankroll)}
                confirmLabel="Add chips"
                busy={busy}
                onClose={closeDialog}
                onConfirm={async (amt) => {
                    const s = await run(() => addon(tableId, playerId, amt));
                    if (s) closeDialog();
                }}
            />
        );
    }

    if (!panel && !modal) return null;

    return (
        <>
            {panel && <div className="table-actions">{panel}</div>}
            {modal}
        </>
    );
};

export default TableActions;