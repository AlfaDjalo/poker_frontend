import React, { useState, useEffect } from 'react';

import PokerTable from "./PokerTable";
import ShowdownSummary from './ShowdownSummary';
import PlayerActionPanel from "./PlayerActionPanel";
import GameStatusBar from "./GameStatusBar";
import WinnerBanner from "./WinnerBanner";

import { restart, startNewHand, sendAction, getVariants } from '../api/pokerApi';
// import { restart, startNewHand, sendAction, getVariants, selectGame } from '../api/pokerApi';
import "../css/GameSimulator.css";

const STREET_NAMES = {
    0: "Preflop",
    1: "Flop",
    2: "Turn",
    3: "River",
    4: "Showdown"
};

// A hand is "in progress" in any phase except HAND_COMPLETE (and null = no hand yet)
const isHandInProgress = (hand) =>
    hand !== null && hand?.phase !== "HAND_COMPLETE";

// Format a yaml stem into a human-readable label
const formatVariantLabel = (name) =>
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EMPTY_SELECTION = { playerCards: {}, boardCards: []};

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
    const [selectedCards, setSelectedCards] = useState(EMPTY_SELECTION);

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
    }, [hand])

    useEffect(() => {
        if (isHandOver) {
            console.log("Hand over: ", hand);
        }
    }, [isHandOver, hand])

    const handleVariantChange = (e) => {
        // Only update local UI state; the change is forwarded to the backend
        // when the user clicks Restart or Start New Hand.
        setPendingGame(e.target.value);
    }

    // ---- Actions ----

    const handleRestart = async () => {
        // Ensure backend knows about the game change
        // if (pendingGame !== selectedGame) {
        //     await selectGame(pendingGame);
        // }
        const newHand = await restart(pendingGame);
        setSelectedGame(pendingGame);
        setHandNormalized(newHand);
    };
    
    const handleNewHand = async () => {
        // Ensure backend knows about the game change
        // if (pendingGame !== selectedGame) {
        //     await selectGame(pendingGame);
        // }
        const newHand = await startNewHand(pendingGame);
        setSelectedGame(pendingGame);
        setHandNormalized(newHand);
    };
    
    const handlePlayerAction = async (type, amount) => {
        const updated = await sendAction(type, amount);
        setHandNormalized(updated);
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
                    return str ?  { card: str, selected: sel.includes(str) } : null
                }),
            };
        })

        const board = (hand.board || []).map(c => {
            const str = cardStr(c);
            return str ? { card: str, selected: selected.boardCards.includes(str) } : null
        });

        const nodes = (hand.nodes || []).map(c => {
            const str = cardStr(c);
            return str ? { card: str, selected: selected.boardCards.includes(str) } : null
        });

        return { ...hand, players, board, nodes };
    }

    const displayHand = applySelection(hand, selectedCards);

    const handInProgress = isHandInProgress(hand);
    const gameWillChange = pendingGame && pendingGame !== selectedGame;

    return (
        <div className="game-simulator">
 
            {/* ===== Single header bar ===== */}
            <div className="game-header">
 
                {/* Left: title + action buttons */}
                <div className="game-header__left">
                    <span className="game-header__title">Crazy Asian Poker</span>
                    <button className="game-btn" onClick={handleRestart}>Restart</button>
                    <button className="game-btn" onClick={handleNewHand} disabled={handInProgress}>
                        New Hand
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
                        disabled={variants.length === 0}
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
                        {hand ? STREET_NAMES[hand.street] ?? "" : ""}
                    </span>
                </div>
            </div>
 
            {showWinner && (
                <WinnerBanner hand={hand} onClose={() => setShowWinner(false)} />
            )}
 
            {/* ===== Table + sidebar ===== */}
            <div className="game-layout">
 
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
                        onPlayerCardClick={(seatNum, cardIndex) =>
                            console.log(`Clicked player ${seatNum} card ${cardIndex}`)
                        }
                        onPlayerSlotClick={(seatNum, slotIndex) =>
                            console.log(`Clicked slot ${slotIndex} for player ${seatNum}`)
                        }
                        onBoardCardClick={(index) => console.log(`Clicked board card ${index}`)}
                        onBoardSlotClick={(index) => console.log(`Clicked board slot ${index}`)}
                        onBoardAreaClick={() => console.log("Board area clicked")}
                        loading={false}
                    />
                </div>
 
                {isShowdown && hand?.showdown && (
                    <div className="game-layout__sidebar">
                        <ShowdownSummary
                            showdown={hand.showdown}
                            points={hand.points}
                            players={hand.players}
                            onSelectHand={setSelectedCards}
                            onClose={() => setSelectedCards(EMPTY_SELECTION)}
                        />
                    </div>
                )}
 
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
    );
};

export default GameSimulator;