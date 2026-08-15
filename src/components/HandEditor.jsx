import React, { useCallback } from "react";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    pointerWithin,
    rectIntersection,
} from "@dnd-kit/core";

import CardSelector from "./CardSelector";
import DiscardPile from "./DiscardPile";
import HandEditorControls from "./HandEditorControls";
import Card from "./Card";
import "../css/HandEditor.css";

/**
 * HandEditor
 *
 * Root overlay that wraps the poker table (passed as `children`) with a
 * CardSelector panel (top), DiscardPile (bottom), and HandEditorControls.
 * All drag-and-drop for card movements is managed here.
 *
 * Props:
 *   mode              — "live" | "replayer" | "creation"
 *   editState         — current editState object
 *   validationErrors  — string[]
 *   serverErrors      — string[]  (may contain strings OR FastAPI/pydantic error
 *                                   objects {type, loc, msg, input} — normalised below)
 *   submitting        — bool
 *   showDiscardPile   — bool (from settings)
 *   onMoveCard        — (card, fromZone, toZone) => void
 *   onSetPot          — (amount) => void
 *   onApply           — () => void
 *   onPlayFromHere    — () => void
 *   onSave            — () => void
 *   onSaveAsNew       — () => void  (creation mode, only when editing an existing hand)
 *   onCancel          — () => void
 *   children          — the PokerTable (already wired with DroppableSlots)
 */
 
// FastAPI/pydantic validation errors come back as either a single object,
// or (more commonly) an array of objects: {type, loc, msg, input}.
// React cannot render objects as children, so normalise everything to strings.
function normalizeErrors(errs) {
    if (!errs) return [];
    const list = Array.isArray(errs) ? errs : [errs];
    return list.map(e => {
        if (e == null) return null;
        if (typeof e === "string") return e;
        if (typeof e === "object") {
            // pydantic validation error shape
            if (typeof e.msg === "string") {
                const field = Array.isArray(e.loc) ? e.loc.join(".") : e.loc;
                return field ? `${field}: ${e.msg}` : e.msg;
            }
            try {
                return JSON.stringify(e);
            } catch {
                return String(e);
            }
        }
        return String(e);
    }).filter(Boolean);
}

const HandEditor = ({
    mode,
    editState,
    validationErrors = [],
    serverErrors = [],
    submitting = false,
    showDiscardPile = true,
    onMoveCard,
    onSetPot,
    onApply,
    onPlayFromHere,
    onSave,
    onSaveAsNew,
    onCancel,
    children,
}) => {
    const [activeDrag, setActiveDrag] = React.useState(null); // { card, fromZone }

        // PointerSensor with a small activation distance so clicks-without-drag
    // still work (handled by DraggableCard's own click/drag distinction),
    // but real drags register reliably even over small slot targets.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
    );

    // ── Compute used cards (for CardSelector greying) ─────────────
    const usedCards = React.useMemo(() => {
        if (!editState) return [];
        const used = [];
        for (const p of editState.players) {
            for (const c of p.hole_cards) { if (c) used.push(c); }
        }
        for (const c of editState.node_cards) { if (c) used.push(c); }
        for (const c of editState.discard_pile) { if (c) used.push(c); }
        return used;
    }, [editState]);

        // ── Collision detection ─────────────────────────────────────────
    // closestCenter performs poorly here because player-hand slots are small
    // and tightly packed inside seat containers; a pointer can easily be
    // "closer" to a different, unintended droppable's centre.
    // pointerWithin (does the pointer sit inside the droppable's rect?) is far
    // more predictable for this kind of nested drop-zone UI. We fall back to
    // rectIntersection if pointerWithin finds nothing (e.g. fast drags).
    const collisionDetection = useCallback((args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        return rectIntersection(args);
    }, []);

    // ── DnD handlers ──────────────────────────────────────────────

    const handleDragStart = useCallback((event) => {
        const { active } = event;
        const { card, variant, location, index } = active.data.current ?? {};
        let fromZone = "deck";
        if (variant === "player") fromZone = `player-${location}`;
        else if (variant === "board") fromZone = `node-${index}`;
        else if (variant === "discard") fromZone = "discard";
        setActiveDrag({ card, fromZone });
    }, []);

    const handleDragEnd = useCallback((event) => {
        const { over } = event;
        if (!activeDrag) { setActiveDrag(null); return; }

        const { card, fromZone } = activeDrag;
        let toZone = "deck"; // dropping on nothing returns card to deck

        if (over) {
            const { variant, location, index, zone } = over.data.current ?? {};
            if (zone === "discard" || variant === "discard") toZone = "discard";
            else if (zone === "selector" || variant === "selector") toZone = "deck";
            else if (variant === "player") toZone = `player-${location}`;
            else if (variant === "board") toZone = `node-${index}`;
        }

        onMoveCard?.(card, fromZone, toZone);
        setActiveDrag(null);
    }, [activeDrag, onMoveCard]);

    const handleDragCancel = useCallback(() => {
        setActiveDrag(null);
    }, []);

    const handleSelectorClick = useCallback((card) => {
        // Drag-and-drop is the primary mechanism; click is a no-op fallback.
    }, []);

    const allErrors = [...normalizeErrors(validationErrors), ...normalizeErrors(serverErrors)];

    if (!editState) return null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="hand-editor">

                {/* ── Top banner ── */}
                <div className="hand-editor__banner">
                    <span className="hand-editor__banner-icon">✏</span>
                    <span className="hand-editor__banner-text">
                        {mode === "live"      && "Editing Live Hand — drag cards to reassign"}
                        {mode === "replayer"  && "Editing from Replay — adjust cards, then Play from Here"}
                        {mode === "creation"  && "Creating Hand — build the scenario step by step"}
                    </span>
                </div>

                {/* ── Card deck — full width, top ── */}
                <div className="hand-editor__deck-row">
                    <CardSelector
                        onSelectCard={handleSelectorClick}
                        usedCards={usedCards}
                    />
                </div>

                {/* ── Pot editor ── */}
                <div className="hand-editor__pot-row">
                    <span className="hand-editor__pot-label">Pot:</span>
                    <input
                        className="editable-pot__input"
                        type="number"
                        min={0}
                        value={editState.pot}
                        onChange={e => onSetPot?.(Number(e.target.value))}
                    />
                </div>

                {/* ── Table — full width ── */}
                <div className="hand-editor__table">
                    {children}
                </div>
 
                {/* ── Discard pile — full width, bottom ── */}
                {showDiscardPile && (
                    <div className="hand-editor__discard-row">
                        <DiscardPile
                            cards={editState.discard_pile}
                            isEditing={true}
                            scale={0.7}
                        />
                    </div>
                )}

                {/* ── Controls ── */}
                <HandEditorControls
                    mode={mode}
                    submitting={submitting}
                    validationErrors={validationErrors}
                    serverErrors={serverErrors}
                    onApply={onApply}
                    onPlayFromHere={onPlayFromHere}
                    onSave={onSave}
                    onSaveAsNew={onSaveAsNew}
                    onCancel={onCancel}
                />
            </div>

            {/* DragOverlay — ghost card while dragging */}
            <DragOverlay>
                {activeDrag?.card ? (
                    <Card
                        card={activeDrag.card}
                        scale={0.9}
                        isHidden={false}
                        isClickable={false}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default HandEditor;