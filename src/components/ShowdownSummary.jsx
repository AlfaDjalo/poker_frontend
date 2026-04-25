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
    // const [selectedPoint, setSelectedPoint] = useState(null);
    // const [selectedBoard, setSelectedBoard] = useState(null);

    // const isPoints = payout_type === "points";

    console.log("payout_type: ", payout_type);


    // Build player display name from seat map
    // point_results use 0-based active player indices
    // players map is 1-based seats — we need to map between them.
    // The active player ordering matches the players array order from backend.
    
    // const playerName = (activeIdx) => {
    //     const p = playerList[activeIdx];
    //     return p ? p.name : `P${activeIdx + 1}`;
    // };

    // const playerSeat = (activeIdx) => {
    //     const p = playerList[activeIdx];
    //     return p ? p.seat : activeIdx + 1;
    // }

    // const isSelected =
    //     selectedBoard &&
    //     selectedBoard.pointIdx === idx &&
    //     selectedBoard.boardIdx === boardIdx;


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
    // const name = pointResult.name.replace(/_/g, " ").replace(/\b\w/g, c=> c.toUpperCase());
    // const type = pointResult.score_type === "HIGH" ? "High"
    //     : pointResult.score_type === "LOW_27" ? "Low (2-7)"
    //     : pointResult.score_type ==="LOW_A5" ? "Low (A-5)"
    //     : pointResult.score_type;
    // return `${name} -  ${type}`;
    return `${point.name} (${point.score_type})`;
}

// function formatTally(tally) {
//     // Show as fraction if not a whole number
//     if (Number.isInteger(tally)) return `${tally}`;
//     // Convert to fraction string e.g. 0.5 → "½", 1.5 → "1½"
//     const  whole = Math.floor(tally);
//     const frac = tally - whole;
//     const fracStr =
//         Math.abs(frac - 0.5)  < 0.01 ? "½" :
//         Math.abs(frac - 0.25) < 0.01 ? "¼" :
//         Math.abs(frac - 0.75) < 0.01 ? "¾" :
//         Math.abs(frac - 0.333) < 0.01 ? "⅓" :
//         Math.abs(frac - 0.667) < 0.01 ? "⅔" :
//         frac.toFixed(2);
//     return whole > 0 ? `${whole}${fracStr}` : fracStr;
// }


export default ShowdownSummary;