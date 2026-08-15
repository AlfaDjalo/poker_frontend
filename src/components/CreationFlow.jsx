import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PokerTable from "./PokerTable";
import HandEditor from "./HandEditor";
import PlayerActionPanel from "./PlayerActionPanel"
import { useHandEditor } from "../hooks/useHandEditor";
import { fetchVariants } from "../api/tutorialApi";
import "../css/HandEditor.css";

/**
 * Returns true once every active (non-_inactive) player has every
 * hole_cards slot filled.
 */
function allHoleCardsDealt(editState) {
    if (!editState) return false;
    const active = editState.players.filter(p => !p._inactive);
    if (active.length === 0) return false;
    return active.every(p => p.hole_cards.length > 0 && p.hole_cards.every(c => c != null));
}

/**
 * Returns true once every node belonging to `streetIdx` is filled.
 */
function streetFullyDealt(editState, boardLayout, streetIdx) {
    if (!editState || !boardLayout) return false;
    const nodeIdxs = boardLayout.streets?.[streetIdx] ?? [];
    if (nodeIdxs.length === 0) return true; // nothing to deal this street
    return nodeIdxs.every(idx => editState.node_cards[idx] != null);
}
 
/**
 * Decide whether the user may advance out of `phase`.
 * SETUP requires at least 2 active players. Hole-card and board-deal
 * phases require their respective slots to be full. Betting/showdown
 * phases have no card-completeness gate (pot/stacks are free-form).
 */
function canLeavePhase(phase, editState, boardLayout, bettingClosed) {
    if (!phase) return false;
    if (phase.id === "SETUP") {
        return (editState?.players || []).filter(p => !p._inactive).length >= 2;
    }
    if (phase.deals_hole) {
        return allHoleCardsDealt(editState);
    }
    if (phase.deals_board_street != null) {
        return streetFullyDealt(editState, boardLayout, phase.deals_board_street);
    }
    if (phase.allows_betting) {
        return !!bettingClosed;
    }
    return true;
}

