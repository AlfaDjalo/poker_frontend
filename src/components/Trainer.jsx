import React, { useState, useEffect, useCallback, useRef } from 'react';

import PokerTable from "./PokerTable";
import PlayerActionPanel from "./PlayerActionPanel";
import TrainerHandGrid from "./TrainerHandGrid";
import "../css/GameSimulator.css";

import {
    fetchTrainerScenarios,
    startTrainerScenario,
    sendTrainerAction,
    resetTrainerScoreboard,
    fetchTrainerHistory,
    fetchTrainerDebug,
    fetchTrainerLiveDebug,
    fetchTrainerCheckpoints,
    selectTrainerCheckpoint,
} from '../api/trainerApi';

function normalizePlayers(playersArray) {
    if (!Array.isArray(playersArray)) return playersArray;
    const map = {};
    playersArray.forEach(p => { map[p.seat] = p; });
    return map;
}

function wrapCards(cardStrings) {
    return (cardStrings || []).map(card => ({ card, hidden: false, selected: false }));
}

function maskVillainHands(players, heroSeat) {
    if (!players) return players;
    const heroSeatNum = heroSeat;
    const masked = {};
    for (const [seat, player] of Object.entries(players)) {
        const isHero = Number(seat) === heroSeatNum;
        masked[seat] = {
            ...player,
            hand: (player.hand || []).map(c => {
                if (!c) return null;
                return isHero
                    ? c
                    : { card: null, hidden: true, selected: false };
            }),
        };
    }
    return masked;
}

// History replays should show every hand face-up (the decision's
// already made — nothing left to hide) instead of masking villain.
function formatScenarioState(raw, revealAll = false) {
    if (!raw) return null;
    const players = normalizePlayers(raw.players);
    return {
        ...raw,
        players: revealAll ? players : maskVillainHands(players, raw.hero_seat),
        nodes: wrapCards(raw.nodes || []),
    };
}

const ACTION_LABELS = {
    fold: "Fold",
    check: "Check",
    call: "Call",
    bet: "Bet",
    all_in: "All-In",
};

// How long to leave the last-decision feedback on screen before
// auto-advancing to a fresh scenario. Long enough to read, short
// enough not to feel stuck. There is deliberately no manual "Next"
// button on the live-play path any more — the previous "Hand
// complete... Now" banner could end up stuck on screen if a request
// failed silently, since the click did nothing but re-attempt the
// same request. Auto-advance now surfaces failures via the normal
// error banner instead.
const AUTO_ADVANCE_DELAY_MS = 1400;

