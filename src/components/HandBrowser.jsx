import React, { useState, useEffect, useCallback } from "react";
import { fetchHands, fetchVariants } from "../api/ReplayApi";
import "../css/HandBrowser.css";

const PAGE_SIZE = 20;

/**
 * HandBrowser
 *
 * Props:
 *   selectedHandId    - currently loaded hand id (to highlight)
 *   onSelectHand      - (handId) => void
 *   onHandListChange  - (hands) => void — called when list loads/changes
 * 
* NOTE: Prev/Next hand navigation is handled INSIDE this component so it
 * always operates on the currently filtered, paginated list.  The parent
 * no longer needs to provide onPrevHand / onNextHand callbacks.
 */
const HandBrowser = ({
    selectedHandId,
    onSelectHand,
    onHandListChange,
}) => {
    const [hands, setHands] = useState([]);
    const [variants, setVariants] = useState([]);
    const [variantFilter, setVariantFilter] = useState("");
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Load variant list once
    useEffect(() => {
        fetchVariants().then(setVariants).catch(() => {});
    }, []);

    const load = useCallback(async (off = 0, variant = variantFilter, autoSelect = false) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchHands({ limit: PAGE_SIZE, offset: off, variant: variant || null });
            setHands(data);
            setOffset(off);
            setTotal(data.length < PAGE_SIZE ? off + data.length : null);
            onHandListChange?.(data);
            // When triggered by a variant filter change, auto-load the first hand
            if (autoSelect && data.length > 0) {
                onSelectHand(data[0].hand_id);
            }
        } catch (e) {
            setError("Could not load hands.");
        } finally {
            setLoading(false);
        }
    }, [variantFilter]);

    // Reload when filter changes
    useEffect(() => { load(0, variantFilter, true); }, [variantFilter]);

    const canPrevPage = offset > 0;
    const canNextPage = total === null || offset + PAGE_SIZE < total;

    // Index of selected hand within the current page
    const selectedIdx = hands.findIndex(h => h.hand_id === selectedHandId);

    // ── Prev/Next hand within the current filtered page ───────────
    const handlePrevHand = useCallback(() => {
        if (selectedIdx > 0) {
            onSelectHand(hands[selectedIdx - 1].hand_id);
        } else if (canPrevPage) {
            // Load the previous page then auto-select the last hand on it
            load(Math.max(0, offset - PAGE_SIZE), variantFilter).then(() => {
                // After load, hands state updates asynchronously; we rely on
                // the user pressing Prev again or picking from the list.
            });
        }
    }, [selectedIdx, hands, canPrevPage, offset, variantFilter, onSelectHand, load]);

    const handleNextHand = useCallback(() => {
        if (selectedIdx >= 0 && selectedIdx < hands.length - 1) {
            onSelectHand(hands[selectedIdx + 1].hand_id);
        } else if (canNextPage) {
            load(offset + PAGE_SIZE, variantFilter);
        }
    }, [selectedIdx, hands, canNextPage, offset, variantFilter, onSelectHand, load]);

    const canPrevHand = selectedIdx > 0 || canPrevPage;
    const canNextHand = (selectedIdx >= 0 && selectedIdx < hands.length - 1) || canNextPage;

    return (
        <div className="hand-browser">

            {/* ── Header ── */}
            <div className="hand-browser__header">
                <span className="hand-browser__title">Hand History</span>
                <select
                    className="hand-browser__filter"
                    value={variantFilter}
                    onChange={e => setVariantFilter(e.target.value)}
                >
                    <option value="">All variants</option>
                    {variants.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>
            </div>

            {/* ── Fast fwd/rewind across hands ── */}
            <div className="hand-browser__hand-nav">
                <button
                    className="hb-nav-btn"
                    onClick={handlePrevHand}
                    disabled={!canPrevHand}
                    title="Previous hand"
                >
                    ⏮ Prev Hand
                </button>
                <button
                    className="hb-nav-btn"
                    onClick={handleNextHand}
                    disabled={!canNextHand}
                    title="Next hand"
                >
                    Next Hand ⏭
                </button>
            </div>

            {/* ── Hand list ── */}
            <div className="hand-browser__list">
                {loading && <div className="hand-browser__loading">Loading…</div>}
                {error && <div className="hand-browser__error">{error}</div>}
                {!loading && !error && hands.length === 0 && (
                    <div className="hand-browser__empty">No hands recorded yet.</div>
                )}
                {hands.map(h => (
                    <HandRow
                        key={h.hand_id}
                        hand={h}
                        isSelected={h.hand_id === selectedHandId}
                        onClick={() => onSelectHand(h.hand_id)}
                    />
                ))}
            </div>

            {/* ── Pagination ── */}
            <div className="hand-browser__pagination">
                <button
                    className="hb-page-btn"
                    disabled={!canPrevPage}
                    onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                >
                    ← Newer
                </button>
                <span className="hand-browser__page-info">
                    {offset + 1}–{offset + hands.length}
                </span>
                <button
                    className="hb-page-btn"
                    disabled={!canNextPage}
                    onClick={() => load(offset + PAGE_SIZE)}
                >
                    Older →
                </button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Hand row
// ─────────────────────────────────────────────

const HandRow = ({ hand, isSelected, onClick }) => {
    const date = hand.started_at
        ? new Date(hand.started_at).toLocaleString(undefined, {
            month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "—";

    return (
        <div
            className={`hand-row ${isSelected ? "hand-row--selected" : ""}`}
            onClick={onClick}
        >
            <div className="hand-row__top">
                <span className="hand-row__variant">{hand.variant_name}</span>
                <span className="hand-row__id">#{hand.hand_id}</span>
            </div>
            <div className="hand-row__bottom">
                <span className="hand-row__date">{date}</span>
                <span className="hand-row__pot">Pot: ${hand.pot}</span>
            </div>
            {hand.player_names?.length > 0 && (
                <div className="hand-row__players">
                    {hand.player_names.slice(0, 4).join(" · ")}
                    {hand.player_names.length > 4 && ` +${hand.player_names.length - 4}`}
                </div>
            )}
        </div>
    );
};

export default HandBrowser;