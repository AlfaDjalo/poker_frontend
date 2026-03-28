import React from "react";

import "../css/GameStatusBar.css";

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"]

const GameStatusBar = ({ hand }) => {
    if (!hand) return null;

    console.log("Hand: ", hand)

    const streetName = STREET_NAMES[hand.street] || "Unknown";

    const actingSeat = 
        hand.current_player;
        // hand.phase === "BETTING" 
        // ? hand.current_player
        // : null;
    
    const actingPlayer = 
        actingSeat != null
        ? hand.players[actingSeat]
        : null;

    const toCall = hand.to_call ?? 0;
    // const toCall = actingPlayer
    //     ? hand.to_call - actingPlayer.bet
    //     : 0;

    let message = "";

    if (actingSeat != null) {
        // show action
        message = `Action on ${actingPlayer.name} - $${toCall} to call`;
    }
    else if (hand.phase === "SHOWDOWN") {
        message = "Showdown";
    }
    else if (hand.phase === "HAND_COMPLETE") {
        message = "Hand Complete";
    }
    // else if (actingPlayer) {
    //     message = `Action on ${actingPlayer.name} - $${toCall} to call`;
    // }
    else {
        message = `Dealing ${streetName}`;
    }

    return (
        <div className="game-status-bar">
            {message}

        </div>
    );
};

export default GameStatusBar;