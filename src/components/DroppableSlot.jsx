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
  const { setNodeRef, isOver } = useDroppable({
    id: `${variant}-${location}-slot-${index}`,
    data: { 
      variant: variant,
      location: location,
      index: index 
    }
  });

  // React.useEffect(() => {
  //   console.log(`DroppableSlot mounted: ${variant}-slot-${index}`);
  // }, [index]);

  console.log("CardObj: ", cardObj);

  return (
    <div
      ref={setNodeRef}
      className={`${variant}-slot ${activeSlot === index ? 'active-slot' : ''} ${isOver ? 'hovered' : ''}`}
    >
      {cardObj ? (
        <DraggableCard 
          id={cardObj.card}
          source={{ variant, location, index }}
          onClick={() => onCardClick(index)}
        >
          <Card
            card={cardObj ? cardObj.card : null}
            scale={scale}
            isHidden={cardObj?.hidden}
            isSelected={cardObj?.selected}
            isActiveTarget={activeSlot === index}
            showOutline={showSlots}
            isClickable={true}
            // onClick={() => (cardObj ? onCardClick(index) : onSlotClick(index))}
            onClick={(e) => {
              e.stopPropagation(); // prevent BoardArea click
              if (cardObj) onCardClick(index);
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
