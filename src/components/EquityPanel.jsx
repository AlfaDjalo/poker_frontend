// EquityPanel.jsx
// Displays per-player overall + per-point equity results.
//
// Props:
//   equity        — EquityResponse object or null
//                   { players: { seat: PlayerEquityDTO }, method, iterations, elapsed_ms }
//   players       — players map from hand state (keyed by seat number)
//   loading       — bool
//   error         — string or null
//   onCalculate   — () => void
//   onClear       — () => void
//
// PlayerEquityDTO:
//   overall_equity_fraction, overall_equity_currency,
//   scoop_probability, split_probability,
//   points: { pointName: { win_share, win_probability, tie_probability,
//                           equity_currency, equity_percent } }
//
// ── REDESIGN (table view, scope-only) ───────────────────────────────
// - "Show" dropdown selects Overall vs a single point/component. It is
//   hidden entirely when there is only one point (nothing to switch to).
// - No metric dropdown, no point-breakdown toggle.
// - Overall scope renders a table: Player / Equity ($) / Equity (%).
// - Point scope renders a table: Player / % Win outright / % Chop,
//   where "win outright" excludes ties (win_probability) and "chop" is
//   tie_probability.
// - Clicking a player's name expands a detail row beneath them with
//   full overall equities + the per-point %s.
// - Player list scrolls vertically if it overflows.
// ─────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import "../css/EquityPanel.css";

// ─────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────

function pct(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return `${(v * 100).toFixed(1)}%`;
}

