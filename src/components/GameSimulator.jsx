import React, { useState, useEffect } from 'react';

import PokerTable from "./PokerTable";
import ShowdownSummary from './ShowdownSummary';
import PlayerActionPanel from "./PlayerActionPanel";
import GameStatusBar from "./GameStatusBar";
import WinnerBanner from "./WinnerBanner";

import { restart, startNewHand, sendAction } from '../api/pokerApi';
import "../css/GameSimulator.css";

// import { Play } from 'lucide-react';

const STREET_NAMES = {
    0: "Preflop",
    1: "Flop",
    2: "Turn",
    3: "River",
    4: "Showdown"
};

const GameSimulator = () =>
{
    const [hand, setHand] = useState(null);
    const isHandOver = hand?.phase === "HAND_COMPLETE";
    const availableActions = hand?.available_actions || [];

    const [prevPot, setPrevPot] = useState(0);
    const [animatePot, setAnimatePot] = useState(false);
    const [showWinner, setShowWinner] = useState(false);
    const [selectedCards, setSelectedCards] = useState({
        playerCards: {},
        boardCards: []
    });


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

    const handleRestart = async () => setHandNormalized(await restart());
    
    const handleNewHand = async () => {
        const newHand = await startNewHand();
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

    // Help: convert players array -> { [seat]: player } map
    function normalizePlayers(playersArray) {
        if (!Array.isArray(playersArray)) return playersArray;
        const map = {};
        playersArray.forEach(p => { map[p.seat] = p; });
        return map;
    }

    // Apply normalisation when hand state is set
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

    return (
        <div style={{ padding: 16 }}>
            <h3> Game Simulator </h3>   

            <button onClick={() => handleRestart()}>Restart</button>
            <button onClick={() => handleNewHand()}>Start New Hand</button>

            <GameStatusBar hand={hand} />
            <div className={`pot ${animatePot ? "push" : ""}`}>
                {/* ${hand.pot} */}
                Pot: {hand ? hand.pot : 0}
            </div> 
            <div>Street</div>
            <div>{hand ? STREET_NAMES[hand?.street] : 0}</div>
            
            { showWinner && (
                <WinnerBanner
                    hand={hand}
                    onClose={() => setShowWinner(false)}
                />
            )}
            {/* {hand.phase === "SHOWDOWN" && ( */}
            {/* {(hand?.phase === "SHOWDOWN" || hand?.phase === "HAND_COMPLETE") && (
                <WinnerBanner hand={hand}/>
            )} */}

            <div className="game-layout">

                <div className="game-layout__main">

                    <PokerTable
                        players={displayHand ? displayHand.players : {}}
                        boardCards={displayHand ? displayHand.board : []}
                        nodes={displayHand ? displayHand.nodes : []}
                        layoutName={hand?.layout_name}
                        points={hand?.points}
                        showdown={hand?.showdown}
                        dealerSeat={1}              // or hand?.dealerButton if you add it later
                        // activeTarget={ actionPlayer ? { type: "player", seat: actionPlayer } : null }         // placeholder until you wire DnD targeting
                        actionSeat={actionPlayer}
                        onSeatClick={(seatNum) => console.log("Seat clicked:", seatNum)}
                        onPlayerCardClick={(seatNum, cardIndex) =>
                            console.log(`Clicked player ${seatNum} card ${cardIndex}`)
                        }
                        onPlayerSlotClick={(seatNum, slotIndex) =>
                            console.log(`Clicked slot ${slotIndex} for player ${seatNum}`)
                        }
                        onBoardCardClick={(index) =>
                            console.log(`Clicked board card ${index}`)
                        }
                        onBoardSlotClick={(index) =>
                            console.log(`Clicked board slot ${index}`)
                        }
                        onBoardAreaClick={() => console.log("Board area clicked")}
                        loading={false}
                    />

                    <div className="game-layout__sidebar">

                        {/* Showdown summary panel */}
                        {isShowdown && hand?.showdown && (
                            <ShowdownSummary
                                showdown={hand.showdown}
                                points={hand.points}
                                players={hand.players}
                                onSelectHand={setSelectedCards}
                                // onSelectHand={(selection) => setSelectedCards(selection)}
                            />
                        )}
                    </div>
                </div>

            </div>


            { player && (
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