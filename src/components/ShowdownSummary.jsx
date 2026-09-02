import React, { useState } from "react";
import PointDetailPanel from "./PointDetailPanel";
import "../css/ShowdownSummary.css";

const EMPTY_SELECTION = { playerCards: {}, boardCards: []};

/**
 *  Showdown Summary
 * 
 * Props:
 *  showdown        - showdown object from hand state
 *  points          - array of PointDTO from hand state
 *  players         - players map keyed by seat number
 *  onSelectHand    - (selection) => void — highlights cards on the table
 *  onClose         - () => void — called when the panel is dismissed
 */
const ShowdownSummary = ({ showdown, points, players, onSelectHand, onClose }) => {
    const [activePoint, setActivePoint] = useState(null);
    // Which board WITHIN the active point is being inspected. A point
    // with more than one board (double board, hopscotch, triple board,
    // ...) has one entry per board in board_winners/board_results — this
    // used to be hardcoded to board 0 below, so clicking any board line
    // other than the first still only ever showed/selected board 0's
    // winning cards.
    const [activeBoard, setActiveBoard] = useState(0);

    if (!showdown) return null;

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

    // Toggling a point row open/closed only controls which
    // PointDetailPanel is shown. Card selection itself is driven
    // entirely by PointDetailPanel's own onSelectHand (its mount
    // effect auto-selects the winner; clicking another player row
    // re-selects that player's own hole/board cards). Having this
    // handler ALSO compute and push a selection here created a second,
    // competing source of truth for the same state — remove it so
    // there's exactly one path from "click a player" to "highlight
    // their cards".
    const handlePointClick = (pointIdx, boardIdx = 0) => {
        const closing = pointIdx === activePoint && boardIdx === activeBoard;
        setActivePoint(closing ? null : pointIdx);
        setActiveBoard(closing ? 0 : boardIdx);
        if (closing) onSelectHand?.(EMPTY_SELECTION);
    };

    const handleClose = () => {
        setActivePoint(null);
        setActiveBoard(0);
        onSelectHand?.(EMPTY_SELECTION);
        onClose?.();
    };
    
    return (
        <div className="showdown-summary">

            {/* ---- Header ---- */}
            <div className="showdown-summary__title">
                <span>Showdown</span>
                <div className="showdown_summary__title-right">
                    <span className = "showdown-summary__payout-type"> 
                        {payout_type === "points" ? "Points" : "Split Pot"}
                    </span>
                    <button
                        className="showdown-summary__close"
                        onClick={handleClose}
                        title="Close showdown panel"
                    >
                        X
                    </button>
                </div>
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
                    onClick={() => handlePointClick(idx)}
                >
                    <div className="showdown-summary__point-name">
                        {formatPointName(point)}
                    </div>

                    {point.board_winners.map((winners, bIdx) => (
                        <div
                            key={bIdx}
                            className={`showdown-summary__board ${
                                activePoint === idx && activeBoard === bIdx ? "active" : ""
                            }`}
                            onClick={(e) => {
                                // Otherwise the outer point-row handler above
                                // also fires and immediately overwrites this
                                // board selection with board 0's.
                                e.stopPropagation();
                                handlePointClick(idx, bIdx);
                            }}
                        >
                            {point.board_winners.length > 1 && (
                                <span className="showdown-summary__board-label">
                                    Board {bIdx + 1}
                                </span>
                            )}
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
                            {point.scoop?.[bIdx] && (
                                <span className="showdown-summary__scoop">Scoop</span>
                            )}
                        </div>
                    ))}
                </div>
            ))}


            {/* Detail panel */}
            {activePoint !== null && (
                <PointDetailPanel
                    point={point_results[activePoint]}
                    boardIndex={activeBoard}
                    players={playerList}
                    onSelectHand={(playerIdx, data) => {
                        onSelectHand?.({
                            playerCards: {
                                [playerSeat(playerIdx)]: data.hole_cards_used
                            },
                            boardCards: data.board_cards_used
                        });
                    }}
                    onClose={() => {
                        setActivePoint(null);
                        setActiveBoard(0);
                        onSelectHand?.(EMPTY_SELECTION);
                    }}
                />
            )}

            {/* Tallies */}
            {payout_type === "points" && point_tallies && (
                <div className="showdown-summary__tallies">
                    <div className="showdown_summary_tallies-title">Points</div>
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
                                <span>{val} pt{val !== 1 ? "s" : ""}</span>
                            </div>
                        ))}
                </div>
            )}

            {/* -----------------------------
                PAYOUTS
            ----------------------------- */}
            <div className="showdown-summary__payouts">
                <div className="showdown-summary__payouts-title">Payouts</div>
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
    const name = point.name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    const type =
        point.score_type === "HIGH"   ? "Hi"     :
        point.score_type === "LOW_A5" ? "Lo(A5)" :
        point.score_type === "LOW_27" ? "Lo(27)" :
        point.score_type;
    return `${name} · ${type}`;
}

export default ShowdownSummary;