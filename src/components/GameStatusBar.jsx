import React from "react";

import "../css/GameStatusBar.css";

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"]

const GameStatusBar = ({ hand }) => {
    if (!hand) return null;

    console.log("Hand: ", hand)

    const streetName = STREET_NAMES[hand.street] || "Unknown";

    const actingSeat = 
        hand.phase === "BETTING" 
        ? hand.current_player
        : null;
    
    const actingPlayer = 
        actingSeat != null
        ? hand.players[actingSeat - 1]
        : null;

    const toCall = actingPlayer
        ? hand.to_call - actingPlayer.bet
        : 0;

    let message = "";

    if (hand.phase === "SHOWDOWN") {
        message = "Showdown";
    }
    else if (!actingPlayer) {
        message = `Dealing ${streetName}`;
    }
    else {
        message = `Action on ${actingPlayer.name} - $${toCall} to call`;
    }

    return (
        <div className="game-status-bar">
            {message}
        </div>
    );
};

export default GameStatusBar;