function currency(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatMethod(method, iterations) {
    if (method === "exact") return `Exact · ${iterations.toLocaleString()} combos`;
    return `Monte Carlo · ${iterations.toLocaleString()} samples`;
}

const SEAT_COLOURS = [
    "#f59e0b", // amber   (seat 1)
    "#38bdf8", // sky     (seat 2)
    "#4ade80", // green   (seat 3)
    "#f87171", // red     (seat 4)
    "#a78bfa", // violet  (seat 5)
    "#fb923c", // orange  (seat 6)
];

function seatColour(seatIndex) {
    return SEAT_COLOURS[seatIndex % SEAT_COLOURS.length];
}

const OVERALL_SCOPE = "__overall__";

// ─────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="eq-spinner-wrap">
            <div className="eq-spinner" />
            <span className="eq-spinner-label">Calculating…</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// ScopeSelect — "Overall" or a specific point. Hidden by caller when
// there's only one point.
// ─────────────────────────────────────────────────────────────────

function ScopeSelect({ value, onChange, pointNames }) {
    return (
        <select
            className="eq-scope-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value={OVERALL_SCOPE}>Overall</option>
            {pointNames.map((pt) => (
                <option key={pt} value={pt}>
                    {pt.replace(/_/g, " ")}
                </option>
            ))}
        </select>
    );
}

// ─────────────────────────────────────────────────────────────────
// PlayerDetail — expanded box: overall equities + per-point %s
// ─────────────────────────────────────────────────────────────────

function PlayerDetail({ data, pointNames }) {
    return (
        <div className="eq-player-row__detail">
            <div className="eq-stat-grid">
                <div className="eq-stat">
                    <span className="eq-stat__label">Equity ($)</span>
                    <span className="eq-stat__value">{currency(data.overall_equity_currency)}</span>
                </div>
                <div className="eq-stat">
                    <span className="eq-stat__label">Equity (%)</span>
                    <span className="eq-stat__value">{pct(data.overall_equity_fraction)}</span>
                </div>
                <div className="eq-stat">
                    <span className="eq-stat__label">Scoop %</span>
                    <span className="eq-stat__value eq-stat__value--scoop">
                        {pct(data.scoop_probability)}
                    </span>
                </div>
                <div className="eq-stat">
                    <span className="eq-stat__label">Split %</span>
                    <span className="eq-stat__value eq-stat__value--split">
                        {pct(data.split_probability)}
                    </span>
                </div>
            </div>

            {pointNames.length > 0 && (
                <div className="eq-table-scroll">
                    <table className="eq-table eq-table--detail">
                        <thead>
                            <tr>
                                <th className="eq-table__player-col">Point</th>
                                <th className="eq-table__point-col">Win %</th>
                                <th className="eq-table__point-col">Chop %</th>
                                <th className="eq-table__point-col">Eq ($)</th>
                                <th className="eq-table__point-col">Eq (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pointNames.map((pt) => {
                                const pd = data.points?.[pt];
                                if (!pd) return null;
                                return (
                                    <tr key={pt} className="eq-table__row">
                                        <td className="eq-table__player-cell">{pt.replace(/_/g, " ")}</td>
                                        <td className="eq-table__val-cell">{pct(pd.win_probability)}</td>
                                        <td className="eq-table__val-cell">{pct(pd.tie_probability)}</td>
                                        <td className="eq-table__val-cell">{currency(pd.equity_currency)}</td>
                                        <td className="eq-table__val-cell">{pct(pd.equity_percent)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

const EquityPanel = ({
    equity,
    players,
    loading,
    error,
    onCalculate,
    onClear,
}) => {
    const [scope, setScope] = useState(OVERALL_SCOPE);
    const [expandedSeat, setExpandedSeat] = useState(null);

    const { seats, seatNames, pointNames } = useMemo(() => {
        if (!equity || !equity.players) {
            return { seats: [], seatNames: {}, pointNames: [] };
        }

        const seats = Object.keys(equity.players)
            .map(Number)
            .sort((a, b) => a - b);

        const seatNames = {};
        seats.forEach((s) => {
            seatNames[s] = players?.[s]?.name ?? `Player ${s}`;
        });

        const pointNames =
            seats.length > 0 ? Object.keys(equity.players[seats[0]]?.points ?? {}) : [];

        return { seats, seatNames, pointNames };
    }, [equity, players]);

    const showScopeSelect = pointNames.length > 1;

    // If the equity payload changes and no longer has the previously
    // selected point (e.g. new variant), fall back to Overall.
    const activeScope = useMemo(() => {
        if (!showScopeSelect) return OVERALL_SCOPE;
        if (scope === OVERALL_SCOPE) return OVERALL_SCOPE;
        return pointNames.includes(scope) ? scope : OVERALL_SCOPE;
    }, [scope, pointNames, showScopeSelect]);

    const isOverallScope = activeScope === OVERALL_SCOPE;

    // Players sorted richest-first for the active scope
    const orderedSeats = useMemo(() => {
        if (!equity) return [];
        return [...seats].sort((a, b) => {
            const da = equity.players[a];
            const db = equity.players[b];
            const va = isOverallScope
                ? (da?.overall_equity_fraction ?? 0)
                : (da?.points?.[activeScope]?.win_probability ?? 0);
            const vb = isOverallScope
                ? (db?.overall_equity_fraction ?? 0)
                : (db?.points?.[activeScope]?.win_probability ?? 0);
            return vb - va;
        });
    }, [equity, seats, isOverallScope, activeScope]);

    const seatColourIndex = useMemo(() => {
        const map = {};
        seats.forEach((s, i) => (map[s] = i));
        return map;
    }, [seats]);

    return (
        <div className="equity-panel">
            {/* ── Header ── */}
            <div className="equity-panel__header">
                <span className="equity-panel__title">Equity</span>
                <div className="equity-panel__actions">
                    {equity && (
                        <button className="eq-btn eq-btn--ghost" onClick={onClear} title="Clear equity">
                            ✕
                        </button>
                    )}
                    <button className="eq-btn eq-btn--primary" onClick={onCalculate} disabled={loading}>
                        {loading ? "…" : "Calculate"}
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="equity-panel__body">
                {/* Error state */}
                {error && !loading && (
                    <div className="eq-error">
                        <span className="eq-error__icon">⚠</span>
                        <span className="eq-error__msg">{error}</span>
                        <button className="eq-btn eq-btn--ghost eq-btn--sm" onClick={onCalculate}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Loading state */}
                {loading && <Spinner />}

                {/* Results */}
                {equity && !loading && (
                    <>
                        {/* Controls — scope select only, hidden with a single point */}
                        {showScopeSelect && (
                            <div className="eq-controls">
                                <div className="eq-controls-row">
                                    <div className="eq-metric-bar">
                                        <span className="eq-metric-bar__label">Show</span>
                                        <ScopeSelect
                                            value={activeScope}
                                            onChange={setScope}
                                            pointNames={pointNames}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Player table */}
                        <div className="eq-table-scroll eq-table-scroll--players">
                            <table className="eq-table eq-table--main">
                                <thead>
                                    <tr>
                                        <th className="eq-table__player-col">Player</th>
                                        {isOverallScope ? (
                                            <>
                                                <th className="eq-table__point-col">Equity ($)</th>
                                                <th className="eq-table__point-col">Equity (%)</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="eq-table__point-col">% Win</th>
                                                <th className="eq-table__point-col">% Chop</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderedSeats.map((seat) => {
                                        const data = equity.players[seat];
                                        const colour = seatColour(seatColourIndex[seat]);
                                        const expanded = expandedSeat === seat;
                                        const pointData = !isOverallScope ? data.points?.[activeScope] : null;

                                        return (
                                            <React.Fragment key={seat}>
                                                <tr
                                                    className={`eq-table__row eq-table__row--clickable${expanded ? " eq-table__row--expanded" : ""}`}
                                                    onClick={() =>
                                                        setExpandedSeat((cur) => (cur === seat ? null : seat))
                                                    }
                                                >
                                                    <td className="eq-table__player-cell">
                                                        <span className="eq-seat-dot" style={{ background: colour }} />
                                                        <span className="eq-table__player-name">
                                                            {seatNames[seat]}
                                                        </span>
                                                        <span className={`eq-chevron${expanded ? " eq-chevron--open" : ""}`}>
                                                            ⌄
                                                        </span>
                                                    </td>
                                                    {isOverallScope ? (
                                                        <>
                                                            <td className="eq-table__val-cell" style={{ color: colour }}>
                                                                {currency(data.overall_equity_currency)}
                                                            </td>
                                                            <td className="eq-table__val-cell" style={{ color: colour }}>
                                                                {pct(data.overall_equity_fraction)}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="eq-table__val-cell" style={{ color: colour }}>
                                                                {pct(pointData?.win_probability)}
                                                            </td>
                                                            <td className="eq-table__val-cell" style={{ color: colour }}>
                                                                {pct(pointData?.tie_probability)}
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                                {expanded && (
                                                    <tr className="eq-table__row eq-table__row--detail">
                                                        <td colSpan={3}>
                                                            <PlayerDetail data={data} pointNames={pointNames} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer metadata */}
                        <div className="eq-footer">
                            <span className="eq-footer__meta">
                                {formatMethod(equity.method, equity.iterations)}
                            </span>
                            <span className="eq-footer__time">{equity.elapsed_ms.toFixed(0)} ms</span>
                        </div>
                    </>
                )}

                {/* Empty state */}
                {!equity && !loading && !error && (
                    <div className="eq-empty">
                        Press <strong>Calculate</strong> to evaluate equity
                    </div>
                )}
            </div>
        </div>
    );
};

export default EquityPanel;