const Trainer = () => {
    const [scenarios, setScenarios] = useState([]);
    const [selectedScenario, setSelectedScenario] = useState(null);

    const [scenario, setScenario] = useState(null);
    const [lastDecision, setLastDecision] = useState(null);
    const [scoreboard, setScoreboard] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [showHandGrid, setShowHandGrid] = useState(false);
    const [scenarioVersion, setScenarioVersion] = useState(0);

    // Checkpoint picker — which trained model to play against for the
    // selected scenario type. Populated from GET
    // /trainer/scenarios/{key}/checkpoints whenever selectedScenario
    // changes; checkpointOptions.checkpoints is [] for scenarios with
    // no checkpoint_dir configured, in which case the dropdown is
    // simply not shown.
    const [checkpointOptions, setCheckpointOptions] = useState(null);
    const [checkpointError, setCheckpointError] = useState(null);

    // Non-null while viewing a past scoreboard entry read-only.
    const [viewingHistoryId, setViewingHistoryId] = useState(null);

    // "Which model is actually loaded" diagnostic panel (see
    // handleShowDebug) — surfaces checkpoint path/existence, whether a
    // real network loaded vs. RandomFallbackAgent, and hand-encoder
    // status, so a hand grid that "doesn't line up" can be checked
    // against an actual cause before assuming the checkpoint is wrong.
    const [debugInfo, setDebugInfo] = useState(null);
    const [debugError, setDebugError] = useState(null);

    const requestIdRef = useRef(0);
    const autoAdvanceTimerRef = useRef(null);

    // Whether the currently-selected scenario deals exactly 2 hole
    // cards — the 169-combo canonical hand grid only makes sense for
    // that case (Omaha's 4 hole cards have no equivalent "canonical
    // hand" concept). Backed by list_scenarios()' hole_cards field
    // (trainer_service.py), and mirrored server-side as a hard 400 —
    // this is just the UI-level gate so the button isn't even offered.
    const selectedScenarioMeta = scenarios.find((s) => s.key === selectedScenario);
    const supportsHandGrid = selectedScenarioMeta?.hole_cards === 2;

    useEffect(() => {
        fetchTrainerScenarios()
            .then((list) => {
                setScenarios(list);
                if (list.length > 0) setSelectedScenario(list[0].key);
            })
            .catch((err) => setError(err.message));
    }, []);

    useEffect(() => {
        return () => {
            if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!supportsHandGrid) setShowHandGrid(false);
    }, [supportsHandGrid]);

    const applyStatePayload = (payload, { fromHistory = false } = {}) => {
        setScenario(formatScenarioState(payload, fromHistory));
        setScoreboard(payload.scoreboard || null);
        setLastDecision(payload.last_decision || null);
        setScenarioVersion((v) => v + 1);

        // Centralized auto-advance: ANY payload that reports hand_over
        // schedules the next scenario, regardless of which call site
        // produced it (a submitted hero action, OR a brand-new
        // scenario that resolved before the hero ever got to act —
        // e.g. push-fold's villain SB folding immediately). Previously
        // only handleAction's response checked hand_over, so a hand
        // that completed during new_scenario() itself (via the
        // pre-hero villain auto-turn) showed "Hand complete — next
        // scenario starting…" with nothing actually scheduled to make
        // that true. Centralizing here means no future call site can
        // forget this check. Skipped for history replays — reviewing
        // a past hand should never trigger a live auto-advance.
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        if (!fromHistory && payload.hand_over) {
            const myRequestId = requestIdRef.current;
            autoAdvanceTimerRef.current = setTimeout(() => {
                if (myRequestId === requestIdRef.current) handleNewScenario();
            }, AUTO_ADVANCE_DELAY_MS);
        }
    };

    const handleNewScenario = useCallback(async () => {
        if (!selectedScenario) return;
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        setViewingHistoryId(null);
        const myRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        setLastDecision(null);
        try {
            const payload = await startTrainerScenario(selectedScenario);
            if (myRequestId !== requestIdRef.current) return;
            applyStatePayload(payload);
        } catch (err) {
            if (myRequestId === requestIdRef.current) setError(err.message);
        } finally {
            if (myRequestId === requestIdRef.current) setLoading(false);
        }
    }, [selectedScenario]);

    useEffect(() => {
        if (!selectedScenario) return;
        // Scenario TYPE changed (including the initial mount) — reset
        // the scoreboard and clear any history list/review state so
        // stats and past-hand entries from a different scenario type
        // (different action vocabulary, different hole-card count,
        // etc.) never linger around after switching. A "New Scenario"
        // click on the SAME type does NOT go through this effect (it
        // calls handleNewScenario() directly instead — see that
        // button's onClick), so the scoreboard is preserved across
        // hands of the same scenario, only cleared on an actual type
        // switch.
        resetTrainerScoreboard()
            .then((board) => setScoreboard(board))
            .catch((err) => setError(err.message));
        setViewingHistoryId(null);
        handleNewScenario();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedScenario]);

    useEffect(() => {
        if (!selectedScenario) {
            setCheckpointOptions(null);
            return;
        }
        setCheckpointError(null);
        fetchTrainerCheckpoints(selectedScenario)
            .then((opts) => setCheckpointOptions(opts))
            .catch((err) => {
                setCheckpointOptions(null);
                setCheckpointError(err.message);
            });
    }, [selectedScenario]);

    const handleCheckpointChange = useCallback(async (filename) => {
        if (!selectedScenario) return;
        setCheckpointError(null);
        try {
            const opts = await selectTrainerCheckpoint(selectedScenario, filename);
            setCheckpointOptions(opts);
            // Reload the current model choice into a fresh scenario
            // immediately rather than leaving the old checkpoint's
            // agent running until the next natural "New Scenario".
            handleNewScenario();
        } catch (err) {
            setCheckpointError(err.message);
        }
    }, [selectedScenario, handleNewScenario]);

    const handleAction = async (actionType) => {
        if (viewingHistoryId !== null) return; // read-only view — no decisions
        const myRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const payload = await sendTrainerAction(actionType);
            if (myRequestId !== requestIdRef.current) return;
            applyStatePayload(payload);
        } catch (err) {
            if (myRequestId === requestIdRef.current) setError(err.message);
        } finally {
            if (myRequestId === requestIdRef.current) setLoading(false);
        }
    };

    const handleResetScoreboard = async () => {
        try {
            const board = await resetTrainerScoreboard();
            setScoreboard(board);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleHistoryClick = async (entry) => {
        if (entry.id == null) return;
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        const myRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchTrainerHistory(entry.id);
            if (myRequestId !== requestIdRef.current) return;
            setViewingHistoryId(entry.id);
            // Hand grid now supports history mode (recreated from the
            // stored decision context via GET /trainer/history/{id}/grid)
            // — leave whatever grid/table toggle the user already had
            // set, rather than forcing back to the table view.
            applyStatePayload(payload, { fromHistory: true });
        } catch (err) {
            if (myRequestId === requestIdRef.current) setError(err.message);
        } finally {
            if (myRequestId === requestIdRef.current) setLoading(false);
        }
    };

    const handleShowDebug = async () => {
        if (!selectedScenario) return;
        setDebugError(null);
        try {
            const info = await fetchTrainerDebug(selectedScenario);
            setDebugInfo(info);
        } catch (err) {
            setDebugError(err.message);
            setDebugInfo(null);
        }
    };

    const handleShowLiveDebug = async () => {
        if (!scenario) return;
        setDebugError(null);
        try {
            const info = await fetchTrainerLiveDebug();
            setDebugInfo(info);
        } catch (err) {
            setDebugError(err.message);
            setDebugInfo(null);
        }
    };

    const awaitingHero = viewingHistoryId === null && !!scenario?.awaiting_hero;

    // hero_allowed_actions comes back in Trainer-level vocabulary
    // (fold/check/call/bet/all_in — see trainer_service.py's
    // _live_allowed_actions). PlayerActionPanel expects "bet"/"raise"
    // (no "all_in"), and picks between those two labels itself via
    // player?.bet > 0 — so "all_in" maps to whichever of those two the
    // panel would already choose, and the reverse mapping in
    // handlePanelAction sends the right Trainer-level string back.
    const heroPlayer = scenario?.players?.[scenario.hero_seat] || null;
    const rawAllowedActions = scenario?.hero_allowed_actions || [];
    const usesAllIn = rawAllowedActions.includes("all_in");
    const panelActions = rawAllowedActions.map((a) =>
        a === "all_in" ? ((heroPlayer?.bet ?? 0) > 0 ? "raise" : "bet") : a
    );

    const handlePanelAction = (panelActionType /*, amount */) => {
        // Amount is intentionally ignored: every bet/raise/all-in this
        // Trainer ever offers has exactly one legal size (push-fold's
        // full-stack shove, or river's single pot-sized bet) —
        // trainer_service.py's _build_engine_action always computes
        // that size itself server-side, and PlayerActionPanel's own
        // min/maxRaise clamp (both set to the same fixed value below)
        // already forces any typed amount to that size anyway.
        if (panelActionType === "bet" || panelActionType === "raise") {
            handleAction(usesAllIn ? "all_in" : "bet");
        } else {
            handleAction(panelActionType); // fold / check / call
        }
    };

    return (
        <div className="game-simulator">
            {/* ===== Header ===== */}
            <div className="game-header">
                <div className="game-header__left">
                    <span className="game-header__title">Trainer</span>

                    <label htmlFor="trainer-scenario-select" className="game-variant-label">
                        Scenario:
                    </label>
                    <select
                        id="trainer-scenario-select"
                        className="game-variant-dropdown"
                        value={selectedScenario || ""}
                        onChange={(e) => setSelectedScenario(e.target.value)}
                        disabled={scenarios.length === 0 || loading}
                    >
                        {scenarios.length === 0 && <option value="">Loading…</option>}
                        {scenarios.map((s) => (
                            <option key={s.key} value={s.key} title={s.description}>
                                {s.label}
                            </option>
                        ))}
                    </select>

                    {checkpointOptions && checkpointOptions.checkpoints.length > 0 && (
                        <>
                            <label htmlFor="trainer-checkpoint-select" className="game-variant-label">
                                Model:
                            </label>
                            <select
                                id="trainer-checkpoint-select"
                                className="game-variant-dropdown"
                                value={checkpointOptions.selected_checkpoint || ""}
                                onChange={(e) => handleCheckpointChange(e.target.value || null)}
                                disabled={loading}
                                title={checkpointOptions.checkpoint_dir || ""}
                            >
                                <option value="">
                                    Default ({checkpointOptions.default_checkpoint})
                                </option>
                                {checkpointOptions.checkpoints.map((fname) => (
                                    <option key={fname} value={fname}>
                                        {fname}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}

                    <button className="game-btn" onClick={handleNewScenario} disabled={loading}>
                        New Scenario
                    </button>
                    <button className="game-btn" onClick={handleResetScoreboard}>
                        Reset Scoreboard
                    </button>
                    <button
                        className="game-btn"
                        onClick={() => setShowHandGrid((v) => !v)}
                        disabled={!scenario || !supportsHandGrid}
                        title={!supportsHandGrid ? "Hand grid is only available for 2-hole-card games" : undefined}
                    >
                        {showHandGrid ? "Show Table" : "Show Hand Grid"}
                    </button>
                    <button className="game-btn" onClick={handleShowDebug} disabled={!selectedScenario}>
                        {debugInfo ? "Refresh Debug Info" : "Debug: Which Model?"}
                    </button>
                    <button className="game-btn" onClick={handleShowLiveDebug} disabled={!scenario}>
                        Live Debug (current hand)
                    </button>
                </div>
            </div>

            {debugError && (
                <div className="game-info-bar" style={{ color: "#f87171" }}>
                    {debugError}
                </div>
            )}

            {debugInfo && (
                <div className="game-info-bar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                    <div>
                        <strong>{debugInfo.scenario_key}</strong> — verdict:{" "}
                        <strong
                            style={{
                                color:
                                    debugInfo.verdict?.startsWith("REAL")
                                        ? "#22c55e"
                                        : debugInfo.verdict?.startsWith("RANDOM")
                                        ? "#f87171"
                                        : debugInfo.verdict?.startsWith("LEGACY")
                                        ? "#38bdf8"
                                        : "#f59e0b",
                            }}
                        >
                            {debugInfo.verdict}
                        </strong>
                    </div>
                    <div>agent class: {debugInfo.agent_class}</div>
                    <div>architecture: {debugInfo.architecture}</div>
                    <div>
                        checkpoint: {debugInfo.checkpoint_abs_path}{" "}
                        {debugInfo.checkpoint_exists_on_disk ? "(found)" : "(MISSING on disk)"}
                    </div>
                    <div>configured variant: {debugInfo.configured_variant}</div>
                    <div>
                        hand encoder:{" "}
                        {debugInfo.hand_encoder
                            ? `${debugInfo.hand_encoder.class} (base: ${debugInfo.hand_encoder.base_class}, ` +
                              `dim: ${debugInfo.hand_encoder.embedding_dim}, source: ${debugInfo.hand_encoder.source})`
                            : "none / not attached"}
                    </div>
                    <div>
                        encoder file: {debugInfo.encoder_path || "—"}{" "}
                        {debugInfo.encoder_path && (debugInfo.encoder_path_exists_on_disk ? "(found)" : "(MISSING on disk)")}
                    </div>

                    {debugInfo.pipeline_trace && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ fontWeight: 600 }}>Build pipeline (top to bottom):</div>
                            {debugInfo.pipeline_trace.map((entry, i) => (
                                <div
                                    key={i}
                                    style={{
                                        fontSize: "0.85em",
                                        color:
                                            entry.status === "ok"
                                                ? "#22c55e"
                                                : entry.status === "warning"
                                                ? "#f59e0b"
                                                : entry.status === "fallback"
                                                ? "#f97316"
                                                : "#f87171",
                                    }}
                                >
                                    [{entry.status.toUpperCase()}] {entry.step}: {entry.detail}
                                </div>
                            ))}
                        </div>
                    )}

                    {debugInfo.live_observation && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ fontWeight: 600 }}>Live observation (current decision point):</div>
                            <div style={{ fontSize: "0.85em" }}>
                                position: {debugInfo.live_observation.hero_position} (rl_seat{" "}
                                {debugInfo.live_observation.hero_rl_seat}) · pot:{" "}
                                {debugInfo.live_observation.pot} · to_call:{" "}
                                {debugInfo.live_observation.bet_to_call} · hole:{" "}
                                {debugInfo.live_observation.hole_cards.join(",")} · board:{" "}
                                {debugInfo.live_observation.board_cards.filter(Boolean).join(",") || "—"}
                            </div>
                            <div style={{ fontSize: "0.85em" }}>
                                action probs:{" "}
                                {Object.entries(debugInfo.live_action_probs || {})
                                    .map(([a, p]) => `${a}=${(p * 100).toFixed(1)}%`)
                                    .join(", ")}
                            </div>
                        </div>
                    )}

                    <button className="game-btn" onClick={() => setDebugInfo(null)}>
                        Close Debug Info
                    </button>
                </div>
            )}

            {error && (
                <div className="game-info-bar" style={{ color: "#f87171" }}>
                    {error}
                </div>
            )}

            {checkpointError && (
                <div className="game-info-bar" style={{ color: "#f87171" }}>
                    {checkpointError}
                </div>
            )}

            {viewingHistoryId !== null && (
                <div className="game-info-bar" style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>
                    Viewing a past hand (read-only).{" "}
                    <button className="game-btn" onClick={handleNewScenario}>
                        Return to Live Play
                    </button>
                </div>
            )}

            {scenario && (
                <div className="game-info-bar">
                    <span>Position: <strong>{scenario.hero_position}</strong></span>
                    <span style={{ marginLeft: 16 }}>
                        Effective Stack: <strong>{scenario.hero_effective_bb} bb</strong>
                    </span>
                    <span style={{ marginLeft: 16 }}>
                        Pot: {scenario.pot}
                    </span>
                </div>
            )}

            {/* ===== Table (or Grid, mutually exclusive) + Scoreboard ===== */}
            {scenario && (
                <div className="game-layout">
                    <div className="game-layout__main">
                        {showHandGrid ? (
                            <>
                                <div className="game-info-bar" style={{ fontSize: "0.9em" }}>
                                    <strong>Board:</strong>{" "}
                                    {(scenario.nodes || []).map((n) => n.card).filter(Boolean).join(" ") || "—"}
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Effective Stack:</strong> {scenario.hero_effective_bb}bb
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Pot:</strong> {scenario.pot}
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>To Call:</strong> {scenario.to_call ?? 0}
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Decision:</strong>{" "}
                                        {(scenario.hero_allowed_actions || [])
                                            .map((a) => ACTION_LABELS[a] || a)
                                            .join(" / ") || "—"}
                                    </span>
                                </div>
                                <TrainerHandGrid
                                    key={`${scenarioVersion}-${viewingHistoryId ?? "live"}`}
                                    onClose={() => setShowHandGrid(false)}
                                    historyEntryId={viewingHistoryId}
                                />
                            </>
                        ) : (
                            <>
                                <div className="table-container">
                                    <PokerTable
                                        players={scenario.players}
                                        boardCards={[]}
                                        nodes={scenario.nodes}
                                        layoutName={scenario.layout_name}
                                        points={scenario.points}
                                        showdown={scenario.showdown}
                                        dealerSeat={1}
                                        actionSeat={awaitingHero ? scenario.hero_seat : null}
                                        onSeatClick={() => {}}
                                        onPlayerCardClick={() => {}}
                                        onPlayerSlotClick={() => {}}
                                        onBoardCardClick={() => {}}
                                        onBoardSlotClick={() => {}}
                                        onBoardAreaClick={() => {}}
                                        loading={loading}
                                        hideEmptySeats
                                    />
                                </div>

                                {scenario.action_log && scenario.action_log.length > 0 && (
                                    <div
                                        className="game-info-bar"
                                        style={{ flexDirection: "column", alignItems: "flex-start", fontSize: "0.85em", gap: 2 }}
                                    >
                                        {scenario.action_log.map((entry, i) => {
                                            const who = entry.actor === "hero" ? "You" : "AI";
                                            const label = ACTION_LABELS[entry.action] || entry.action;
                                            const amountStr = entry.amount ? ` $${entry.amount}` : "";
                                            return (
                                                <div key={i}>
                                                    <strong>{who}</strong> ({entry.position}): {label}
                                                    {amountStr}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {awaitingHero && (
                                    <PlayerActionPanel
                                        player={heroPlayer}
                                        availableActions={panelActions}
                                        // Fixed sizing (see handlePanelAction's comment):
                                        // min == max forces the input to always clamp to
                                        // the one legal amount, regardless of what's typed.
                                        minRaise={scenario.max_raise}
                                        maxRaise={scenario.max_raise}
                                        toCall={scenario.to_call}
                                        onAction={handlePanelAction}
                                        disabled={loading}
                                    />
                                )}

                                {lastDecision && (
                                    <div
                                        className="game-info-bar"
                                        style={{
                                            borderColor: lastDecision.correct ? "#22c55e" : "#f87171",
                                            color: lastDecision.correct ? "#22c55e" : "#f87171",
                                        }}
                                    >
                                        {lastDecision.correct ? "✓ Correct" : "✗ Incorrect"} — you chose{" "}
                                        <strong>{ACTION_LABELS[lastDecision.hero_action] || lastDecision.hero_action}</strong>,
                                        best was{" "}
                                        <strong>{ACTION_LABELS[lastDecision.best_action] || lastDecision.best_action}</strong>
                                        <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                                            {lastDecision.explanation}
                                        </div>
                                    </div>
                                )}

                                {scenario.hand_over && !awaitingHero && viewingHistoryId === null && (
                                    <div className="game-info-bar">
                                        Hand complete — next scenario starting…
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ===== Scoreboard sidebar — always visible ===== */}
                    {scoreboard && (
                        <div className="game-layout__sidebar">
                            <h3>Scoreboard</h3>
                            <div>Correct: {scoreboard.correct}</div>
                            <div>Incorrect: {scoreboard.incorrect}</div>
                            <div>
                                Accuracy:{" "}
                                {scoreboard.accuracy != null
                                    ? `${(scoreboard.accuracy * 100).toFixed(1)}%`
                                    : "—"}
                            </div>

                            <h4 style={{ marginTop: 12 }}>Recent (click to review)</h4>
                            <div style={{ maxHeight: 300, overflowY: "auto" }}>
                                {scoreboard.history.slice().reverse().map((h) => (
                                    <div
                                        key={h.id}
                                        onClick={() => handleHistoryClick(h)}
                                        style={{
                                            cursor: "pointer",
                                            fontSize: "0.85em",
                                            padding: "4px 0",
                                            borderBottom: "1px solid #333",
                                            color: h.correct ? "#22c55e" : "#f87171",
                                            background: viewingHistoryId === h.id ? "#1f2937" : "transparent",
                                        }}
                                    >
                                        {h.hand} ({h.position}, {h.effective_stack_bb}bb): {h.hero_action} →{" "}
                                        {h.best_action} {h.correct ? "✓" : "✗"}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Trainer;