import React, { useState } from "react";
import PointDetailPanel from "./PointDetailPanel";
import "../css/ShowdownSummary.css";

/**
 *  Showdown Summary
 * 
 * Props:
 *  showdown        - showdown object from hand state
 *  points          - array of PointDTO from hand state
 *  players         - players map (keyed by seat number)
 */
const ShowdownSummary = ({ showdown, points, players, onSelectHand }) => {
    const [activePoint, setActivePoint] = useState(null);

    if (!showdown) return null;

    console.log("Showdown: ", showdown);

    const { 
        payout_type,
        point_results,
        point_tallies,
        payouts,
        pot_winners,
    } = showdown;
    
    const playerList = Object.values(players || {}).sort((a, b) => a.seat - b.seat);
    
    const playerName = (idx) => playerList[idx]?.name ?? `P${idx + 1}`;
    const playerSeat = (idx) => playerList[idx]?.seat || idx + 1;

    console.log("payout_type: ", payout_type);


    return (
        <div className="showdown-summary">

            <div className="showdown-summary__title">
                <span>Showdown</span>
                <span className = "showdown-summary__payout-type"> 
                    {payout_type === "points" ? "Points" : "Split Pot"}
                </span>
            </div>

            <div className="showdown-summary__hint">
                Click a point to inspect hands
            </div>

            {/* -----------------------------
               SUMMARY VIEW
            ----------------------------- */}
            {point_results.map((point, idx) => (
                <div
                    key={idx}
                    className={`showdown-summary__point ${activePoint === idx ? "active" : ""}`}
                    onClick={() => setActivePoint(idx)}
                >
                    <div className="showdown-summary__point-name">
                        {formatPointName(point)}
                    </div>

                    {point.board_winners.map((winners, bIdx) => (
                        <div key={bIdx} className="showdown-summary__board">
                            {point.no_qualify?.[bIdx] ? (
                                <span className="showdown-summary_no-qualify">
                                    No qualify
                                </span>
                            ) : (
                                winners.map(p => (
                                    <span key={p} className="showdown-summary__winner">
                                        {playerName(p)}
                                    </span>
                                ))
                            )}
                        </div>
                    ))}
                </div>
            ))}

            {/* Detail panel */}
            {activePoint !== null && (
                <PointDetailPanel
                    point={point_results[activePoint]}
                    boardIndex={0}
                    players={playerList}
                    onSelectHand={(playerIdx, data) => {
                        onSelectHand({
                            playerCards: {
                                [playerSeat(playerIdx)]: data.hole_cards_used
                            },
                            boardCards: data.board_cards_used
                        });
                    }}
                    onClose={() => setActivePoint(null)}
                />
            )}

            {/* Tallies */}
            {payout_type === "points" && point_tallies && (
                <div className="showdown-summary__tallies">
                    {Object.entries(point_tallies)
                        .sort((a, b) => b[1] - a[1])
                        .map(([idx, val]) => (
                            <div
                                key={idx}
                                className={`showdown-summary__tally-row ${
                                    pot_winners?.includes(Number(idx)) ? "winner" : ""
                                }`}
                            >
                                <span>{playerName(Number(idx))}</span>
                                <span>{val}</span>
                            </div>
                        ))}
                </div>
            )}

            {/* -----------------------------
                PAYOUTS
            ----------------------------- */}
            <div className="showdown-summary__payouts">
                {playerList.map((p, idx) => {
                    const amt = payouts?.[idx] || 0;
                    if (!amt) return null;
                    return (
                        <div key={idx} className="showdown-summary__payout_row">
                            <span>{p.name}</span>
                            <span className="showdown-summary__amount">+{amt}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function formatPointName(point) {
    return `${point.name} (${point.score_type})`;
}


export default ShowdownSummary;