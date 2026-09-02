import React, { useState, useEffect, useCallback } from 'react';

import PokerTable from "./PokerTable";
import ShowdownSummary from './ShowdownSummary';
import PlayerActionPanel from "./PlayerActionPanel";
import GameStatusBar from "./GameStatusBar";
import WinnerBanner from "./WinnerBanner";
import HandEditor from "./HandEditor";
import EquityPanel from './EquityPanel';
import CardSelectPanel from "./CardSelectPanel";

import { useHandEditor } from '../hooks/useHandEditor';
import { useEquity, buildEquityParamsFromHand } from '../hooks/useEquity';
import { restart, startNewHand, sendAction, sendCardSelectAction, getVariants } from '../api/pokerApi';
import "../css/GameSimulator.css";

const FALLBACK_STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"];

// GraphEngine live games no longer carry street_names on the DTO
// (GameDefinition.street_names was removed — see game_service.py's
// module docstring). Prefer whatever the current decision node's
// metadata carries (node_metadata.street_name), then fall back to the
// legacy street_names array (still populated for Replay/Tutorial),
// then a generic "Street N" label.
function getStreetName(hand, streetIndex) {
    const nodeStreetName = hand?.decision?.node_metadata?.street_name;
    if (nodeStreetName) return nodeStreetName;

    if (hand?.street_names) {
        const name = hand.street_names[streetIndex];
        if (name != null) return name;
    }
    return FALLBACK_STREET_NAMES[streetIndex] ?? `Street ${streetIndex}`;
}

// A hand is "in progress" in any phase except HAND_COMPLETE/SHOWDOWN
// (and null = no hand yet). `phase` here is the derived legacy-shaped
// string pokerApi.formatHandData computes from hand_complete/decision.
const isHandInProgress = (hand) =>
    hand !== null && hand?.phase !== "HAND_COMPLETE" && hand?.phase !== "SHOWDOWN";

// Format a yaml stem into a human-readable label
const formatVariantLabel = (name) =>
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EMPTY_SELECTION = { playerCards: {}, boardCards: []};

// Settings — in future these will come from a settings store.
// Live editing is temporarily disabled: GraphEngine has no
// snapshot/restore mechanism yet, so /game/edit/* now return 501
// unconditionally (see BACKEND_MIGRATION_PROMPT's "Hand Editor is
// temporarily disabled server-side"). Flip back to true once the
// backend re-implements it. Even with this left true, editor.editorUnavailable
// (set the first time beginEdit/applyEdit hits a real 501) hides the
// button outright — see the render below.
const EDITOR_SETTINGS = {
    live_editing_enabled: false,
    show_discard_pile: true,
};

