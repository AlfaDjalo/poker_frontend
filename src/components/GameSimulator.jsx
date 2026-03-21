import React, { useState } from 'react';

import PokerTable from "./PokerTable";
// import PlayerActionPanel from "./PlayerActionPanel";
// import { startNewHand, createNewHand, dealHoleCards, payBlinds, getNextActiveSeat, foldPlayer, placeBet, callBet, check, isBettingRoundComplete, getAvailableActions, endStreet } from "../utils/handUtils";
// import { dealBoardCards } from "../utils/boardUtils";
// import { evaluateShowdown } from "../utils/api";
// import { defaultPlayers, defaultBlinds, numHoleCards, numBoardCards } from "../config/GameConfig";

const GameSimulator = () =>
{
    const [hand, setHand] = useState(null);
    const [availableActions, setAvailableActions] = useState([]);
    const [showdownResult, setShowdownResult] = useState(null);
    
    // const [config, setConfig] = useState(GameConfigDefaults);

    // <GameConfig onSave={setConfig} />

    const handleNewHand = () => {
      const newHand = startNewHand(defaultPlayers, defaultBlinds, numHoleCards, numBoardCards);
      setHand(newHand);
    //   setAvailableActions();
    };
    
    // const [players, setPlayers] = useState({
        //     1: { seat: 1, name: "Alice", stack: 2000, isActive: true },
        //     2: { seat: 2, name: "Bob", stack: 2000, isActive: true },
        //     3: { seat: 3, name: "Charlie", stack: 2000, isActive: true },
        //     4: { seat: 4, name: "Dave", stack: 2000, isActive: true },
        // });    
        // const [actionPlayer, setActionPlayer] = useState(null);
        // const [actionPlayer, setActionPlayer] = useState(getNextActiveSeat(hand.players, hand.dealerSeat));

        // const numBoardCards = [0, 3, 1, 1];
        // const blinds = [1, 2];

    // const handleNewHand = () => {
    //     let handObj = createNewHand({ playerInput: players, numCards: 4 });
    //     // let newHand = createNewHand({ numPlayers: 6, startingStack: 200, numCards: 4 });
    //     handObj = dealHoleCards(handObj, 4);
    //     handObj = payBlinds(handObj, blinds);
    //     setHand(handObj);

    //     setActionPlayer(handObj.nextToAct)
    //     setAvailableActions(getAvailableActions(handObj, handObj.nextToAct));

    //     console.log("Updated hand: ", handObj);
    //     console.log("Action player: ", actionPlayer);

    // };

    const handleDeal = () => {
        // if (!hand) return;
        // const dealt = dealHoleCards(hand, 4);
        // setHand(dealt);
        // console.log("Dealt hand: ", Object.values(dealt.players).map(p => ({ seat: p.seat, hand: p.hand })));
    };    

    function advanceToNextStreet(currentHand) {
        // if (!currentHand) return;
        
        // let newHand = endStreet(currentHand);
        // const cardsToDeal = numBoardCards[newHand.street] || 0;

        // newHand = dealBoardCards(newHand, cardsToDeal);

        // const nextSeat = getNextActiveSeat(newHand.players, newHand.dealer);
        // newHand.betting.lastAggressor = nextSeat;
        // newHand.nextToAct = nextSeat;

        // // setHand(newHand);
        // // setActionPlayer(nextSeat);
        // // setAvailableActions(getAvailableActions(newHand, nextSeat));

        // console.log(`Moved to street: ${newHand.street}, next to act: ${newHand.nextToAct} `);

        // return newHand;
    }

    const handleDealBoard = () => {
        // if (!hand) return;
        // const nextStreet = hand.street + 1;
        // if (nextStreet > numBoardCards.length - 1) return;
        // const numCards = numBoardCards[nextStreet] || 0; 
        // const newHand = { ...hand, street: nextStreet };
        // const updated = dealBoardCards(newHand, numCards);
        // setHand({ ...updated });

        // console.log("Updated board: ", Object.values(updated.board));
    }    

    const handleShowdown = async () => {
        // if (!hand) return;
        // if (hand.street < numBoardCards.length - 1) return;

        // const playerHands = Object.values(hand.players).map(p => ( p.hand.map(c => c.card) ));
        // const board = hand.board.map(c => c.card);

        // console.log("Showdown");

        // try {
        //     const result = await evaluateShowdown(playerHands, board);

        //     console.log(result);

        //     const seats = Object.keys(hand.players);
        //     const updatedPlayers = { ...hand.players };
        //     seats.forEach((seat, idx) => {
        //         updatedPlayers[seat] = {
        //             ...updatedPlayers[seat],
        //             equity: result.equities[idx] * 100
        //         };
        //     });

        //     setHand(prev => ({ ...prev, players: updatedPlayers }));
        //     setShowdownResult(result.equities);
        //     console.log("Showdown result: ", result);
        // } catch (err) {
        //     console.error(err);
        // }
    };

    const handlePlayerAction = (type, amount) => {
        // let newHand = hand;

        // console.log("Player action: ", type, " Amount: ", amount);

        // switch(type) {
        //     case "fold":
        //         newHand = foldPlayer(hand, actionPlayer);
        //         break;
        //     case "bet":
        //         newHand = placeBet(hand, actionPlayer, hand.betting.currentBet);
        //         break;
        //     case "check":
        //         newHand = check(hand, actionPlayer);
        //         break;
        //     case "call":
        //         newHand = callBet(hand, actionPlayer, amount);
        //         break;
        //     default:
        //         console.log("Dodgy action type: ", type);
        //         break;
        // }

        // setHand(newHand);

        // const nextSeat = getNextActiveSeat(newHand.players, actionPlayer);
        // setActionPlayer(nextSeat);

        // console.log("Action completed.")

        // if (isBettingRoundComplete(newHand, nextSeat)) {
        //     // Next street.
        //     console.log("Betting round complete.")

        //     const progressedHand = advanceToNextStreet(newHand);
        //     setHand(progressedHand);
        //     setActionPlayer(progressedHand.nextToAct);
        //     setAvailableActions(getAvailableActions(progressedHand, progressedHand.nextToAct));

        //     // const handleEndStreet = endStreet(hand);
        //     // setHand(handleEndStreet);

        //     // handleDealBoard();
        // }
    }

    return (
        <div style={{ padding: 16 }}>
            <h3> Game Simulator </h3>   
            <button onClick={ handleNewHand }>Create New Hand</button>
            <button onClick={ handleDeal }>Deal Hole Cards</button>
            <button onClick={ handleDealBoard }>Deal Next Street</button>
            <button onClick={ handleShowdown }>Showdown</button>

            { console.log("Rendering PokerTable, boardCards =", hand?.board)}
            { console.log("Rendering PokerTable, players =", hand?.players)}
            <div>Pot</div>
            <div>{hand ? hand.pot : 0}</div>
            <div>Street</div>
            <div>{hand ? hand.street : 0}</div>
            <PokerTable
                players={hand ? hand.players : {}}
                boardCards={hand ? hand.board : []}
                dealerSeat={1}              // or hand?.dealerButton if you add it later
                // activeTarget={ actionPlayer ? { type: "player", seat: actionPlayer } : null }         // placeholder until you wire DnD targeting
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