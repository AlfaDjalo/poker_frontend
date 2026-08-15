import React, { useState, useEffect } from "react";
import { createAnnotation, updateAnnotation, deleteAnnotation } from "../api/ReplayApi";
import "../css/AnnotationPanel.css";

/**
 * AnnotationPanel
 *
 * Shows all annotations for the current action, lets user:
 *  - Step through multiple annotations with prev/next
 *  - Add a new annotation (with optional card selection)
 *  - Edit / delete their own annotations
 *
 * Props:
 *   handId          - int
 *   actionId        - number | "hand"
 *                     "hand" = deal / street / showdown frames (hand-level annotations)
 *                     number = a specific action id
 *   annotations     - all annotations for this hand (array)
 *   selectedCards   - cards the user has highlighted on the board/hand
 *   onAnnotationSaved  - () => void  (refresh parent)
 *   onAnnotationDeleted - () => void
 *   onHighlightCards - (cards: string[]) => void — push card selection to table
 */
const AnnotationPanel = ({
    handId,
    actionId,
    annotations = [],
    selectedCards = [],
    onAnnotationSaved,
    onAnnotationDeleted,
    onHighlightCards,
}) => {
    // "hand" sentinel means this is a hand-level frame (deal / street / showdown).
    // Hand-level annotations are stored with action_id = null in the DB.
    const isHandLevel = actionId === "hand";

    // Filter to annotations for the current frame:
    //   hand-level frames → a.action_id is null
    //   action frames     → a.action_id matches the numeric actionId exactly
    const relevant = annotations.filter(a =>
        isHandLevel ? a.action_id == null : a.action_id === actionId
    );

    const [annoIdx, setAnnoIdx] = useState(0);
    const [mode, setMode] = useState("view"); // "view" | "add" | "edit"
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Reset local idx when action changes
    useEffect(() => {
        setAnnoIdx(0);
        setMode("view");
        setDraft("");
        setError(null);
    }, [actionId]);

    const current = relevant[annoIdx] ?? null;

    // When viewing an annotation, push its card selection to the table
    useEffect(() => {
        if (mode === "view" && current?.selected_cards?.length) {
            onHighlightCards?.(current.selected_cards);
        } else if (mode === "view") {
            onHighlightCards?.([]);
        }
    }, [current, mode]);

    const handleSave = async () => {
        if (!draft.trim()) return;
        setSaving(true);
        setError(null);
        try {
            if (mode === "edit" && current) {
                await updateAnnotation(current.annotation_id, {
                    comment: draft.trim(),
                    selectedCards,
                });
            } else {
                await createAnnotation(handId, {
                    actionId: isHandLevel ? null : actionId,
                    comment: draft.trim(),
                    selectedCards,
                });
            }
            setMode("view");
            setDraft("");
            onAnnotationSaved?.();
        } catch (e) {
            setError("Failed to save. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = () => {
        setDraft(current?.comment ?? "");
        setMode("edit");
    };

    const handleDelete = async () => {
        if (!current) return;
        if (!window.confirm("Delete this annotation?")) return;
        try {
            await deleteAnnotation(current.annotation_id);
            setAnnoIdx(Math.max(0, annoIdx - 1));
            onAnnotationDeleted?.();
        } catch (e) {
            setError("Failed to delete.");
        }
    };

    const handleCancel = () => {
        setMode("view");
        setDraft("");
        setError(null);
    };

    return (
        <div className="annotation-panel">

            {/* ── Header ── */}
            <div className="annotation-panel__header">
                <span className="annotation-panel__title">
                    📝 Annotations
                    {relevant.length > 0 && (
                        <span className="annotation-panel__count">{relevant.length}</span>
                    )}
                </span>
                {mode === "view" && (
                    <button
                        className="annotation-btn annotation-btn--add"
                        onClick={() => { setMode("add"); setDraft(""); }}
                    >
                        + Add
                    </button>
                )}
            </div>

            {/* ── View mode ── */}
            {mode === "view" && (
                <>
                    {relevant.length === 0 ? (
                        <div className="annotation-panel__empty">
                            No annotations for this action yet.
                        </div>
                    ) : (
                        <div className="annotation-panel__viewer">
                            {/* Navigation between multiple annotations */}
                            {relevant.length > 1 && (
                                <div className="annotation-panel__nav">
                                    <button
                                        className="annotation-nav-btn"
                                        disabled={annoIdx === 0}
                                        onClick={() => setAnnoIdx(i => i - 1)}
                                    >◀</button>
                                    <span className="annotation-panel__nav-counter">
                                        {annoIdx + 1} / {relevant.length}
                                    </span>
                                    <button
                                        className="annotation-nav-btn"
                                        disabled={annoIdx === relevant.length - 1}
                                        onClick={() => setAnnoIdx(i => i + 1)}
                                    >▶</button>
                                </div>
                            )}

                            <div className="annotation-panel__comment">
                                {current?.comment}
                            </div>

                            {/* Selected cards display */}
                            {current?.selected_cards?.length > 0 && (
                                <div className="annotation-panel__cards">
                                    {current.selected_cards.map((c, i) => (
                                        <span key={i} className={`anno-card ${suitClass(c)}`}>{c}</span>
                                    ))}
                                </div>
                            )}

                            <div className="annotation-panel__meta">
                                {current?.created_at && (
                                    <span>{formatDate(current.created_at)}</span>
                                )}
                                <div className="annotation-panel__actions">
                                    <button className="annotation-btn annotation-btn--edit" onClick={handleEdit}>Edit</button>
                                    <button className="annotation-btn annotation-btn--delete" onClick={handleDelete}>Delete</button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── Add / Edit mode ── */}
            {(mode === "add" || mode === "edit") && (
                <div className="annotation-panel__editor">
                    <textarea
                        className="annotation-panel__textarea"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="Write your note here…"
                        rows={4}
                        autoFocus
                    />

                    {/* Selected cards */}
                    {selectedCards.length > 0 && (
                        <div className="annotation-panel__card-hint">
                            <span className="annotation-panel__card-hint-label">Highlighted cards:</span>
                            {selectedCards.map((c, i) => (
                                <span key={i} className={`anno-card ${suitClass(c)}`}>{c}</span>
                            ))}
                        </div>
                    )}

                    {error && <div className="annotation-panel__error">{error}</div>}

                    <div className="annotation-panel__editor-actions">
                        <button
                            className="annotation-btn annotation-btn--cancel"
                            onClick={handleCancel}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            className="annotation-btn annotation-btn--save"
                            onClick={handleSave}
                            disabled={saving || !draft.trim()}
                        >
                            {saving ? "Saving…" : mode === "edit" ? "Update" : "Save"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function suitClass(card) {
    if (!card || card.length < 2) return "";
    const suit = card[card.length - 1].toLowerCase();
    return { h: "suit-h", d: "suit-d", c: "suit-c", s: "suit-s" }[suit] ?? "";
}

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default AnnotationPanel;