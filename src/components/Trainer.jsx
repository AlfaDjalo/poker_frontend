import React, { useState, useEffect, useCallback, useRef } from 'react';

import PokerTable from "./PokerTable";
import PlayerActionPanel from "./PlayerActionPanel";
import TrainerHandGrid from "./TrainerHandGrid";
import CardSelectPanel from './CardSelectPanel';
import SideSheet from "./SideSheet";
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
    fetchTrainerDrawSuggestion,
} from '../api/trainerApi';

function normalizePlayers(playersArray) {
    if (!Array.isArray(playersArray)) return playersArray;
    const map = {};
    playersArray.forEach((player) => {
        map[player.seat] = player;
    });
    return map;
}

function wrapCards(cardStrings) {
    return (cardStrings || []).map((card) => ({
        card,
        hidden: false,
        selected: false,
    }));
}

function maskVillainHands(players, heroSeat) {
    if (!players) return players;

    const masked = {};
    for (const [seat, player] of Object.entries(players)) {
        const isHero = Number(seat) === heroSeat;
        masked[seat] = {
            ...player,
            hand: (player.hand || []).map((card) => {
                if (!card) return null;
                return isHero
                    ? card
                    : { card: null, hidden: true, selected: false };
            }),
        };
    }
    return masked;
}

function formatScenarioState(raw, revealAll = false) {
    if (!raw) return null;

    const players = normalizePlayers(raw.players);
    return {
        ...raw,
        players: revealAll
            ? players
            : maskVillainHands(players, raw.hero_seat),
        nodes: wrapCards(raw.nodes || []),
    };
}

function markSelectedCards(players, heroSeat, selectedCards, enabled) {
    if (!players) return players;

    const selected = new Set(selectedCards);
    return Object.fromEntries(
        Object.entries(players).map(([seat, player]) => [
            seat,
            {
                ...player,
                hand: (player.hand || []).map((entry) => {
                    if (!entry) return null;

                    const card = typeof entry === "string"
                        ? entry
                        : entry.card;

                    if (!card) return entry;

                    return {
                        ...(typeof entry === "object" ? entry : {}),
                        card,
                        selected:
                            enabled &&
                            Number(seat) === heroSeat &&
                            selected.has(card),
                    };
                }),
            },
        ])
    );
}

