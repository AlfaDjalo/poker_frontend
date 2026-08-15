import React, { useState, useEffect } from 'react';
import "../css/PlayerActionPanel.css";

const PlayerActionPanel = ({ 
    player, 
    availableActions, 
    minRaise,
    maxRaise,
    toCall,
    onAction, 
    disabled 
}) => {
    
        const [betAmount, setBetAmount] = useState("");

    const can = (action) => availableActions.includes(action);

    const canCheck = can("check")
    const canCall = can("call")
    const canBet = can("bet") || can("raise")

    const callDisabled = !(canCall || canCheck)
    const betDisabled = disabled || !canBet

    // When minRaise === maxRaise there is exactly ONE legal size —
    // push-fold's full-stack shove, or river's single pot-sized bet
    // (see trainer_service.py's _build_engine_action: it always
    // computes that one size itself server-side regardless of what
    // amount is submitted). In that case there's nothing to actually
    // size, so this button both fills the field for visual feedback
    // AND submits immediately — no separate "type an amount, then
    // click Bet" step, and "All-In" is a clearer label than "Pot"
    // when there's no real pot-fraction choice being made.
    const singleLegalSize = minRaise != null && maxRaise != null && minRaise === maxRaise;

    const handleQuickAmount = () => {
        setBetAmount(String(maxRaise));
        if (singleLegalSize) {
            onAction(player?.bet > 0 ? "raise" : "bet", maxRaise);
        }
    };

    const handleBet = () => {
        let amount = parseFloat(betAmount);
        if (isNaN(amount)) return;
        if (minRaise != null) amount = Math.max(amount, minRaise);
        if (maxRaise != null) amount = Math.min(amount, maxRaise); 
        onAction(player?.bet > 0 ? "raise" : "bet", amount);
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
                { canCall ? `Call $${toCall ?? ""}` : canCheck ? "Check" : "-" } 
            </button>

            <div className="bet-section">
                <input
                    type="number"
                    min={minRaise}
                    max={maxRaise}
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder={minRaise != null ? `${minRaise}-${maxRaise ?? '∞'}` : "Amount"}
                    // Greyed out alongside the Bet/Raise button itself
                    // whenever betting isn't a legal action right now —
                    // previously this stayed editable even when the
                    // submit button was disabled, which looked like a
                    // live control for an illegal action.
                    disabled={betDisabled}
                />
                {maxRaise != null && (
                <button
                    className={`bet-quick ${betDisabled ? "disabled" : ""}`}
                    disabled={betDisabled}
                    onClick={handleQuickAmount}
                >
                    {singleLegalSize ? "All-In" : "Pot"}
                </button>                
                )}
                <button className={`bet ${ !canBet ? "disabled" : ""}`}
                disabled={betDisabled}
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