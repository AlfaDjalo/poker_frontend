import React, { useState, useEffect } from 'react';

import PokerTable from "./PokerTable";

import { restart, startNewHand, sendAction } from '../api/pokerApi';
import PlayerActionPanel from "./PlayerActionPanel";
import GameStatusBar from "./GameStatusBar";

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
    // const [availableActions, setAvailableActions] = useState([]);
    const isHandOver = hand?.phase === "HAND_COMPLETE";
    const availableActions = hand?.available_actions || [];

    const [prevPot, setPrevPot] = useState(0);
    const [animatePot, setAnimatePot] = useState(false);

    useEffect(() => {
        if (!hand) return;

        if (prevPot > 0 && hand.pot === 0) {
        setAnimatePot(true);
        setTimeout(() => setAnimatePot(false), 800);
        }

        setPrevPot(hand.pot);
    }, [hand])

    // const availableActions = hand?.availableActions || [];
    // const actionSeat = hand?.current_player;

    // const [showdownResult, setShowdownResult] = useState(null);
    
    // const [config, setConfig] = useState(GameConfigDefaults);

    // <GameConfig onSave={setConfig} />

    const handleRestart = async () => {
        const newHand = await restart();
        setHand(newHand);
    };
    
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

    console.log("IsHandOver: ", isHandOver)
    console.log("AvailableActions: ", availableActions)
    console.log("Hand: ", hand)
    console.log("actionPlayer", actionPlayer)
    console.log("players", hand?.players)
    
    // useEffect(() => {
    //     if (!hand) return;

    //     setAvailableActions(["fold", "check", "call", "bet", "raise"]);
    // }, [hand]);

    return (
        <div style={{ padding: 16 }}>
            <h3> Game Simulator </h3>   
            <button onClick={() => handleRestart()}>Restart</button>
            <button onClick={() => handleNewHand()}>Start New Hand</button>
            {/* <button onClick={() => handlePlayerAction("fold")}>Fold</button>
            <button onClick={() => handlePlayerAction("check")}>Check</button>
            <button onClick={() => handlePlayerAction("call")}>Call</button>
            <button onClick={() => handlePlayerAction("bet", 10)}>Bet 10</button>
            <button onClick={() => handlePlayerAction("raise", 20)}>Raise 20</button> */}
            {/* <button onClick={ handleNewHand }>Create New Hand</button>
            <button onClick={ handleDeal }>Deal Hole Cards</button>
            <button onClick={ handleDealBoard }>Deal Next Street</button>
            <button onClick={ handleShowdown }>Showdown</button> */}

            { console.log("Rendering PokerTable, boardCards =", hand?.board)}
            { console.log("Rendering PokerTable, players =", hand?.players)}
            <GameStatusBar hand={hand} />
            <div className={`pot ${animatePot ? "push" : ""}`}>
                {/* ${hand.pot} */}
                Pot: {hand ? hand.pot : 0}
            </div> 
            <div>Street</div>
            <div>{hand ? STREET_NAMES[hand?.street] : 0}</div>
            {/* {hand.phase === "HAND_COMPLETE" && hand.hand_strengths && (
                <div className="hand-strength">
                    {hand.hand_strengths[actionPlayer - 1]}
                </div>
            )} */}
            {/* <div>{hand ? hand.street : 0}</div> */}
            <PokerTable
                players={hand ? hand.players : {}}
                boardCards={hand ? hand.board : []}
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

            {
                // actionPlayer && hand.players[actionPlayer] && (
                //     <PlayerActionPanel 
                //     hand={hand}
                //     player={hand.players[actionPlayer]}
                //     availableActions={availableActions}
                //     onAction={(type, amount) => handlePlayerAction(type, amount)}
                //     />
                // )
            }
        </div>
    );
};

export default GameSimulator;