const ACTION_LABELS = {
    fold: "Fold",
    check: "Check",
    call: "Call",
    bet: "Bet",
    all_in: "All-In",
};

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
    const [selectedDiscardCards, setSelectedDiscardCards] = useState([]);
    const [drawSuggestion, setDrawSuggestion] = useState(null);
    const [drawSuggestionLoading, setDrawSuggestionLoading] = useState(false);
    const [drawSuggestionError, setDrawSuggestionError] = useState(null);

    const [checkpointOptions, setCheckpointOptions] = useState(null);
    const [checkpointError, setCheckpointError] = useState(null);
    const [viewingHistoryId, setViewingHistoryId] = useState(null);
    const [debugInfo, setDebugInfo] = useState(null);
    const [debugError, setDebugError] = useState(null);

    const requestIdRef = useRef(0);
    const autoAdvanceTimerRef = useRef(null);

    const selectedScenarioMeta = scenarios.find(
        (entry) => entry.key === selectedScenario
    );
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
            if (autoAdvanceTimerRef.current) {
                clearTimeout(autoAdvanceTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!supportsHandGrid) setShowHandGrid(false);
    }, [supportsHandGrid]);

    const applyStatePayload = (payload, { fromHistory = false } = {}) => {
        setScenario(formatScenarioState(payload, fromHistory));
        setScoreboard(payload.scoreboard || null);
        setLastDecision(payload.last_decision || null);
        setSelectedDiscardCards([]);
        setDrawSuggestion(null);
        setDrawSuggestionError(null);
        setScenarioVersion((version) => version + 1);

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
        setSelectedDiscardCards([]);

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
            const opts = await selectTrainerCheckpoint(
                selectedScenario,
                filename
            );
            setCheckpointOptions(opts);
            handleNewScenario();
        } catch (err) {
            setCheckpointError(err.message);
        }
    }, [selectedScenario, handleNewScenario]);

    const handleAction = async (
        actionType,
        amount = null,
        selectedCards = null
    ) => {
        if (viewingHistoryId !== null) return;

        const myRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const payload = await sendTrainerAction(
                actionType,
                amount,
                selectedCards
            );
            if (myRequestId !== requestIdRef.current) return;
            applyStatePayload(payload);
        } catch (err) {
            if (myRequestId === requestIdRef.current) setError(err.message);
        } finally {
            if (myRequestId === requestIdRef.current) setLoading(false);
        }
    };

    const handleDiscardConfirm = () => {
        if (viewingHistoryId !== null || !isCardSelectDecision) return;

        const option = scenario?.decision?.options?.[0];
        if (
            !Number.isInteger(option?.min_count) ||
            !Number.isInteger(option?.max_count)
        ) {
            setError("The server did not report valid discard limits.");
            return;
        }

        if (
            selectedDiscardCards.length < option.min_count ||
            selectedDiscardCards.length > option.max_count
        ) {
            setError(
                `Select between ${option.min_count} and ${option.max_count} cards.`
            );
            return;
        }

        handleAction("card_select", null, selectedDiscardCards);
    };

    const handleDiscardClear = () => {
        setSelectedDiscardCards([]);
        setError(null);
    };

    const handleShowAiDraw = async () => {
        if (viewingHistoryId !== null || !isCardSelectDecision) return;
        setDrawSuggestionLoading(true);
        setDrawSuggestionError(null);
        try {
            setDrawSuggestion(await fetchTrainerDrawSuggestion());
        } catch (err) {
            setDrawSuggestionError(err.message);
        } finally {
            setDrawSuggestionLoading(false);
        }
    };

    // Previewing an AI option = loading its discards into the normal
    // selection, so the table highlight + CardSelectPanel count/Confirm
    // work unchanged.
    const handlePreviewDrawOption = (discard) => {
        setSelectedDiscardCards(discard);
        setError(null);
    };

    const sameCards = (a, b) =>
        a.length === b.length && [...a].sort().join() === [...b].sort().join();

    const drawOptions = drawSuggestion
        ? (drawSuggestion.options?.length
            ? drawSuggestion.options
            : [{ discard: drawSuggestion.discard ?? [], prob: null }])
        : [];

    const handleTableCardClick = (seat, cardIndex) => {
        if (!isCardSelectDecision || !awaitingHero || loading) return;
        if (Number(seat) !== Number(scenario?.hero_seat)) return;

        const entry = scenario?.players?.[seat]?.hand?.[cardIndex];
        const card = typeof entry === "string" ? entry : entry?.card;
        if (!card) return;

        setSelectedDiscardCards((current) =>
            current.includes(card)
                ? current.filter((selected) => selected !== card)
                : [...current, card]
        );
        setError(null);
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

    const awaitingHero =
        viewingHistoryId === null && !!scenario?.awaiting_hero;
    const isCardSelectDecision =
        scenario?.decision?.domain === "CARD_SELECT";
    const cardSelectOption = isCardSelectDecision
        ? scenario?.decision?.options?.[0]
        : null;
    const opponentDiscardCount =
        scenario?.hero_position === "IP" &&
        Number.isInteger(scenario?.opponent_discard_count)
            ? scenario.opponent_discard_count
            : null;

    const heroPlayer = scenario?.players?.[scenario.hero_seat] || null;
    const rawAllowedActions = scenario?.hero_allowed_actions || [];
    const usesAllIn = rawAllowedActions.includes("all_in");
    const panelActions = rawAllowedActions.map((action) =>
        action === "all_in"
            ? ((heroPlayer?.bet ?? 0) > 0 ? "raise" : "bet")
            : action
    );

    const handlePanelAction = (panelActionType, amount) => {
        if (Array.isArray(scenario?.hero_action_options)) {
            handleAction(panelActionType, amount);
            return;
        }

        if (panelActionType === "bet" || panelActionType === "raise") {
            handleAction(usesAllIn ? "all_in" : "bet");
        } else {
            handleAction(panelActionType);
        }
    };

    const playersForTable = scenario?.players
        ? Object.fromEntries(
            Object.entries(scenario.players).map(([seat, player]) => [
                seat,
                {
                    ...player,
                    hand: (player.hand || []).map((entry) => {
                        if (!entry) return null;

                        const card = typeof entry === "string"
                            ? entry
                            : entry.card;
                        if (!card) return entry;

                        return {
                            ...(typeof entry === "object" ? entry : {}),
                            card,
                            selected:
                                isCardSelectDecision &&
                                Number(seat) === Number(scenario.hero_seat) &&
                                selectedDiscardCards.includes(card),
                        };
                    }),
                },
            ])
        )
        : {};

    return (
        <div className="game-simulator">
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
                        onChange={(event) => setSelectedScenario(event.target.value)}
                        disabled={scenarios.length === 0 || loading}
                    >
                        {scenarios.length === 0 && (
                            <option value="">Loading…</option>
                        )}
                        {scenarios.map((entry) => (
                            <option
                                key={entry.key}
                                value={entry.key}
                                title={entry.description}
                            >
                                {entry.label}
                            </option>
                        ))}
                    </select>

                    {checkpointOptions &&
                        checkpointOptions.checkpoints.length > 0 && (
                            <>
                                <label
                                    htmlFor="trainer-checkpoint-select"
                                    className="game-variant-label"
                                >
                                    Model:
                                </label>
                                <select
                                    id="trainer-checkpoint-select"
                                    className="game-variant-dropdown"
                                    value={checkpointOptions.selected_checkpoint || ""}
                                    onChange={(event) =>
                                        handleCheckpointChange(
                                            event.target.value || null
                                        )
                                    }
                                    disabled={loading}
                                    title={checkpointOptions.checkpoint_dir || ""}
                                >
                                    <option value="">
                                        Default ({checkpointOptions.default_checkpoint})
                                    </option>
                                    {checkpointOptions.checkpoints.map((filename) => (
                                        <option key={filename} value={filename}>
                                            {filename}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}

                    <button
                        className="game-btn"
                        onClick={handleNewScenario}
                        disabled={loading}
                    >
                        New Scenario
                    </button>
                    <button
                        className="game-btn"
                        onClick={handleResetScoreboard}
                    >
                        Reset Scoreboard
                    </button>
                    <button
                        className="game-btn"
                        onClick={() => setShowHandGrid((value) => !value)}
                        disabled={!scenario || !supportsHandGrid}
                        title={
                            !supportsHandGrid
                                ? "Hand grid is only available for 2-hole-card games"
                                : undefined
                        }
                    >
                        {showHandGrid ? "Show Table" : "Show Hand Grid"}
                    </button>
                    <button
                        className="game-btn"
                        onClick={handleShowDebug}
                        disabled={!selectedScenario}
                    >
                        {debugInfo ? "Refresh Debug Info" : "Debug: Which Model?"}
                    </button>
                    <button
                        className="game-btn"
                        onClick={handleShowLiveDebug}
                        disabled={!scenario}
                    >
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
                <div className="game-info-bar game-info-bar--col">
                    <div>
                        <strong>{debugInfo.scenario_key}</strong> — verdict:{" "}
                        <strong
                            style={{
                                color: debugInfo.verdict?.startsWith("REAL")
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
                        {debugInfo.checkpoint_exists_on_disk
                            ? "(found)"
                            : "(MISSING on disk)"}
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
                        {debugInfo.encoder_path &&
                            (debugInfo.encoder_path_exists_on_disk
                                ? "(found)"
                                : "(MISSING on disk)")}
                    </div>

                    {debugInfo.pipeline_trace && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ fontWeight: 600 }}>
                                Build pipeline (top to bottom):
                            </div>
                            {debugInfo.pipeline_trace.map((entry, index) => (
                                <div
                                    key={index}
                                    style={{
                                        fontSize: "0.85em",
                                        color: entry.status === "ok"
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
                            <div style={{ fontWeight: 600 }}>
                                Live observation (current decision point):
                            </div>
                            <div style={{ fontSize: "0.85em" }}>
                                position: {debugInfo.live_observation.hero_position} (rl_seat{" "}
                                {debugInfo.live_observation.hero_rl_seat}) · pot:{" "}
                                {debugInfo.live_observation.pot} · to_call:{" "}
                                {debugInfo.live_observation.bet_to_call} · hole:{" "}
                                {debugInfo.live_observation.hole_cards.join(",")} · board:{" "}
                                {debugInfo.live_observation.board_cards
                                    .filter(Boolean)
                                    .join(",") || "—"}
                            </div>
                            <div style={{ fontSize: "0.85em" }}>
                                action probs:{" "}
                                {Object.entries(debugInfo.live_action_probs || {})
                                    .map(([action, probability]) =>
                                        `${action}=${(probability * 100).toFixed(1)}%`
                                    )
                                    .join(", ")}
                            </div>
                        </div>
                    )}

                    <button
                        className="game-btn"
                        onClick={() => setDebugInfo(null)}
                    >
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
                <div
                    className="game-info-bar"
                    style={{ borderColor: "#f59e0b", color: "#f59e0b" }}
                >
                    Viewing a past hand (read-only).{" "}
                    <button className="game-btn" onClick={handleNewScenario}>
                        Return to Live Play
                    </button>
                </div>
            )}

            {scenario && (
                <div className="game-info-bar">
                    <span>
                        Position: <strong>{scenario.hero_position}</strong>
                    </span>
                    <span style={{ marginLeft: 16 }}>
                        Effective Stack:{" "}
                        <strong>{scenario.hero_effective_bb} bb</strong>
                    </span>
                    <span style={{ marginLeft: 16 }}>Pot: {scenario.pot}</span>
                </div>
            )}

            {isCardSelectDecision &&
                scenario?.hero_position === "IP" &&
                Number.isInteger(scenario?.opponent_discard_count) && (
                    <div className="game-info-bar">
                        OOP discarded {scenario.opponent_discard_count} card
                        {scenario.opponent_discard_count === 1 ? "" : "s"}.
                    </div>
                )}

            {scenario && (
                <div className="game-layout">
                    <div className={`game-layout__main ${showHandGrid ? "game-layout__main--scroll" : ""}`}>
                        {showHandGrid ? (
                            <>
                                <div
                                    className="game-info-bar"
                                    style={{ fontSize: "0.9em" }}
                                >
                                    <strong>Board:</strong>{" "}
                                    {(scenario.nodes || [])
                                        .map((node) => node.card)
                                        .filter(Boolean)
                                        .join(" ") || "—"}
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Effective Stack:</strong>{" "}
                                        {scenario.hero_effective_bb}bb
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Pot:</strong> {scenario.pot}
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>To Call:</strong>{" "}
                                        {scenario.to_call ?? 0}
                                    </span>
                                    <span style={{ marginLeft: 16 }}>
                                        <strong>Decision:</strong>{" "}
                                        {(scenario.hero_allowed_actions || [])
                                            .map((action) =>
                                                ACTION_LABELS[action] || action
                                            )
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
                                        players={playersForTable}
                                        boardCards={[]}
                                        nodes={scenario.nodes}
                                        layoutName={scenario.layout_name}
                                        points={scenario.points}
                                        showdown={scenario.showdown}
                                        dealerSeat={1}
                                        actionSeat={
                                            awaitingHero
                                                ? scenario.hero_seat
                                                : null
                                        }
                                        onSeatClick={() => {}}
                                        onPlayerCardClick={handleTableCardClick}
                                        onPlayerSlotClick={() => {}}
                                        onBoardCardClick={() => {}}
                                        onBoardSlotClick={() => {}}
                                        onBoardAreaClick={() => {}}
                                        loading={loading}
                                        heroSeat={scenario.hero_seat}
                                    />
                                </div>

                                {scenario.action_log &&
                                    scenario.action_log.length > 0 && (
                                        <div className="game-info-bar game-info-bar--col game-info-bar--log">
                                            {scenario.action_log.map((entry, index) => {
                                                const who = entry.actor === "hero" ? "You" : "AI";
                                                const label = ACTION_LABELS[entry.action] || entry.action;
                                                const amountStr = entry.amount
                                                    ? ` $${entry.amount}`
                                                    : "";
                                                return (
                                                    <div key={index}>
                                                        <strong>{who}</strong> ({entry.position}): {label}
                                                        {amountStr}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                {awaitingHero && isCardSelectDecision && (
                                    <div className="trainer-actions">
                                        <CardSelectPanel
                                            player={heroPlayer}
                                            minCount={scenario.decision?.options?.[0]?.min_count}
                                            maxCount={scenario.decision?.options?.[0]?.max_count}
                                            selectedCards={selectedDiscardCards}
                                            onConfirm={handleDiscardConfirm}
                                            onClear={handleDiscardClear}
                                            submitting={loading}
                                            error={error}
                                        />
                                        <div className="game-info-bar game-info-bar--col trainer-draw">
                                            <button
                                                className="game-btn"
                                                onClick={handleShowAiDraw}
                                                disabled={loading || drawSuggestionLoading}
                                            >
                                                {drawSuggestionLoading
                                                    ? "Asking AI…"
                                                    : drawSuggestion
                                                        ? "Refresh AI's draw"
                                                        : "Show AI's draw"}
                                            </button>

                                            {drawSuggestionError && (
                                                <div style={{ color: "#f87171" }}>{drawSuggestionError}</div>
                                            )}

                                            {drawSuggestion?.approximate && (
                                                <div style={{ fontSize: "0.8em", opacity: 0.7 }}>
                                                    Approximate — the AI's multi-card draws could only be
                                                    partially explored.
                                                </div>
                                            )}

                                            {drawOptions.map((opt, i) => {
                                                const active = sameCards(opt.discard, selectedDiscardCards);
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`trainer-draw__opt ${active ? "trainer-draw__opt--active" : ""} ${i === 0 ? "trainer-draw__opt--best" : ""}`}
                                                        onClick={() => handlePreviewDrawOption(opt.discard)}
                                                        title="Click to highlight this draw on your hand"
                                                    >
                                                        {i === 0 && <strong>AI best: </strong>}
                                                        {opt.discard.length === 0
                                                            ? "Stand pat"
                                                            : `Discard ${opt.discard.length}: ${opt.discard.join(" ")}`}
                                                        {opt.prob != null && ` (${(opt.prob * 100).toFixed(1)}%)`}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {awaitingHero && !isCardSelectDecision && (
                                    <div className="trainer-actions">
                                        <PlayerActionPanel
                                            player={heroPlayer}
                                            availableActions={panelActions}
                                            discreteOptions={scenario?.hero_action_options}
                                            minRaise={scenario.max_raise}
                                            maxRaise={scenario.max_raise}
                                            toCall={scenario.to_call}
                                            onAction={handlePanelAction}
                                            disabled={loading}
                                        />
                                    </div>
                                )}

                                {lastDecision && (
                                    <div
                                        className="game-info-bar"
                                        style={{
                                            borderColor: lastDecision.correct
                                                ? "#22c55e"
                                                : "#f87171",
                                            color: lastDecision.correct
                                                ? "#22c55e"
                                                : "#f87171",
                                        }}
                                    >
                                        {lastDecision.correct ? "✓ Correct" : "✗ Incorrect"} — you chose{" "}
                                        <strong>
                                            {ACTION_LABELS[lastDecision.hero_action] ||
                                                lastDecision.hero_action}
                                        </strong>
                                        , best was{" "}
                                        <strong>
                                            {ACTION_LABELS[lastDecision.best_action] ||
                                                lastDecision.best_action}
                                        </strong>
                                        <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                                            {lastDecision.explanation}
                                        </div>
                                    </div>
                                )}

                                {scenario.hand_over &&
                                    !awaitingHero &&
                                    viewingHistoryId === null && (
                                        <div className="game-info-bar">
                                            Hand complete — next scenario starting…
                                        </div>
                                    )}
                            </>
                        )}
                    </div>

                    {scoreboard && (
                        <SideSheet
                            className="game-layout__sidebar"
                            title={`Scoreboard · ${scoreboard.correct}✓ ${scoreboard.incorrect}✗`}
                        >
                            <div className="trainer-scoreboard">
                                <h3>Scoreboard</h3>
                                <div>Correct: {scoreboard.correct}</div>
                                <div>Incorrect: {scoreboard.incorrect}</div>
                                <div>
                                    Accuracy:{" "}
                                    {scoreboard.accuracy != null
                                        ? `${(scoreboard.accuracy * 100).toFixed(1)}%`
                                        : "—"}
                                </div>

                                <h4>Recent (click to review)</h4>
                                <div className="trainer-history">
                                    {scoreboard.history.slice().reverse().map((entry) => (
                                        <div
                                            key={entry.id}
                                            onClick={() => handleHistoryClick(entry)}
                                            className={[
                                                "trainer-history__row",
                                                entry.correct ? "trainer-history__row--ok" : "trainer-history__row--bad",
                                                viewingHistoryId === entry.id ? "trainer-history__row--viewing" : "",
                                            ].join(" ")}
                                        >
                                            {entry.hand} ({entry.position},{" "}
                                            {entry.effective_stack_bb}bb): {entry.hero_action} →{" "}
                                            {entry.best_action} {entry.correct ? "✓" : "✗"}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SideSheet>
                    )}
                </div>
            )}
        </div>
    );
};

export default Trainer;