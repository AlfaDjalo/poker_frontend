import React from "react";
import "../css/TrainerComboDetail.css";

/**
 * TrainerComboDetail
 *
 * Shows every individual combo (e.g. AhKh, AsKs, AdKd, AcKc for "AKs")
 * that makes up a selected grid cell, each with its own stacked
 * action-probability bar — same segment coloring/order as the parent
 * grid cell, just per-combo instead of averaged.
 *
 * Props:
 *   hand        - canonical hand string, e.g. "AKs", "TT", "72o", or null
 *   comboData   - { combos: [{ cards: [str,str], probs: {action: p} }, ...] } | null
 *   actionOrder - string[] — stable render order, shared with the grid
 *   colorFor    - (action, index) => css color, shared with the grid
 */
const TrainerComboDetail = ({ hand, comboData, actionOrder, colorFor }) => {
    if (!hand) {
        return (
            <div className="trainer-combo-detail trainer-combo-detail--empty">
                Select a cell to see its individual combos
            </div>
        );
    }

    if (!comboData || !comboData.combos?.length) {
        return (
            <div className="trainer-combo-detail trainer-combo-detail--empty">
                No combo data for {hand}
            </div>
        );
    }

    return (
        <div className="trainer-combo-detail">
            <div className="trainer-combo-detail__title">{hand}</div>
            <div className="trainer-combo-detail__list">
                {comboData.combos.map((combo, idx) => (
                    <div key={idx} className="trainer-combo-row">
                        <div className="trainer-combo-row__cards">
                            {combo.cards.map((c) => (
                                <span key={c} className={`combo-card suit-${c[1]}`}>
                                    {c}
                                </span>
                            ))}
                        </div>

                        <div className="trainer-combo-row__bar">
                            {actionOrder.map((action, i) => {
                                const pct = Math.max(0, (combo.probs?.[action] ?? 0) * 100);
                                if (pct <= 0) return null;
                                return (
                                    <div
                                        key={action}
                                        className="trainer-combo-row__segment"
                                        style={{ width: `${pct}%`, backgroundColor: colorFor(action, i) }}
                                        title={`${action}: ${pct.toFixed(1)}%`}
                                    />
                                );
                            })}
                        </div>

                        <div className="trainer-combo-row__values">
                            {actionOrder.map((action) => (
                                <span key={action} className="trainer-combo-row__value">
                                    {action}: {((combo.probs?.[action] ?? 0) * 100).toFixed(0)}%
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TrainerComboDetail;