const CreationFlow = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const handIdParam = searchParams.get("handId");

    const [variants, setVariants]     = useState([]);
    const [gameName, setGameName]     = useState("");
    const [started, setStarted]       = useState(false);

    React.useEffect(() => {
        fetchVariants().then(v => {
            setVariants(v);
            if (v.length) setGameName(v[0]);
        }).catch(() => {});
    }, []);

    const editor = useHandEditor({
        mode: "creation",
        gameName,
        onApplied: () => navigate("/tutorial"),
        onCancelled: () => navigate("/tutorial"),
    });

    // ── Load an existing hypothetical hand for editing (§3.5.1) ────────
    // Triggered by navigating here with ?handId=N (e.g. from HandReplayer's
    // "✏ Edit in Creator" button). Skips the variant-picker / Start screen
    // entirely since gameName/variant come from the loaded hand itself.
    const loadedHandIdRef = React.useRef(null);
    useEffect(() => {
        if (!handIdParam) return;
        const id = Number(handIdParam);
        if (Number.isNaN(id) || loadedHandIdRef.current === id) return;
        loadedHandIdRef.current = id;
        editor.loadExistingHand(id).then(() => setStarted(true));
    }, [handIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep gameName in sync with the loaded hand so variantConfig (hole
    // card count, board layout, creation_phases) fetches for the right
    // variant rather than whatever the dropdown happened to default to.
    useEffect(() => {
        if (editor.editState?.game_name && editor.editState.game_name !== gameName) {
            setGameName(editor.editState.game_name);
        }
    }, [editor.editState?.game_name]); // eslint-disable-line react-hooks/exhaustive-deps

    const {
        creationPhases,
        currentPhase,
        phaseIdx,
        nextPhase,
        prevPhase,
        invalidateAfterPhase,
        variantConfig,
        configLoading,
        actingSeat,
        availableActions,
        minRaise,
        maxRaise,
        bettingClosed,
        onPlayerAction,
    } = editor;

    const isLastPhase  = phaseIdx === creationPhases.length - 1;
    const canAdvance = canLeavePhase(currentPhase, editor.editState, variantConfig?.board_layout, bettingClosed);

    // Whether card-editing actions (deal hole / deal board) are legal in the
    // CURRENT phase. Used to decide whether to pass through real handlers or
    // no-ops to PokerTable/HandEditor's drag targets.
    const phaseAllowsHoleDeal = !!currentPhase?.deals_hole;
    const phaseAllowsBoardStreet = currentPhase?.deals_board_street ?? null;

    const handleStart = () => {
        editor.beginEdit();
        setStarted(true);
    };

    const handleNextPhase = () => {
        if (!isLastPhase && canAdvance) nextPhase();
    };

    const handlePrevPhase = () => {
        if (phaseIdx > 0) {
            if (!window.confirm("Stepping back will clear all subsequent cards and actions. Continue?")) return;
            invalidateAfterPhase(phaseIdx - 1);
            prevPhase();
        }
    };

    // ── Seat active/inactive map for PokerTable ─────────────────────
    const seatActiveMap = React.useMemo(() => {
        if (!editor.editState) return {};
        const map = {};
        for (const p of editor.editState.players) {
            map[p.seat] = !p._inactive;
        }
        return map;
    }, [editor.editState]);

    // Build a simple display hand from editState
    const displayPlayers = React.useMemo(() => {
        if (!editor.editState) return {};
        const players = {};
        for (const p of editor.editState.players) {
            if (p._inactive) continue;
            players[p.seat] = {
                seat: p.seat,
                name: p.name ?? `Player ${p.seat}`,
                stack: p.stack,
                bet: p.current_bet,
                folded: p.has_folded,
                hand: p.hole_cards.map(c =>
                    c ? { card: c, hidden: false, selected: false } : null
                ),
                equity: undefined,
            };
        }
        return players;
    }, [editor.editState]);

    const displayNodes = React.useMemo(() => {
        if (!editor.editState) return [];
        return editor.editState.node_cards.map(c =>
            c ? { card: c, hidden: false, selected: false } : null
        );
    }, [editor.editState]);


    const actingPlayer = React.useMemo(() => {
        if (actingSeat == null || !editor.editState) return null;
        const p = editor.editState.players.find(pl => pl.seat === actingSeat);
        if (!p) return null;
        return { ...p, name: p.name ?? `Player ${p.seat}`, bet: p.current_bet };
    }, [actingSeat, editor.editState]);

    // Add/remove-player controls are only meaningful during SETUP. Passing
    // undefined elsewhere makes PlayerSeat hide the buttons entirely (rather
    // than just disabling them) — seats are locked in once betting/dealing
    // begins.
    const seatToggleHandler = currentPhase?.id === "SETUP"
        ? editor.togglePlayerActive
        : undefined;

    // ── Status line — mirrors GameStatusBar's "Action on X" messaging ──
    const statusMessage = React.useMemo(() => {
        if (!currentPhase) return "";
        if (actingPlayer) {
            const toCall = editor.editState
                ? editor.editState.bet_to_call - actingPlayer.current_bet
                : 0;
            return toCall > 0
                ? `Action on ${actingPlayer.name} — $${toCall} to call`
                : `Action on ${actingPlayer.name}`;
        }
        if (currentPhase.id === "SETUP") return "Add players to the table.";
        if (currentPhase.deals_hole) return "Deal hole cards to every player.";
        if (currentPhase.deals_board_street != null) return `Dealing ${currentPhase.label}.`;
        if (currentPhase.id === "SHOWDOWN") return "Showdown.";
        return "";
    }, [currentPhase, actingPlayer, editor.editState]);

    // ── Card click handlers — clicking a filled slot removes the card  ──
    // (returns it to the deck). Clicking an empty slot is a no-op; cards
    // are assigned via drag-and-drop from CardSelector, gated by phase
    // inside useHandEditor's moveCard.
    const handlePlayerCardClick = useCallback((seatNum, cardIndex) => {
        const card = editor.editState?.players
            ?.find(p => p.seat === seatNum)?.hole_cards?.[cardIndex];
        if (card) editor.moveCard(card, `player-${seatNum}`, "deck");
    }, [editor]);
 
    const handleBoardCardClick = useCallback((nodeIndex) => {
        const card = editor.editState?.node_cards?.[nodeIndex];
        if (card) editor.moveCard(card, `node-${nodeIndex}`, "deck");
    }, [editor]);

    if (handIdParam && (editor.loadingExisting || !started)) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "calc(100vh - 56px)",
                gap: 16, background: "#060709", fontFamily: "Courier New, monospace",
            }}>
                <div style={{ fontSize: 18, color: "#f59e0b" }}>
                    {editor.loadExistingError ? "Failed to load hand" : "Loading hand…"}
                </div>
                {editor.loadExistingError && (
                    <div style={{ color: "#8899aa", fontSize: 13 }}>{editor.loadExistingError}</div>
                )}
            </div>
        );
    }

    if (!started) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "calc(100vh - 56px)",
                gap: 20, background: "#060709", fontFamily: "Courier New, monospace",
            }}>
                <div style={{ fontSize: 28, color: "#f59e0b", fontWeight: 700 }}>Create a Tutorial Hand</div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ color: "#8899aa", fontSize: 14 }}>Game:</label>
                    <select
                        value={gameName}
                        onChange={e => setGameName(e.target.value)}
                        style={{
                            background: "#0d1020", border: "1px solid #1e2535",
                            color: "#c8d0e0", fontFamily: "Courier New, monospace",
                            fontSize: 14, padding: "6px 10px", borderRadius: 4,
                        }}
                    >
                        {variants.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>

                <button
                    onClick={handleStart}
                    disabled={!gameName || configLoading}
                    style={{
                        background: "#f59e0b", color: "#060709", border: "none",
                        borderRadius: 4, padding: "10px 24px",
                        fontFamily: "Courier New, monospace", fontSize: 15,
                        fontWeight: 700, cursor: "pointer",
                    }}
                >
                      {configLoading ? "Loading…" : "Start"}
                </button>
            </div>
        );
    }

    const tableElement = (
        <PokerTable
            players={displayPlayers}
            boardCards={[]}
            nodes={displayNodes}
            layoutName={variantConfig?.layout_name ?? gameName}
            points={[]}
            showdown={null}
            dealerSeat={1}
            actionSeat={actingSeat}
            isEditing={true}
            holeCardCount={editor.holeCardCount}
            seatActive={seatActiveMap}
            onToggleSeatActive={seatToggleHandler}
            onSeatClick={() => {}}
            onPlayerCardClick={handlePlayerCardClick}
            onPlayerSlotClick={() => {}}
            onBoardCardClick={handleBoardCardClick}
            onBoardSlotClick={() => {}}
            onBoardAreaClick={() => {}}
            onNameChange={editor.setPlayerName}
            onStackChange={editor.setStack}
            loading={false}
        />
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", overflow: "hidden" }}>

            {/* Phase indicator */}
            <div style={{
                display: "flex", alignItems: "center", gap: 16, padding: "8px 16px",
                background: "#0a0c12", borderBottom: "1px solid #1e2535", flexShrink: 0,
                overflowX: "auto",
            }}>
                <button onClick={handlePrevPhase} disabled={phaseIdx === 0} className="editor-btn editor-btn--cancel" style={{ padding: "4px 12px" }}>
                    ◀ Back
                </button>
                {creationPhases.map((p, i) => (
                    <span
                        key={p.id}
                        style={{
                            fontSize: 11,
                            color: i === phaseIdx ? "#f59e0b" : i < phaseIdx ? "#4a5568" : "#2a3348",
                            fontFamily: "Courier New, monospace",
                            fontWeight: i === phaseIdx ? 700 : 400,
                            borderBottom: i === phaseIdx ? "2px solid #f59e0b" : "none",
                            paddingBottom: 2,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {p.label}
                    </span>
                ))}
                {!isLastPhase && (
                    <button 
                        onClick={handleNextPhase} 
                        disabled={!canAdvance}
                        title={!canAdvance ? "Complete this step before continuing" : undefined}
                        className="editor-btn editor-btn--apply" 
                        style={{ padding: "4px 12px", marginLeft: "auto" }}
                    >
                        Next ▶
                    </button>
                )}
            </div>

            {/* Current-phase hint */}
            {currentPhase && statusMessage && (
                <div style={{
                    padding: "6px 16px", background: "#0d1020", color: "#8899aa",
                    fontFamily: "Courier New, monospace", fontSize: 12, flexShrink: 0,
                    borderBottom: "1px solid #1e2535",
                }}>
                    {statusMessage}
                </div>
            )}

            {currentPhase && !canAdvance && (
                <div style={{
                    padding: "6px 16px", background: "#1a1208", color: "#f59e0b",
                    fontFamily: "Courier New, monospace", fontSize: 12, flexShrink: 0,
                }}>
                    {currentPhase.id === "SETUP" && "Add at least 2 players to continue."}
                    {currentPhase.deals_hole && "Deal hole cards to every player to continue."}
                    {currentPhase.deals_board_street != null && "Deal all board cards for this street to continue."}
                </div>
            )}
 
            {/* Editor */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
                    <HandEditor
                        mode="creation"
                        editState={editor.editState}
                        validationErrors={editor.validationErrors}
                        serverErrors={editor.serverErrors}
                        submitting={editor.submitting}
                        showDiscardPile={true}
                        onMoveCard={editor.moveCard}
                        onSetPot={editor.setPot}
                        onApply={undefined}
                        onPlayFromHere={undefined}
                        onSave={() => editor.saveHand(editor.buildHandPayload())}
                        onSaveAsNew={editor.editingHandId != null
                            ? () => editor.saveHand(editor.buildHandPayload(), { asNew: true })
                            : undefined}
                        onCancel={editor.cancelEdit}
                    >
                        {tableElement}
                    </HandEditor>
                </div>

                {actingPlayer && (
                    <PlayerActionPanel
                        player={actingPlayer}
                        availableActions={availableActions}
                        minRaise={minRaise}
                        maxRaise={maxRaise}
                        disabled={editor.submitting}
                        onAction={onPlayerAction}
                    />
                )}
            </div>
        </div>
    );
};

export default CreationFlow;