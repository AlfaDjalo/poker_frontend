import React, { useState, useEffect } from "react";
import "../css/PointDetailPanel.css";

/**
 * PointDetailPanel
 *
 * Shows the ranked player hands for a single board of a point,
 * with an inline card view when a row is selected.
 *
 * Props:
 *  point           - PointResultDTO
 *  boardIndex      - which board to display (default 0)
 *  players         - sorted playerList array
 *  onSelectHand    - (playerIdx, { hole_cards_used, board_cards_used }) => void
 *  onClose         - () => void
 */
const PointDetailPanel = ({ point, boardIndex = 0, players, onSelectHand, onClose }) => {
    const board = point?.board_results?.[boardIndex];
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    // Auto-select the winner when the panel first opens
    useEffect(() => {
        if (!board || !Array.isArray(board)) return;
        const winner = board.find(r => r.is_winner);
        if (winner) selectPlayer(winner);
    }, [point, boardIndex]);

    if (!board || !Array.isArray(board)) {
        return (
            <div className="[point-detail-panel">
                <div className="point-detail-panel__header">
                    <span>No data</span>
                    <button className="point-detail-panel__close" onClick={onClose}>X</button>
                </div>
            </div>
        );
    };

    // Sort by value (descending for high, ascending for low)
    const sorted = [...board].sort((a, b) => {
        if (a.is_winner && !b.is_winner) return 1;
        if (!a.is_winner && b.is_winner) return -1;
        return b.hand_value - a.hand_value;
    });

    function selectPlayer(p) {
        setSelectedPlayer(p);
        onSelectHand?.(p.player_index, {
            hole_cards_used: p.hole_cards_used || [],
            board_cards_used: p.board_cards_used || []
        });
    }
    
    // const handleRowClick = (p) => {
    //     setSelectedPlayer(p);
    //     if (onSelectHand) {
    //         onSelectHand(p.player_index, {
    //             hole_cards_used: p.hole_cards_used || [],
    //             board_cards_used: p.board_cards_used || []
    //         });
    //     }
    // };

    return (
        <div className="point-detail-panel">

            <div className="point-detail-panel__header">
                <span className="point-detail-panel__title">
                    {point.name} . Board {boardIndex + 1}
                </span>
                <button className="point-detail-panel__close" onClick={onClose}>X</button>
            </div>

            {/* Player list */}
            <div className="point-detail-panel__rows">
                {sorted.map((p, idx) => (
                    <div
                        key={idx}
                        className={[
                            "point-detail-panel__row",
                            p.is_winner ? "winner" : "",
                            selectedPlayer?.player_index === p.player_index ? "active" : ""   
                        ].filter(Boolean).join(" ")}
                        onClick = {() => selectPlayer(p)}
                    >
                        <span className="point-detail-panel__player-name">
                            {players[p.player_index]?.name ?? `P${p.player_index + 1}`}
                        </span>

                        <span className="point-detail-panel__category">
                            {p.hand_category ?? "-"}
                        </span>
                    </div>
                ))}
            </div>

            {/* Selected player hand */}
            {selectedPlayer && (
                <div className="point-detail-panel__hand-view">
                    <div className="point-detail-panel__hand-title">Best Hand</div>
                    <div className="point-detail-panel__cards">
                        {selectedPlayer.best_hand_cards.map((c, i) => {
                            const highlight = 
                                selectedPlayer.hole_cards_used.includes(c) ? "hole" :
                                selectedPlayer.board_cards_used.includes(c) ? "board" :
                                null;
                            return <CardChip key={i} card={c} highlight={highlight} />;
                        })}
                    </div>

                    <div className="point-detail-panel__legend">
                        <span className="point-detail-panel__legend-hole">■ Hole</span>
                        <span className="point-detail-panel__legend-board">■ Board</span>
                    </div>

                </div>
            )}
        </div>
    );
};

const CardChip = ({ card, highlight }) => (
    <span className={`point-detail-panel__card ${highlight ? `point-detail-panel__card--${highlight}` : ""}`}>
        {card}
    </span>
);

// const CardView = ({ card, highlight }) => {
//     return (
//         <div className={`card ${highlight || ""}`}>
//             {card}
//         </div>
//     );
// };

export default PointDetailPanel;