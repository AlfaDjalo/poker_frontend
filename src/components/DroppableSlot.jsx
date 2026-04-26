import React from "react";
import { useDroppable } from "@dnd-kit/core";
import Card from "./Card";
import DraggableCard from "./DraggableCard";

const DroppableSlot = ({
  index,
  cardObj,
  variant,
  location,
  scale,
  showSlots,
  activeSlot,
  onCardClick,
  onSlotClick
}) => {
  const normCard = typeof cardObj === 'string'
    ? { card: cardObj, selected: false, hidden: false }
    : cardObj;

  const { setNodeRef, isOver } = useDroppable({
    id: `${variant}-${location}-slot-${index}`,
    data: { 
      variant: variant,
      location: location,
      index: index 
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`${variant}-slot ${activeSlot === index ? 'active-slot' : ''} ${isOver ? 'hovered' : ''}`}
    >
      {normCard ? (
        <DraggableCard 
          id={normCard.card}
          source={{ variant, location, index }}
          onClick={() => onCardClick(index)}
        >
          <Card
            card={normCard ? normCard.card : null}
            scale={scale}
            isHidden={normCard?.hidden}
            isSelected={normCard?.selected}
            isActiveTarget={activeSlot === index}
            showOutline={showSlots}
            isClickable={true}
            onClick={(e) => {
              e.stopPropagation(); // prevent BoardArea click
              if (normCard) onCardClick(index);
              else onSlotClick(index);
            }}
          />
        </DraggableCard>
      ) : (
        <Card
          card={null}
          scale={scale}
          isActiveTarget={activeSlot === index}
          showOutline={showSlots}
          isClickable={true}
          onClick={(e) => {
            e.stopPropagation();
            onSlotClick(index);
          }}
        />
      )}
    </div>
  );
};

export default DroppableSlot;
