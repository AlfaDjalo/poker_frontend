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

        // console.log("AvailableActions: ", availableActions)
        // console.log("Hand: ", hand)
        // console.log("actionPlayer", actionPlayer)
        // console.log("players", hand?.players)
        // console.log("Phase from backend: ", hand?.phase)
        
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

    const handleRestart = async () => setHand(await restart());

    // const handleRestart = async () => {
    //     const newHand = await restart();
    //     setHand(newHand);
    // };
    
    const handleNewHand = async () => {
        const newHand = await startNewHand();
        setHand(newHand);
    };
    
    const handlePlayerAction = async (type, amount) => {
        const updated = await sendAction(type, amount);
        setHand(updated);
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

    function applySelection(hand, selected) {
        if (!hand) return hand;

        const players = { ...hand.players };

        Object.values(players).forEach(p => {
            const sel = selected.playerCards[p.seat] || [];
            p.hand = p.hand.map(c => ({
                ...c,
                selected: sel.includes(c.card)
            }));
        });

        const board = hand.board.map(c => ({
            ...c,
            selected: selected.boardCards.includes(c.card)
        }));

        return { ...hand, players, board };
    }

    const displayHand = applySelection(hand, selectedCards);

    return (
        <div style={{ padding: 16 }}>
            <h3> Game Simulator </h3>   

            {/* <button onClick={async () => setHand(await handleRestart())}>Restart</button>
            <button onClick={async () => setHand(await handleNewHand())}>Start New Hand</button> */}

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
                        players={hand ? hand.players : {}}
                        boardCards={hand ? hand.board : []}
                        nodes={hand ? hand.nodes : []}
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