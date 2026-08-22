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
                {/* Typed amount input + its own Bet/Raise submit button
                    only make sense when there's a real RANGE of legal
                    sizes to choose between. When minRaise === maxRaise
                    (push-fold's full-stack shove, river's single
                    pot-sized bet) there is exactly one legal size, so:
                      (a) this input added nothing but confusion —
                          worse, clicking the submit button below with
                          it left empty silently did nothing at all
                          (parseFloat("") is NaN, and handleBet bailed
                          out before ever calling onAction), which
                          looked like the whole panel was stuck/broken.
                      (b) the submit button's own label logic (player
                          already has a nonzero current_bet from a
                          posted blind, e.g. push-fold's SB) rendered
                          "Raise" for what is actually an all-in push,
                          not a real raise.
                    The quick-amount button below already submits
                    immediately with the correct (only) size and the
                    correct "All-In"/"Pot" label, so it's the only
                    control shown in this case. */}
                {!singleLegalSize && (
                    <input
                        type="number"
                        min={minRaise}
                        max={maxRaise}
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        placeholder={minRaise != null ? `${minRaise}-${maxRaise ?? '∞'}` : "Amount"}
                        disabled={betDisabled}
                    />
                )}
                {maxRaise != null && (
                <button
                    className={`bet-quick ${betDisabled ? "disabled" : ""}`}
                    disabled={betDisabled}
                    onClick={handleQuickAmount}
                >
                    {singleLegalSize ? "All-In" : "Pot"}
                </button>                
                )}
                {!singleLegalSize && (
                    <button className={`bet ${ !canBet ? "disabled" : ""}`}
                    disabled={betDisabled}
                    onClick={handleBet}
                    >
                        {player?.bet > 0 ? "Raise" : "Bet"}
                    </button>
                )}
            </div>
        </div>
    );
};

export default PlayerActionPanel;