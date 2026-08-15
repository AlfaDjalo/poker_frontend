import React, { useEffect, useState } from "react";
import { fetchTrainerGrid } from "../api/trainerApi";
import TrainerComboDetail from "./TrainerComboDetail";
import "../css/TrainerHandGrid.css";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const createHandGrid = () => {
    const grid = [];
    for (let row = 0; row < 13; row++) {
        const gridRow = [];
        for (let col = 0; col < 13; col++) {
            if (row === col) gridRow.push(RANKS[row] + RANKS[col]);
            else if (row < col) gridRow.push(RANKS[row] + RANKS[col] + "s");
            else gridRow.push(RANKS[col] + RANKS[row] + "o");
        }
        grid.push(gridRow);
    }
    return grid;
};

const HAND_GRID = createHandGrid();

// Stable color per action name. Unknown/future action names fall back
// to the palette below in first-seen order so a new action type never
// collides with an existing one within a single render.
const KNOWN_ACTION_COLORS = {
    fold: "#dc2626",
    check: "#64748b",
    call: "#22c55e",
    all_in: "#2563eb",
    bet_25: "#a855f7",
    bet_50: "#9333ea",
    bet_75: "#7c3aed",
    bet_100: "#6d28d9",
    bet_150: "#5b21b6",
    raise: "#2563eb",
};
const FALLBACK_PALETTE = ["#0891b2", "#ca8a04", "#db2777", "#65a30d", "#ea580c"];

function colorFor(action, index) {
    return KNOWN_ACTION_COLORS[action] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

// One cell's stacked segments, top-to-bottom, in actionOrder.
const CellBar = ({ probs, actionOrder }) => (
    <div className="hand-cell__bar">
        {actionOrder.map((action, i) => {
            const pct = Math.max(0, (probs?.[action] ?? 0) * 100);
            if (pct <= 0) return null;
            return (
                <div
                    key={action}
                    className="hand-cell__segment"
                    style={{ height: `${pct}%`, backgroundColor: colorFor(action, i) }}
                    title={`${action}: ${pct.toFixed(1)}%`}
                />
            );
        })}
    </div>
);

const TrainerHandGrid = ({ onClose }) => {
    const [gridData, setGridData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedHand, setSelectedHand] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchTrainerGrid()
            .then((data) => { if (!cancelled) setGridData(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const actionOrder = gridData?.action_order || [];

    return (
        <div className="trainer-hand-grid">
            <div className="trainer-hand-grid__header">
                <div>
                    <span className="trainer-hand-grid__title">Hand Grid</span>
                    {gridData && (
                        <span className="trainer-hand-grid__subtitle">
                            {gridData.position} · {gridData.hero_effective_bb}bb effective
                        </span>
                    )}
                </div>
                <div className="trainer-hand-grid__legend">
                    {actionOrder.map((action, i) => (
                        <span key={action} className="trainer-hand-grid__legend-item">
                            <span
                                className="trainer-hand-grid__legend-swatch"
                                style={{ backgroundColor: colorFor(action, i) }}
                            />
                            {action}
                        </span>
                    ))}
                </div>
                {onClose && (
                    <button className="trainer-hand-grid__close" onClick={onClose} title="Close hand grid">
                        X
                    </button>
                )}
            </div>

            {loading ? (
                <div className="trainer-hand-grid__status">Computing grid…</div>
            ) : error ? (
                <div className="trainer-hand-grid__status trainer-hand-grid__status--error">
                    {error}
                </div>
            ) : (
                <div className="trainer-hand-grid__body">
                    <div className="hand-grid-169">
                        {HAND_GRID.map((row, r) =>
                            row.map((hand, c) => {
                                const probs = gridData?.action_grid?.[r]?.[c];
                                return (
                                    <div
                                        key={hand}
                                        className={`hand-cell ${selectedHand === hand ? "selected" : ""}`}
                                        onClick={() => setSelectedHand(hand)}
                                    >
                                        <CellBar probs={probs} actionOrder={actionOrder} />
                                        <span className="hand-cell__label">{hand}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <TrainerComboDetail
                        hand={selectedHand}
                        comboData={selectedHand ? gridData?.combos?.[selectedHand] : null}
                        actionOrder={actionOrder}
                        colorFor={colorFor}
                    />
                </div>
            )}
        </div>
    );
};

export default TrainerHandGrid;