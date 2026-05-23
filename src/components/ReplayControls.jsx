import React from "react";
import "../css/ReplayControls.css";

const FALLBACK_STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"];

function getStreetName(streetNames, streetIndex) {
    if (streetNames) {
        const name = streetNames[streetIndex];
        if (name != null) return name;
    }
    return FALLBACK_STREET_NAMES[streetIndex] ?? `Street ${streetIndex}`;
}

/**
 * ReplayControls
 *
 * Props:
 *   cursor        - current frame index
 *   totalFrames   - total number of frames
 *   currentFrame  - the frame object at cursor
 *   frames        - all frames (for scrubber street markers)
 *   canBack / canForward
 *   onBack / onForward / onJumpStart / onJumpEnd / onScrub
 *   showAllCards  - bool
 *   onToggleCards - () => void
 */
const ReplayControls = ({
    cursor,
    totalFrames,
    currentFrame,
    frames,
    canBack,
    canForward,
    onBack,
    onForward,
    onJumpStart,
    onJumpEnd,
    onScrub,
    showAllCards,
    onToggleCards,
}) => {
    const progress = totalFrames > 1 ? cursor / (totalFrames - 1) : 0;

    const streetNames = currentFrame?.street_names ?? null;
    const streetName = currentFrame
        ? getStreetName(streetNames, currentFrame.street)
        : "—";

    // Build street marker positions for the scrubber
    const streetMarkers = [];
    const seen = new Set();
    frames?.forEach((f, i) => {
        if (f.frameType === "street" && !seen.has(f.street)) {
            seen.add(f.street);
            streetMarkers.push({ index: i, street: f.street, streetNames: f.street_names });
        }
    });

    return (
        <div className="replay-controls">

            {/* ── Street badge + action label ── */}
            <div className="replay-controls__label">
                <span className="replay-controls__street-badge">{streetName}</span>
                {currentFrame?.action && (
                    <span className="replay-controls__action-label">
                        {formatAction(currentFrame.action)}
                    </span>
                )}
                {currentFrame?.frameType === "deal" && (
                    <span className="replay-controls__action-label muted">Cards dealt</span>
                )}
                {currentFrame?.frameType === "showdown" && (
                    <span className="replay-controls__action-label highlight">Showdown</span>
                )}
            </div>

            {/* ── Scrubber ── */}
            <div className="replay-controls__scrubber-wrap">
                {/* Street tick marks */}
                <div className="replay-controls__ticks">
                    {streetMarkers.map(({ index, street, streetNames: markerStreetNames }) => {
                        const pct = totalFrames > 1 ? (index / (totalFrames - 1)) * 100 : 0;
                        return (
                            <div
                                key={street}
                                className="replay-controls__tick"
                                style={{ left: `${pct}%` }}
                                title={getStreetName(markerStreetNames, street)}
                            />
                        );
                    })}
                </div>
                <input
                    type="range"
                    min={0}
                    max={Math.max(0, totalFrames - 1)}
                    value={cursor}
                    onChange={e => onScrub(Number(e.target.value))}
                    className="replay-controls__scrubber"
                />
            </div>

            {/* ── Transport buttons ── */}
            <div className="replay-controls__transport">
                <button
                    className="replay-btn replay-btn--jump"
                    onClick={onJumpStart}
                    disabled={!canBack}
                    title="Jump to start"
                >
                    ⏮
                </button>
                <button
                    className="replay-btn replay-btn--step"
                    onClick={onBack}
                    disabled={!canBack}
                    title="Previous action"
                >
                    ◀
                </button>

                <div className="replay-controls__counter">
                    {cursor + 1} / {totalFrames}
                </div>

                <button
                    className="replay-btn replay-btn--step"
                    onClick={onForward}
                    disabled={!canForward}
                    title="Next action"
                >
                    ▶
                </button>
                <button
                    className="replay-btn replay-btn--jump"
                    onClick={onJumpEnd}
                    disabled={!canForward}
                    title="Jump to end"
                >
                    ⏭
                </button>
            </div>

            {/* ── Toggle ── */}
            <div className="replay-controls__toggles">
                <button
                    className={`replay-toggle ${showAllCards ? "active" : ""}`}
                    onClick={onToggleCards}
                    title="Show / hide hole cards"
                >
                    {showAllCards ? "🂠 All Cards Visible" : "🂠 Showdown Only"}
                </button>
            </div>
        </div>
    );
};

function formatAction(a) {
    if (!a) return "";
    const type = a.action_type.toUpperCase();
    if (a.amount) return `${a.player_name}  ·  ${type}  $${a.amount}`;
    return `${a.player_name}  ·  ${type}`;
}

export default ReplayControls;