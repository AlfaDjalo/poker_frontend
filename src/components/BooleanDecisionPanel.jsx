import React from 'react';
import "../css/BooleanDecisionPanel.css";

/**
 * BooleanDecisionPanel
 *
 * Renders in place of PlayerActionPanel/CardSelectPanel whenever
 * hand.decision.domain === "BOOLEAN" (e.g. Grinch's "Christmas next
 * street?" prompt — see CAP_Technical_Document.md §2.9.11). A single
 * yes/no decision for one player, no amount or card selection
 * involved.
 *
 * The two options normally arrive as decision.options with
 * action_name "yes"/"no" and a display label — this panel reads
 * label off the option when present and falls back to a generic
 * Yes/No otherwise so it isn't blocked on the backend always sending
 * one.
 *
 * Props:
 *   player      - acting PlayerDTO (for the name in the header)
 *   prompt      - optional display string for the question itself
 *                 (e.g. decision.context?.prompt or a node label).
 *                 Falls back to a generic phrase if not provided —
 *                 this decision type is new (Grinch is its first
 *                 shipped use) so the backend's context shape here
 *                 isn't fully pinned down yet.
 *   options     - decision.options array, each optionally
 *                 { action_name: "yes"|"no", label }
 *   onDecide    - (boolValue: boolean) => void
 *   submitting  - bool
 *   error       - string | null — surfaced from a rejected submit
 */
const BooleanDecisionPanel = ({
    player,
    prompt,
    options = [],
    onDecide,
    submitting = false,
    error = null,
}) => {
    const yesOption = options.find(o => o.action_name === "yes");
    const noOption = options.find(o => o.action_name === "no");

    const yesLabel = yesOption?.label ?? "Yes";
    const noLabel = noOption?.label ?? "No";

    return (
        <div className="boolean-decision-panel">
            <div className="boolean-decision-panel__header">
                <span className="boolean-decision-panel__title">
                    {player?.name ?? "Player"} — {prompt ?? "Decision required"}
                </span>
            </div>

            {error && <div className="boolean-decision-panel__error">⚠ {error}</div>}

            <div className="boolean-decision-panel__actions">
                <button
                    className="boolean-decision-panel__btn boolean-decision-panel__btn--no"
                    onClick={() => onDecide(false)}
                    disabled={submitting}
                >
                    {submitting ? "Submitting…" : noLabel}
                </button>
                <button
                    className="boolean-decision-panel__btn boolean-decision-panel__btn--yes"
                    onClick={() => onDecide(true)}
                    disabled={submitting}
                >
                    {submitting ? "Submitting…" : yesLabel}
                </button>
            </div>
        </div>
    );
};

export default BooleanDecisionPanel;