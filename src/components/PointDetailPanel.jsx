import React, { useState } from "react";
import "../css/PointDetailPanel.css";

const PointDetailPanel = ({ point, boardIndex, players, onSelectHand, onClose }) => {
    const board = point?.board_results?.[boardIndex];
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    if (!board || !Array.isArray(board)) {
        return <div className="[point-detail-panel">No board data avaialble.</div>
    }

    // Sort by value (descending for high, ascending for low)
    const sorted = [...board].sort((a, b) => {
        if (!a.hand_value) return 1;
        if (!b.hand_value) return -1;
        return b.hand_value - a.hand_value;
    });

    const handleRowClick = (p) => {
        setSelectedPlayer(p);
        if (onSelectHand) {
            onSelectHand(p.player_index, {
                hole_cards_used: p.hole_cards_used || [],
                board_cards_used: p.board_cards_used || []
            });
        }
    };

    return (
        <div className="point-detail-panel">

            <div className="panel-header">
                <span>{point.name} - Board {boardIndex + 1}</span>
                <button onClick={onClose}>X</button>
            </div>

            {/* Player list */}
            {sorted.map((p, idx) => (
                <div
                    key={idx}
                    className={`player-row ${p.is_winner ? "winner" : ""}`}
                    onClick = {() => handleRowClick(p)}
                >
                    <span className="player-name">
                        {players[p.player_index]?.name}
                    </span>

                    <span className="hand_category">
                        {p.hand_category}
                    </span>

                    <span className="hand-value">
                        {p.hand_value}
                    </span>
                </div>
            ))}

            {/* Selected player hand */}
            {selectedPlayer && (
                <div className="hand-view">

                    <h5>Best Hand</h5>

                    <div className="cards">
                        {selectedPlayer.best_hand_cards.map((c, i) => (
                            <CardView
                                key={i}
                                card={c}
                                highlight={
                                    selectedPlayer.hole_cards_used.includes(c)
                                        ? "hole"
                                        : selectedPlayer.board_cards_used.includes(c)
                                            ? "board"
                                            : null
                                }
                            />
                        ))}
                    </div>

                    <div className="legend">
                        <span className="hole">Hole cards</span>
                        <span className="board">Board cards</span>
                    </div>

                </div>
            )}
        </div>
    );
};

const CardView = ({ card, highlight }) => {
    return (
        <div className={`card ${highlight || ""}`}>
            {card}
        </div>
    );
};

export default PointDetailPanel;