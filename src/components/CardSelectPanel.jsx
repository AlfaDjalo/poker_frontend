import React from 'react';
import "../css/CardSelectPanel.css";

/**
 * CardSelectPanel
 *
 * Renders in place of PlayerActionPanel whenever hand.decision.domain
 * is "CARD_SELECT" (e.g. drawmaha's discard/draw step) OR "CARD_PASS"
 * (e.g. Pass the Trash). Both domains share the exact same wire shape
 * — decision.options[0].min_count/max_count and a `selected_cards`
 * submit body — so this single panel serves both rather than
 * duplicating it. Card picking itself is NOT handled here — the
 * caller's existing card-click handler (GameSimulator's
 * togglePlayerCard) is what puts cards into `selectedCards`. This
 * panel only shows the min/max requirement, the current count, and a
 * Confirm button gated on that count being legal.
 *
 * Props:
 *   player        - acting PlayerDTO (for the name in the header)
 *   minCount      - decision.options[0].min_count — pass through
 *                   RAW (undefined if the field wasn't present).
 *                   Do NOT default this to 0 at the call site: a
 *                   missing count is a different situation from a
 *                   genuine "select 0 cards" requirement, and
 *                   collapsing them together makes Confirm look
 *                   active with nothing selected instead of showing
 *                   that the requirement is unknown.
 *   maxCount      - decision.options[0].max_count — same, raw. For
 *                   CARD_PASS this is always === minCount (a fixed
 *                   count, not a range) — the requirement text below
 *                   already collapses that case to a single number.
 *   selectedCards - string[] — cards currently selected from the
 *                   acting player's own hand (caller filters
 *                   selectedCards.playerCards[actingSeat] before
 *                   passing this down)
 *   onConfirm     - () => void — submit the current selection
 *   onClear       - () => void — clear the current selection
 *   submitting    - bool
 *   error         - string | null — surfaced from a rejected submit
 *                   (e.g. backend 400 on an illegal count)
 *   promptOverride - optional string replacing the computed
 *                   "Select N cards" text — used by CARD_PASS callers
 *                   to show e.g. "Choose 3 cards to pass to your left"
 *                   (built from decision.node_metadata.pass_direction)
 *                   instead of the generic discard/draw phrasing.
 *   waiting       - bool — when true, renders a passive "waiting"
 *                   state instead of the picker (nothing to
 *                   confirm/clear). Used by CARD_PASS once this seat
 *                   has already submitted its pass and the round
 *                   hasn't resolved yet (decision.domain is still
 *                   CARD_PASS but for a different seat) — passed
 *                   cards do not appear in anyone's hand until every
 *                   eligible player has acted, so there's nothing
 *                   more for this seat to do but wait. Not used by
 *                   CARD_SELECT (discard/draw is a single-player
 *                   round with no "others" to wait on).
 *   waitingText   - optional override for the waiting-state message.
 */
const CardSelectPanel = ({
    player,
    minCount,
    maxCount,
    selectedCards = [],
    onConfirm,
    onClear,
    submitting = false,
    error = null,
    promptOverride = null,
    waiting = false,
    waitingText = "✓ Submitted — waiting on other players…",
}) => {
    if (waiting) {
        return (
            <div className="card-select-panel card-select-panel--waiting">
                <div className="card-select-panel__waiting-text">
                    {waitingText}
                </div>
            </div>
        );
    }

    const count = selectedCards.length;

    // Both bounds must be real numbers before we can say anything is
    // "legal" — an undefined bound (backend hasn't sent min_count/
    // max_count for this decision) is NOT the same as a 0 bound, and
    // must never silently resolve to "0 selected is fine".
    const countsKnown = Number.isInteger(minCount) && Number.isInteger(maxCount);
    const isLegalCount = countsKnown && count >= minCount && count <= maxCount;

    const requirementText = promptOverride
        ? promptOverride
        : !countsKnown
            ? "Waiting on selection requirements…"
            : minCount === maxCount
                ? `Select exactly ${minCount} card${minCount !== 1 ? "s" : ""}`
                : `Select ${minCount}-${maxCount} cards`;

    return (
        <div className="card-select-panel">
            <div className="card-select-panel__header">
                <span className="card-select-panel__title">
                    {player?.name ?? "Player"} — {requirementText}
                </span>
                <span className={`card-select-panel__count ${isLegalCount ? "card-select-panel__count--ok" : ""}`}>
                    {countsKnown
                        ? `${count} / ${maxCount === minCount ? maxCount : `${minCount}-${maxCount}`} selected`
                        : `${count} selected`}
                </span>
            </div>

            {!countsKnown && (
                <div className="card-select-panel__warning">
                    ⚠ The server didn't report how many cards to select for this decision
                    — Confirm is disabled until it does.
                </div>
            )}

            {error && <div className="card-select-panel__error">⚠ {error}</div>}

            <div className="card-select-panel__actions">
                <button
                    className="card-select-panel__btn card-select-panel__btn--clear"
                    onClick={onClear}
                    disabled={submitting || count === 0}
                >
                    Clear
                </button>
                <button
                    className="card-select-panel__btn card-select-panel__btn--confirm"
                    onClick={onConfirm}
                    disabled={submitting || !isLegalCount}
                >
                    {submitting ? "Submitting…" : "Confirm"}
                </button>
            </div>
        </div>
    );
};

export default CardSelectPanel;