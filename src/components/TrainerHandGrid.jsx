import React, { useEffect, useState } from "react";
import { fetchTrainerGrid, fetchTrainerHistoryGrid } from "../api/trainerApi";
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

// Fixed, semantic color legend — consistent across every action name
// the Trainer can ever offer, regardless of scenario (push-fold's
// fold/all_in, river's check/bet/call/fold). Passive actions (check)
// stay neutral grey; fold is blue; call is green; anything that puts
// more chips in (bet/raise/all the bet_* sizes/all_in) is warm
// orange-to-red, with all_in as the most aggressive/red of the group.
const KNOWN_ACTION_COLORS = {
    fold: "#2563eb",   // blue
    check: "#64748b",  // grey
    call: "#22c55e",   // green
    bet: "#f97316",    // orange
    bet_25: "#f97316",
    bet_50: "#f97316",
    bet_75: "#f97316",
    bet_100: "#f97316",
    bet_150: "#f97316",
    raise: "#ea580c",  // darker orange
    all_in: "#dc2626", // red
};
const FALLBACK_PALETTE = ["#0891b2", "#ca8a04", "#db2777", "#65a30d", "#7c3aed"];

function colorFor(action, index) {
    return KNOWN_ACTION_COLORS[action] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

// One cell's stacked segments, left-to-right (horizontal), in
// actionOrder. Each segment's WIDTH is its probability share; the bar
// always fills the cell's full height.
const CellBar = ({ probs, actionOrder }) => (
    <div className="hand-cell__bar" style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%" }}>
        {actionOrder.map((action, i) => {
            const pct = Math.max(0, (probs?.[action] ?? 0) * 100);
            if (pct <= 0) return null;
            return (
                <div
                    key={action}
                    className="hand-cell__segment"
                    style={{ width: `${pct}%`, height: "100%", backgroundColor: colorFor(action, i) }}
                    title={`${action}: ${pct.toFixed(1)}%`}
                />
            );
        })}
    </div>
);

/**
 * TrainerHandGrid
 *
 * Live mode (default): shows the 169-hand grid for the CURRENT
 * in-progress scenario decision (GET /trainer/grid).
 *
 * Review mode (historyEntryId != null): shows the grid recreated for
 * a PAST, already-graded scoreboard entry (GET
 * /trainer/history/{id}/grid) — lets you see what the model would
 * have done with every hand at that exact decision point, same as
 * live, just for a hand that's already resolved.
 */
const TrainerHandGrid = ({ onClose, historyEntryId = null }) => {
    const [gridData, setGridData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedHand, setSelectedHand] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelectedHand(null);
        const fetcher = historyEntryId != null
            ? () => fetchTrainerHistoryGrid(historyEntryId)
            : fetchTrainerGrid;
        fetcher()
            .then((data) => { if (!cancelled) setGridData(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [historyEntryId]);

    const actionOrder = gridData?.action_order || [];

    return (
        <div className="trainer-hand-grid">
            <div className="trainer-hand-grid__header">
                <div>
                    <span className="trainer-hand-grid__title">
                        {historyEntryId != null ? "Hand Grid (past decision)" : "Hand Grid"}
                    </span>
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