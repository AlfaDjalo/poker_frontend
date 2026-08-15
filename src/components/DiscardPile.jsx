import React from "react";
import { useDroppable } from "@dnd-kit/core";
import DraggableCard from "./DraggableCard";
import Card from "./Card";
import "../css/DiscardPile.css";

/**
 * DiscardPile
 *
 * A drop target that shows all cards currently in the discard pile.
 * In edit mode, cards can be dragged out to another zone.
 * Face-down outside edit mode; face-up when isEditing is true.
 *
 * Props:
 *   cards      — string[] of card codes in the discard pile
 *   isEditing  — bool
 *   scale      — card scale factor (default 0.7)
 */
const DiscardPile = ({ cards = [], isEditing = false, scale = 0.7 }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: "discard-pile",
        data: { zone: "discard" },
    });

    return (
        <div
            ref={setNodeRef}
            className={`discard-pile ${isOver ? "discard-pile--over" : ""} ${isEditing ? "discard-pile--editing" : ""}`}
        >
            <div className="discard-pile__label">
                Discard{cards.length > 0 ? ` (${cards.length})` : ""}
            </div>

            <div className="discard-pile__cards">
                {cards.length === 0 ? (
                    <div className="discard-pile__empty">—</div>
                ) : (
                    cards.map((card, idx) =>
                        isEditing ? (
                            <DraggableCard
                                key={card}
                                id={card}
                                source={{ variant: "discard", location: "discard", index: idx }}
                            >
                                <Card
                                    card={card}
                                    scale={scale}
                                    isHidden={false}
                                    isSelected={false}
                                    isClickable={false}
                                    showOutline={false}
                                />
                            </DraggableCard>
                        ) : (
                            // Face-down when not editing
                            <Card
                                key={idx}
                                card={null}
                                scale={scale}
                                isHidden={true}
                                showOutline={false}
                            />
                        )
                    )
                )}
            </div>
        </div>
    );
};

export default DiscardPile;