const GameSimulator = () =>
{
    const [hand, setHand] = useState(null);
    // isHandComplete/availableActions were never real DTO fields — the
    // backend emits `phase` (a derived string: "BETTING" / "SHOWDOWN" /
    // "HAND_COMPLETE" / "DEAL_BOARD") and `available_actions`
    // (snake_case) — see state_dto.py's GameStateDTO._derive_legacy_fields.
    // Reading the old camelCase names silently evaluated to `undefined`
    // every time, which is why the action panel never rendered: see
    // `actionPlayer` below, which had the same bug.
    const isHandOver = hand?.phase === "HAND_COMPLETE" || hand?.phase === "SHOWDOWN";
    const availableActions = hand?.available_actions || [];

    // ---- Variant state ----    
    const [variants, setVariants] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [pendingGame, setPendingGame] = useState(null);

    const [prevPot, setPrevPot] = useState(0);
    const [animatePot, setAnimatePot] = useState(false);
    const [showWinner, setShowWinner] = useState(false);

    const [showEquity, setShowEquity] = useState(false);

    // ---- CARD_SELECT state (e.g. drawmaha's discard/draw step) ----
    const [cardSelectSubmitting, setCardSelectSubmitting] = useState(false);
    const [cardSelectError, setCardSelectError] = useState(null);

    // selectedCards holds the user's card toggle state.
    // Shape: { playerCards: { [seatNum]: string[] }, boardCards: string[] }
    const [selectedCards, setSelectedCards] = useState(EMPTY_SELECTION);

        // ── Hand editor (live mode) ────────────────────────────────────
    const editor = useHandEditor({
        mode: "live",
        hand,
        onApplied: (newHandState) => {
            // Backend returns the new game state after apply
            setHandNormalized(newHandState);
            setSelectedCards(EMPTY_SELECTION);
        },
        onCancelled: () => {
            // Hand state was already restored server-side via cancelEdit
            // Re-fetch by restarting — or simply let the user click New Hand
            // For now we just clear selection; the hand in memory is gone
            setSelectedCards(EMPTY_SELECTION);
        },
    });

    const { equity, loading: equityLoading, error: equityError, calculate, clear: clearEquity } = useEquity();

    // Load available variants once on mount
    useEffect(() => {
        getVariants()
            .then(({ variants: v, current }) => {
                setVariants(v);
                setSelectedGame(current);
                setPendingGame(current);
            })
            .catch(err => console.error("Failed to load variants:", err))
    }, []);

    useEffect(() => {
        if (!hand) return;

        if ((hand.phase === "SHOWDOWN" || hand.phase === "HAND_COMPLETE") && hand.winners?.length) {
            setShowWinner(true);
        }

        if (prevPot > 0 && hand.pot === 0) {
            setAnimatePot(true);
            setTimeout(() => setAnimatePot(false), 800);
        }

        setPrevPot(hand.pot);
    }, [hand]);

    // ---- Card toggle helpers ----
 
    // Toggle a single player card in/out of selectedCards.
    const togglePlayerCard = useCallback((seatNum, card) => {
        setSelectedCards(prev => {
            const seatCards = prev.playerCards[seatNum] || [];
            const next = seatCards.includes(card)
                ? seatCards.filter(c => c !== card)
                : [...seatCards, card];
            return {
                ...prev,
                playerCards: { ...prev.playerCards, [seatNum]: next},
            };
        });
    }, []);

    // Toggle a single board card in/out of selectedCards.
    const toggleBoardCard = useCallback((card) => {
        setSelectedCards(prev => {
            const next = prev.boardCards.includes(card)
                ? prev.boardCards.filter(c => c !== card)
                : [...prev.boardCards, card];
            return { ...prev, boardCards: next };
        });
    }, []);

    // ---- Actions ----
    
    const handleRestart = async () => {
        const newHand = await restart(pendingGame);
        setSelectedGame(pendingGame);
        setSelectedCards(EMPTY_SELECTION);      // clear selection on restart
        setCardSelectError(null);
        setHandNormalized(newHand);
        clearEquity();
    };
    
    const handleNewHand = async () => {
        const newHand = await startNewHand(pendingGame);
        setSelectedGame(pendingGame);
        setSelectedCards(EMPTY_SELECTION);      // clear selection on new hand
        setCardSelectError(null);
        setHandNormalized(newHand);
        clearEquity();
    };

    const handlePlayerAction = async (type, amount) => {
        const updated = await sendAction(type, amount);
        setSelectedCards(EMPTY_SELECTION);      // clear selection on every action
        setHandNormalized(updated);
        clearEquity();
        // handleCalculateEquity() // Temp !!!
    }

    const handleVariantChange = (e) => {
        setPendingGame(e.target.value);
    }

    // ---- CARD_SELECT actions (e.g. drawmaha discard/draw) ----

    // Submits a CARD_SELECT decision. Factored out from the Confirm
    // button's onClick (below) so it can also be called by a future AI
    // driver with its own chosen cards, without first staging them
    // into `selectedCards` via UI clicks. `seat` is accepted for
    // clarity/logging at call sites — it is NOT sent to the API: like
    // the BETTING action endpoint, /game/action infers the acting seat
    // itself from the engine's current pending decision, it doesn't
    // take a seat argument.
    //
    // TODO(AI players): once seats can be marked AI-controlled, add an
    // effect here that watches `isCardSelectDecision` and, if
    // `actionPlayer` is AI-controlled, calls
    // `submitCardSelection(actionPlayer, aiChosenCards)` directly
    // (bypassing CardSelectPanel/onPlayerCardClick entirely) instead of
    // waiting on a human to click cards + Confirm. The same shape would
    // apply to BETTING via handlePlayerAction.
    const submitCardSelection = useCallback(async (seat, cards) => {
        setCardSelectSubmitting(true);
        setCardSelectError(null);
        try {
            const updated = await sendCardSelectAction(cards);
            setSelectedCards(EMPTY_SELECTION);
            setHandNormalized(updated);
            clearEquity();
        } catch (e) {
            // Illegal count etc. surfaces as a 400 from
            // CardSelectResolver.apply()'s validate step — same
            // error-toast plumbing pattern the betting panel relies on.
            setCardSelectError(e.message);
        } finally {
            setCardSelectSubmitting(false);
        }
    }, [clearEquity]);

    const handleCardSelectConfirm = () => {
        if (actionPlayer == null) return;
        if (!cardSelectOption || !Number.isInteger(cardSelectOption.min_count) || !Number.isInteger(cardSelectOption.max_count)) {
            // Defense in depth — CardSelectPanel's Confirm button is
            // already disabled in this state, but guard here too in
            // case this is ever invoked some other way.
            setCardSelectError("Selection requirements unavailable — cannot submit yet.");
            return;
        }
        const cards = selectedCards.playerCards[actionPlayer] || [];
        submitCardSelection(actionPlayer, cards);
    };

    const handleCardSelectClear = () => {
        if (actionPlayer == null) return;
        setCardSelectError(null);
        setSelectedCards(prev => ({
            ...prev,
            playerCards: { ...prev.playerCards, [actionPlayer]: [] },
        }));
    };
            
    // 1-based, set while a decision of a domain this component knows how
    // to render is pending. Prefer decision.seat directly — current_player
    // is documented as just a convenience mirror of decision.seat
    // (graph_engine_adapter.py), so reading decision.seat first is robust
    // to any gap in that mirroring on the backend during the GraphEngine
    // migration. BETTING kept the hand.phase check it already had (its
    // legacy-shaped mirror of decision.domain); CARD_SELECT reads
    // decision.domain directly since there's no analogous legacy field.
    const isBettingDecision = hand?.phase === "BETTING";
    const isCardSelectDecision = hand?.decision?.domain === "CARD_SELECT";

    const actionPlayer =
        isBettingDecision ? (hand.decision?.seat ?? hand.current_player ?? null)
        // Same fallback as BETTING above, and for the same reason: current_player
        // is documented as a mirror of decision.seat, and relying on decision.seat
        // alone means any gap in that mirroring for this domain (seen during the
        // GraphEngine migration) makes actionPlayer/player resolve to null — which
        // silently hides CardSelectPanel entirely (the `player && isCardSelectDecision`
        // guard below just renders nothing), making the whole discard/draw step look
        // like it's missing rather than erroring visibly.
        : isCardSelectDecision ? (hand.decision?.seat ?? hand.current_player ?? null)
        : null;

    const player = 
        actionPlayer != null && hand?.players?.[actionPlayer]
        ? hand.players[actionPlayer] 
        : null;

    // decision.options[0] carries min_count/max_count as top-level fields
    // for CARD_SELECT (sibling to action_name/label — see game_api.py's
    // ActionRequest docstring), not nested under metadata.
    const cardSelectOption = isCardSelectDecision ? (hand.decision?.options?.[0] ?? null) : null;

    // ── DEBUG: decision tracing (Issue: "discard events are not happening") ──
    // Always on (not gated behind a flag) — this only logs when the pending
    // decision actually changes, so it's cheap, and it's the fastest way to
    // tell WHERE the discard step is being lost:
    //   - If a CARD_SELECT line never appears in the console for a drawmaha
    //     hand at all, the backend/engine never sent that decision — not a
    //     frontend bug, look at the flow graph / GraphEngine side.
    //   - If it DOES appear but is immediately followed by the "could not
    //     resolve player" warning, the decision arrived but actionPlayer/
    //     player resolution failed client-side (decision.seat vs
    //     hand.players keying mismatch) — a frontend bug, and the logged
    //     values below tell you exactly which seat/keys disagreed.
    useEffect(() => {
        if (!hand?.decision) return;
        const d = hand.decision;
        console.debug(
            `[CAP][decision] domain=${d.domain} seat=${d.seat} current_player=${hand.current_player} ` +
            `phase=${hand.phase} options=${JSON.stringify(d.options)}`
        );
        if (d.domain === "CARD_SELECT") {
            console.debug(
                `[CAP][decision] CARD_SELECT decision received. actionPlayer=${actionPlayer}, ` +
                `resolved player=${player ? player.name ?? player.seat : "NONE"}, ` +
                `hand.players keys=${JSON.stringify(Object.keys(hand.players || {}))}`
            );
            if (player == null) {
                console.warn(
                    `[CAP][decision] CARD_SELECT decision arrived from the backend but could NOT be ` +
                    `resolved to a player. decision.seat=${d.seat}, hand.current_player=${hand.current_player}, ` +
                    `available player keys=${JSON.stringify(Object.keys(hand.players || {}))}. ` +
                    `CardSelectPanel will NOT render this turn — this is why the discard step looks ` +
                    `"not there at all". Check whether decision.seat is 0-based while hand.players is ` +
                    `keyed 1-based (or vice versa) for this domain specifically.`
                );
            }
            if (!cardSelectOption || !Number.isInteger(cardSelectOption.min_count) || !Number.isInteger(cardSelectOption.max_count)) {
                console.warn(
                    `[CAP][decision] CARD_SELECT decision has no usable min_count/max_count on its first ` +
                    `option: ${JSON.stringify(d.options?.[0])}. Confirm button will stay disabled even if ` +
                    `the panel renders.`
                );
            }
        }
    }, [hand?.decision, hand?.current_player, hand?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
    
    const isShowdown =
        hand?.phase === "SHOWDOWN" || hand?.phase === "HAND_COMPLETE";

    // ---- Normalisation helpers ----
    
    function normalizePlayers(playersArray) {
        if (!Array.isArray(playersArray)) return playersArray;
        const map = {};
        playersArray.forEach(p => { map[p.seat] = p; });
        return map;
    }
        
    const setHandNormalized = (rawHand) => {
        if (!rawHand) { setHand(null); return; }
        setHand({
            ...rawHand,
            players: normalizePlayers(rawHand.players),
        });
    };
        
    // Merge the toggle selection state into the hand object for rendering.
    // Each card object gets a `selected` boolean that Card.jsx uses to apply
    // the selected CSS class.
    function applySelection(hand, selected) {
        if (!hand) return hand;
        
        const cardStr = (c) => (c && typeof c === 'object' ? c.card : c);
        
        const players = {};
        Object.entries(hand.players).forEach(([seat, p]) => {
            const seatNum = Number(seat);
            const sel = selected.playerCards[seatNum] || [];
            players[seat] = {
                ...p,
                hand: (p.hand || []).map(c => {
                    const str = cardStr(c);
                    return str ?  { card: str, selected: sel.includes(str), hidden: c?.hidden ?? false } : null;
                }),
            };
        });
        
        const board = (hand.board || []).map(c => {
            const str = cardStr(c);
            return str ? { card: str, selected: selected.boardCards.includes(str), hidden: c?.hidden ?? false } : null
        });
        
        const nodes = (hand.nodes || []).map(c => {
            const str = cardStr(c);
            return str ? { card: str, selected: selected.boardCards.includes(str), hidden: c?.hidden ?? false } : null
        });

        // ── DEBUG: selection matching (Issue: "board cards for winning
        // hands are still not being selected"). Only runs when a
        // selection was actually requested, and only warns when
        // something doesn't match — silent otherwise. If a card shows
        // up here as unmatched, the showdown data (board_cards_used)
        // and the table's own hand.nodes disagree on how that card is
        // represented (or the card isn't actually among this hand's
        // dealt board cards at all) — that's why it shows correctly in
        // the "Best Hand" chip list (which just echoes board_cards_used
        // verbatim) but never gets the .selected highlight on the table
        // itself (which requires an exact string match against nodes).
        if (selected.boardCards.length > 0) {
            const availableNodeCards = nodes.filter(Boolean).map(n => n.card);
            const unmatchedBoard = selected.boardCards.filter(c => !availableNodeCards.includes(c));
            if (unmatchedBoard.length > 0) {
                console.warn(
                    `[CAP][selection] Board card selection includes card(s) with no match among the table's ` +
                    `current nodes: ${JSON.stringify(unmatchedBoard)}. Nodes currently available: ` +
                    `${JSON.stringify(availableNodeCards)}. Requested selection.boardCards: ` +
                    `${JSON.stringify(selected.boardCards)}.`
                );
            }
        }
        const allHoleCards = Object.values(players).flatMap(p => (p.hand || []).filter(Boolean).map(c => c.card));
        const requestedHoleCards = Object.values(selected.playerCards).flat();
        if (requestedHoleCards.length > 0) {
            const unmatchedHole = requestedHoleCards.filter(c => !allHoleCards.includes(c));
            if (unmatchedHole.length > 0) {
                console.warn(
                    `[CAP][selection] Hole card selection includes card(s) with no match among any player's ` +
                    `current hand: ${JSON.stringify(unmatchedHole)}. All visible hole cards: ` +
                    `${JSON.stringify(allHoleCards)}.`
                );
            }
        }

        return { ...hand, players, board, nodes };
    }
        
    const handleCalculateEquity = () => {
        const params = buildEquityParamsFromHand(hand);
        if (params) calculate(params);
    };    

    const displayHand = applySelection(hand, selectedCards);
    const handInProgress = isHandInProgress(hand);
    const gameWillChange = pendingGame && pendingGame !== selectedGame;

    
    // ── Build PokerTable for inside the editor ─────────────────────
    const tableElement = (
        <PokerTable
            players={displayHand ? displayHand.players : {}}
            boardCards={displayHand ? displayHand.board : []}
            nodes={displayHand ? displayHand.nodes : []}
            layoutName={hand?.layout_name}
            points={hand?.points}
            showdown={hand?.showdown}
            dealerSeat={1}
            actionSeat={editor.isEditing ? null : actionPlayer}
            onSeatClick={(seatNum) => console.log("Seat clicked:", seatNum)}
            onPlayerCardClick={(seatNum, cardIndex) => {
                if (editor.isEditing) return; // drag-and-drop handles it
                // While a CARD_SELECT decision is pending, only the
                // acting player's own hand is selectable — you can't
                // discard/select cards out of someone else's hand.
                // (Outside of a pending decision, e.g. for equity/
                // reference highlighting, any seat remains clickable.)
                if (isCardSelectDecision && seatNum !== actionPlayer) return;
                const card = displayHand?.players?.[seatNum]?.hand?.[cardIndex]?.card;
                if (card) togglePlayerCard(seatNum, card);
            }}
            onPlayerSlotClick={(seatNum, slotIndex) =>
                console.log(`Clicked slot ${slotIndex} for player ${seatNum}`)
            }
            onBoardCardClick={(nodeIndex) => {
                if (editor.isEditing) return;
                const card = displayHand?.nodes?.[nodeIndex]?.card;
                if (card) toggleBoardCard(card);
            }}
            onBoardSlotClick={(index) => console.log(`Clicked board slot ${index}`)}
            onBoardAreaClick={() => console.log("Board area clicked")}
            loading={false}
        />
    );
 
    const hasSidebarContent = (isShowdown && hand?.showdown) || showEquity;
    
    return (
        <div className="game-simulator">
 
            {/* ===== Single header bar ===== */}
            <div className="game-header">
 
                {/* Left: title + action buttons */}
                <div className="game-header__left">
                    <span className="game-header__title">Crazy Asian Poker</span>
                    <button className="game-btn" onClick={handleRestart}>Restart</button>
                    <button className="game-btn" onClick={handleNewHand} disabled={handInProgress || editor.isEditing}>                    
                        New Hand
                    </button>
                    {/* Hand Editor is temporarily unavailable — GraphEngine
                        has no snapshot/restore mechanism yet, so
                        /game/edit/* return 501. Hide the entry point
                        entirely rather than let the user hit the error;
                        flip EDITOR_SETTINGS.live_editing_enabled back on
                        once the backend re-implements it. editorUnavailable
                        is a second, dynamic gate: even if
                        live_editing_enabled is flipped back to true
                        before the backend is actually ready, the first
                        real 501 response flips this and the button is
                        replaced by a disabled placeholder instead of
                        letting the user retry a call that will keep
                        failing. */}
                    {EDITOR_SETTINGS.live_editing_enabled && !editor.editorUnavailable && hand && !isShowdown && (
                        <button
                            className={`game-btn ${editor.isEditing ? "game-btn--active" : ""}`}
                            onClick={editor.isEditing ? editor.cancelEdit : editor.beginEdit}
                            style={{ borderColor: "#f59e0b", color: editor.isEditing ? "#f59e0b" : undefined }}
                        >
                            {editor.isEditing ? "✕ Cancel Edit" : "✏ Edit"}
                        </button>
                    )}
                    {EDITOR_SETTINGS.live_editing_enabled && editor.editorUnavailable && hand && !isShowdown && (
                        <span
                            className="game-btn"
                            style={{ borderColor: "#3d4a60", color: "#6b7a94", cursor: "default" }}
                            title="Hand Editor is temporarily unavailable — the live engine has no snapshot/restore support yet."
                        >
                            ✏ Edit (unavailable)
                        </span>
                    )}
                    <button 
                        className={`game-btn ${showEquity ? "game-btn--active" : ""}`}
                        onClick={() => setShowEquity(prev => !prev)}
                        style={showEquity ? { borderColor: "#3b82f6", color: "#60a5fa" } : undefined}
                    >
                        📊 Equity
                    </button>
                </div>
 
                {/* Right: game selector */}
                <div className="game-header__right">
                    {gameWillChange && (
                        <span className="game-variant-pending">⚠ next hand</span>
                    )}
                    <label htmlFor="game-variant-select" className="game-variant-label">
                        Game:
                    </label>
                    <select
                        id="game-variant-select"
                        className={`game-variant-dropdown ${gameWillChange ? "game-variant-dropdown--pending" : ""}`}
                        value={pendingGame || ""}
                        onChange={handleVariantChange}
                        disabled={variants.length === 0 || editor.isEditing}
                        title={handInProgress ? "Takes effect on next hand" : "Select a game variant"}
                    >
                        {variants.length === 0 && <option value="">Loading…</option>}
                        {variants.map((v) => (
                            <option key={v} value={v}>{formatVariantLabel(v)}</option>
                        ))}
                    </select>
                </div>
            </div>
 
            {/* ===== Status / info bar ===== */}
            <div className="game-info-bar">
                <GameStatusBar hand={hand} />
                <div className="game-info-bar__right">
                    <span className={`pot ${animatePot ? "push" : ""}`}>
                        Pot: {hand ? hand.pot : 0}
                    </span>
                    <span className="game-info-bar__street">
                        {hand ? getStreetName(hand, hand.street) : ""}
                    </span>
                </div>
            </div>
 
            {showWinner && !editor.isEditing && (
                <WinnerBanner hand={hand} onClose={() => setShowWinner(false)} />
            )}
 
            {/* ===== Main game layout ===== */}
            {/* ===== Editor overlay (replaces table+sidebar) ===== */}
            {editor.isEditing ? (
                <div className="game-layout" style={{ flex: 1, overflow: "hidden" }}>
                    <HandEditor
                        mode="live"
                        editState={editor.editState}
                        validationErrors={editor.validationErrors}
                        serverErrors={editor.serverErrors}
                        submitting={editor.submitting}
                        showDiscardPile={EDITOR_SETTINGS.show_discard_pile}
                        onMoveCard={editor.moveCard}
                        onSetPot={editor.setPot}
                        onApply={editor.applyEdit}
                        onPlayFromHere={undefined}
                        onSave={undefined}
                        onCancel={editor.cancelEdit}
                    >
                        {tableElement}
                    </HandEditor>
                </div>
            ) : (
                /* ===== Normal play layout ===== */
                <div className="game-layout">
                    <div className="game-layout__main">
                        <div className="table-container">
                            {tableElement}
                        </div>

                        {player && isBettingDecision && (
                            <PlayerActionPanel
                                player={player}
                                options={hand?.decision?.options || []}
                                availableActions={availableActions}
                                toCall={hand?.to_call}
                                disabled={isHandOver}
                                onAction={handlePlayerAction}
                            />
                        )}

                        {player && isCardSelectDecision && (
                            <CardSelectPanel
                                player={player}
                                minCount={cardSelectOption?.min_count}
                                maxCount={cardSelectOption?.max_count}
                                selectedCards={selectedCards.playerCards[actionPlayer] || []}
                                onConfirm={handleCardSelectConfirm}
                                onClear={handleCardSelectClear}
                                submitting={cardSelectSubmitting}
                                error={cardSelectError}
                            />
                        )}
                    </div>
 
{hasSidebarContent && (
                        <div className="game-layout__sidebar">
                            {isShowdown && hand?.showdown && (
                                <ShowdownSummary
                                    showdown={hand.showdown}
                                    points={hand.points}
                                    players={hand.players}
                                    onSelectHand={setSelectedCards}
                                    onClose={() => setSelectedCards(EMPTY_SELECTION)}
                                />
                            )}
                            
                            {showEquity && (
                                <EquityPanel
                                    equity={equity}
                                    players={hand?.players}
                                    loading={equityLoading}
                                    error={equityError}
                                    onCalculate={handleCalculateEquity}
                                    onClear={clearEquity}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GameSimulator;