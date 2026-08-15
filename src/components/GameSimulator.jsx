import React, { useState, useEffect, useCallback } from 'react';

import PokerTable from "./PokerTable";
import ShowdownSummary from './ShowdownSummary';
import PlayerActionPanel from "./PlayerActionPanel";
import GameStatusBar from "./GameStatusBar";
import WinnerBanner from "./WinnerBanner";
import HandEditor from "./HandEditor";
// import EditablePot from "./EditablePot";
import EquityPanel from './EquityPanel';

import { useHandEditor } from '../hooks/useHandEditor';
import { useEquity, buildEquityParamsFromHand } from '../hooks/useEquity';
import { restart, startNewHand, sendAction, getVariants } from '../api/pokerApi';
import "../css/GameSimulator.css";

const FALLBACK_STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"];

function getStreetName(hand, streetIndex) {
    if (hand?.street_names) {
        const name = hand.street_names[streetIndex];
        if (name != null) return name;
    }
    return FALLBACK_STREET_NAMES[streetIndex] ?? `Street ${streetIndex}`;
}
// A hand is "in progress" in any phase except HAND_COMPLETE (and null = no hand yet)
const isHandInProgress = (hand) =>
    hand !== null && hand?.phase !== "HAND_COMPLETE" && hand?.phase !== "SHOWDOWN";

// Format a yaml stem into a human-readable label
const formatVariantLabel = (name) =>
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EMPTY_SELECTION = { playerCards: {}, boardCards: []};

// Settings — in future these will come from a settings store
const EDITOR_SETTINGS = {
    live_editing_enabled: true,
    show_discard_pile: true,
};

const GameSimulator = () =>
{
    const [hand, setHand] = useState(null);
    const isHandOver = hand?.phase === "HAND_COMPLETE";
    const availableActions = hand?.available_actions || [];

    // ---- Variant state ----    
    const [variants, setVariants] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [pendingGame, setPendingGame] = useState(null);

    const [prevPot, setPrevPot] = useState(0);
    const [animatePot, setAnimatePot] = useState(false);
    const [showWinner, setShowWinner] = useState(false);

    const [showEquity, setShowEquity] = useState(false);

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
        setHandNormalized(newHand);
        clearEquity();
    };
    
    const handleNewHand = async () => {
        const newHand = await startNewHand(pendingGame);
        setSelectedGame(pendingGame);
        setSelectedCards(EMPTY_SELECTION);      // clear selection on new hand
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
            
    const actionPlayer = 
        hand?.phase === "BETTING"
        ? hand.current_player
        : null;
    
    const player = 
        actionPlayer != null && hand?.players?.[actionPlayer]
        ? hand.players[actionPlayer] 
        : null;
    
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
        
        return { ...hand, players, board, nodes };
    }
        
    const handleCalculateEquity = () => {
        const params = buildEquityParamsFromHand(hand);
        if (params) calculate(params);
    };    

    
    // Build display hand — in edit mode we read from editState instead
    function buildEditDisplayHand(editState, hand) {
        if (!editState || !hand) return null;
        // Reconstruct a hand-like object from editState for the table
        const players = {};
        for (const p of editState.players) {
            players[p.seat] = {
                seat: p.seat,
                name: hand.players?.[p.seat]?.name ?? `Player ${p.seat}`,
                stack: p.stack,
                bet: p.current_bet,
                folded: p.has_folded,
                hand: p.hole_cards.map(c => c ? { card: c, hidden: false, selected: false } : null).filter(Boolean),
                equity: undefined,
            };
        }
        const nodes = editState.node_cards.map(c => c ? { card: c, hidden: false, selected: false } : null);
        return {
            ...hand,
            pot: editState.pot,
            players,
            nodes,
            board: [],
        };
    }

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
                    {EDITOR_SETTINGS.live_editing_enabled && hand && !isShowdown && (
                        <button
                            className={`game-btn ${editor.isEditing ? "game-btn--active" : ""}`}
                            onClick={editor.isEditing ? editor.cancelEdit : editor.beginEdit}
                            style={{ borderColor: "#f59e0b", color: editor.isEditing ? "#f59e0b" : undefined }}
                        >
                            {editor.isEditing ? "✕ Cancel Edit" : "✏ Edit"}
                        </button>
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

                        {player && (
                            <PlayerActionPanel
                                player={player}
                                availableActions={availableActions}
                                minRaise={hand?.min_raise}
                                maxRaise={hand?.max_raise}
                                disabled={isHandOver}
                                onAction={handlePlayerAction}
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

                    {/* {isShowdown && hand?.showdown && (
                        <div className="game-layout__sidebar">
                            <ShowdownSummary
                                showdown={hand.showdown}
                                points={hand.points}
                                players={hand.players}
                                onSelectHand={setSelectedCards}
                                onClose={() => setSelectedCards(EMPTY_SELECTION)}
                            />
                        </div>
                    )} */}
                </div>
            )}
{/*  
            {player && !editor.isEditing && (
                <PlayerActionPanel
                    player={player}
                    availableActions={availableActions}
                    minRaise={hand?.min_raise}
                    maxRaise={hand?.max_raise}
                    disabled={isHandOver}
                    onAction={handlePlayerAction}
                />
            )} */}

            {/* ===== Table + sidebar ===== */}
            {/* <div className="game-layout">
 
                <div className="game-layout__main">
                    <PokerTable
                        players={displayHand ? displayHand.players : {}}
                        boardCards={displayHand ? displayHand.board : []}
                        nodes={displayHand ? displayHand.nodes : []}
                        layoutName={hand?.layout_name}
                        points={hand?.points}
                        showdown={hand?.showdown}
                        dealerSeat={1}
                        actionSeat={actionPlayer}
                        onSeatClick={(seatNum) => console.log("Seat clicked:", seatNum)}
                        onPlayerCardClick={(seatNum, cardIndex) => {
                            console.log(`Clicked player ${seatNum} card ${cardIndex}`)
                            const card = displayHand?.players?.[seatNum]?.hand?.[cardIndex]?.card;
                            if (card) togglePlayerCard(seatNum, card);
                        }}
                        onPlayerSlotClick={(seatNum, slotIndex) =>
                            console.log(`Clicked slot ${slotIndex} for player ${seatNum}`)
                        }
                        onBoardCardClick={(index) => {
                            console.log(`Clicked board card ${index}`)
                            const card = displayHand?.nodes?.[index]?.card;
                            if (card) toggleBoardCard(card);
                        }}
                        onBoardSlotClick={(index) => console.log(`Clicked board slot ${index}`)}
                        onBoardAreaClick={() => console.log("Board area clicked")}
                        loading={false}
                    />
                </div>
 
                <div className="game-layout__sidebar">
                    {isShowdown && hand?.showdown && (
                        <ShowdownSummary
                            showdown={hand.showdown}
                            points={hand.points}
                            players={hand.players}
                            onSelectHand={setSelectedCards}
                            onClose={() => setSelectedCards(EMPTY_SELECTION)}
                        />
                    )} */}
            {/* <EquityPanel
                equity={equity}
                players={hand?.players}
                loading={equityLoading}
                error={equityError}
                onCalculate={handleCalculateEquity}
                onClear={clearEquity}
            /> */}
                {/* </div> 
            </div> */}
 
{/*                     
            // {player && (
            //     <PlayerActionPanel
            //         player={player}
            //         availableActions={availableActions}
            //         minRaise={hand?.min_raise}
            //         maxRaise={hand?.max_raise}
            //         disabled={isHandOver}
            //         onAction={handlePlayerAction}
            //     />
            // )} */}
 
        </div>
    );
};

export default GameSimulator;