import React, { useState, useEffect } from 'react';
import "../css/PlayerActionPanel.css";

const PlayerActionPanel = ({ 
    player, 
    availableActions, 
    minRaise,
    maxRaise,
    onAction, 
    disabled 
}) => {
    
        const [betAmount, setBetAmount] = useState("");

    const can = (action) => availableActions.includes(action);

    const canCheck = can("check")
    const canCall = can("call")
    const canBet = can("bet") || can("raise")

    const callDisabled = !(canCall || canCheck)

    const handleBet = () => {
        const amount = parseFloat(betAmount);
        if (!isNaN(amount)) {
            onAction(player?.bet > 0 ? "raise" : "bet", amount);
            // onAction(player?.contributionCurrentStreet > 0 ? "raise" : "bet", amount);
        }
    };
    // const isAvailable = (action) => availableActions.includes(action);

    useEffect(() => {
        setBetAmount("");
    }, [availableActions]);
    // }, [player?.seat, player?.contributionCurrentStreet]);

    // console.log("Available actions for", player?.name, availableActions);
    // console.log("player", player);
    // console.log("Disabled: ", disabled)

    return (
        <div className="player-action-panel">
        <button
            className={`fold ${!can("fold") ? "disabled" : ""}`}
            disabled={disabled || !can("fold")}
            onClick={() => onAction("fold")}
        >
            Fold
        </button>

        <button
            className={`call ${callDisabled ? "disabled" : ""}`}
            disabled={disabled || callDisabled}
            onClick={() => onAction(canCall ? "call" : "check")}
        >
            { canCall ? "Call" : canCheck ? "Check" : "-" } 
        </button>

        <div className="bet-section">
            <input
            type="number"
            min={minRaise}
            max={maxRaise}
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="Amount"
            />
            <button
            className={`bet ${ !canBet ? "disabled" : ""}`}
            disabled={disabled || !canBet}
            onClick={handleBet}
            >
            {player?.bet > 0 ? "Raise" : "Bet"}
            {/* {player?.contributionCurrentStreet > 0 ? "Raise" : "Bet"} */}
            </button>
        </div>
        </div>
    );
};

export default PlayerActionPanel;
