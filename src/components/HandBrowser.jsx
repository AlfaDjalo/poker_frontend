import React, { useState, useEffect, useCallback } from "react";
import { fetchAllHands, fetchVariants, deleteTutorialHand } from "../api/handsApi";
import "../css/HandBrowser.css";

const PAGE_SIZE = 20;

const SOURCE_OPTIONS = [
    { value: "all",          label: "All Hands" },
    { value: "real",         label: "Hand History" },
    { value: "hypothetical", label: "Tutorial" },
];

/**
 * HandBrowser (unified)
 *
 * Replaces the old HandBrowser.jsx + TutorialHandBrowser.jsx split.
 * Lists both real and hypothetical hands from GET /hands, with a
 * source filter (All / Hand History / Tutorial) and a variant filter.
 *
 * Props:
 *   selectedHandId    - currently loaded hand id (to highlight)
 *   onSelectHand      - (handId, { isHypothetical }) => void
 *   onHandListChange  - (hands) => void — called when list loads/changes
 *   defaultSource     - "all" | "real" | "hypothetical"  (default "all")
 *   showCreateButton  - bool — show "+ Create Hand" (Tutorial page only)
 *   onCreateHand      - () => void
 */
const HandBrowser = ({
    selectedHandId,
    onSelectHand,
    onHandListChange,
    defaultSource = "all",
    showCreateButton = false,
    onCreateHand,
}) => {
    const [hands, setHands] = useState([]);
    const [variants, setVariants] = useState([]);
    const [variantFilter, setVariantFilter] = useState("");
    const [sourceFilter, setSourceFilter] = useState(defaultSource);
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Load variant list once
    useEffect(() => {
        fetchVariants().then(setVariants).catch(() => {});
    }, []);

    const load = useCallback(async (off = 0, variant = variantFilter, source = sourceFilter, autoSelect = false) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAllHands({ limit: PAGE_SIZE, offset: off, variant: variant || null, source });
            setHands(data);
            setOffset(off);
            setTotal(data.length < PAGE_SIZE ? off + data.length : null);
            onHandListChange?.(data);
            if (autoSelect && data.length > 0) {
                onSelectHand(data[0].hand_id, { isHypothetical: !!data[0].is_hypothetical });
            }
        } catch (e) {
            setError("Could not load hands.");
        } finally {
            setLoading(false);
        }
    }, [variantFilter, sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reload when filter changes
    useEffect(() => { load(0, variantFilter, sourceFilter, true); }, [variantFilter, sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const canPrevPage = offset > 0;
    const canNextPage = total === null || offset + PAGE_SIZE < total;

    const selectedIdx = hands.findIndex(h => h.hand_id === selectedHandId);

    const handlePrevHand = useCallback(() => {
        if (selectedIdx > 0) {
            const h = hands[selectedIdx - 1];
            onSelectHand(h.hand_id, { isHypothetical: !!h.is_hypothetical });
        } else if (canPrevPage) {
            load(Math.max(0, offset - PAGE_SIZE), variantFilter, sourceFilter);
        }
    }, [selectedIdx, hands, canPrevPage, offset, variantFilter, sourceFilter, onSelectHand, load]);

    const handleNextHand = useCallback(() => {
        if (selectedIdx >= 0 && selectedIdx < hands.length - 1) {
            const h = hands[selectedIdx + 1];
            onSelectHand(h.hand_id, { isHypothetical: !!h.is_hypothetical });
        } else if (canNextPage) {
            load(offset + PAGE_SIZE, variantFilter, sourceFilter);
        }
    }, [selectedIdx, hands, canNextPage, offset, variantFilter, sourceFilter, onSelectHand, load]);

    const canPrevHand = selectedIdx > 0 || canPrevPage;
    const canNextHand = (selectedIdx >= 0 && selectedIdx < hands.length - 1) || canNextPage;

    const handleDelete = async (e, hand) => {
        e.stopPropagation();
        if (!hand.is_hypothetical) return; // real hands aren't deletable from this UI
        if (!window.confirm("Delete this tutorial hand?")) return;
        try {
            await deleteTutorialHand(hand.hand_id);
            if (hand.hand_id === selectedHandId) onSelectHand(null, {});
            load(offset, variantFilter, sourceFilter);
        } catch (e) {
            setError("Failed to delete hand.");
        }
    };

    return (
        <div className="hand-browser">

            {/* ── Header ── */}
            <div className="hand-browser__header">
                <span className="hand-browser__title">Hands</span>
                {showCreateButton && (
                    <button className="hb-create-btn" onClick={onCreateHand}>
                        + Create Hand
                    </button>
                )}
            </div>

            {/* ── Filters ── */}
            <div className="hand-browser__filters">
                <select
                    className="hand-browser__filter"
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                >
                    {SOURCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
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
                    <div className="hand-browser__empty">No hands found.</div>
                )}
                {hands.map(h => (
                    <HandRow
                        key={`${h.is_hypothetical ? "t" : "r"}-${h.hand_id}`}
                        hand={h}
                        isSelected={h.hand_id === selectedHandId}
                        onClick={() => onSelectHand(h.hand_id, { isHypothetical: !!h.is_hypothetical })}
                        onDelete={(e) => handleDelete(e, h)}
                    />
                ))}
            </div>

            {/* ── Pagination ── */}
            <div className="hand-browser__pagination">
                <button
                    className="hb-page-btn"
                    disabled={!canPrevPage}
                    onClick={() => load(Math.max(0, offset - PAGE_SIZE), variantFilter, sourceFilter)}
                >
                    ← Newer
                </button>
                <span className="hand-browser__page-info">
                    {hands.length > 0 ? `${offset + 1}–${offset + hands.length}` : "0"}
                </span>
                <button
                    className="hb-page-btn"
                    disabled={!canNextPage}
                    onClick={() => load(offset + PAGE_SIZE, variantFilter, sourceFilter)}
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

const HandRow = ({ hand, isSelected, onClick, onDelete }) => {
    const date = (hand.started_at || hand.created_at)
        ? new Date(hand.started_at || hand.created_at).toLocaleString(undefined, {
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
                {hand.is_hypothetical && (
                    <span className="hand-row__badge" title="Tutorial hand">🧪 Tutorial</span>
                )}
                <span className="hand-row__id">#{hand.hand_id}</span>
                {hand.is_hypothetical && (
                    <button
                        className="hand-row__delete"
                        onClick={onDelete}
                        title="Delete tutorial hand"
                    >
                        ✕
                    </button>
                )}
            </div>
            <div className="hand-row__bottom">
                <span className="hand-row__date">{date}</span>
                {hand.pot != null && <span className="hand-row__pot">Pot: ${hand.pot}</span>}
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