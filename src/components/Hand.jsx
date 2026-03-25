import React from "react";
// import Card from "./Card";
import "../css/Hand.css";
import DroppableSlot from "./DroppableSlot";
// import { useDroppable } from "@dnd-kit/core";

const Hand = ({ 
  seatNumber,
  cards, 
  scale, 
  showSlots, 
  activeSlot, 
  onCardClick, 
  onSlotClick, 
  maxCards
}) => {
  // Create array with empty slots
  const slots = Array.from({ length: maxCards }, (_, index) => 
    cards[index] || null
  );

  // const { setNodeRef: setHandAreaRef, isOver: isOverHandArea } = useDroppable({
  //   id: `player-${seatNumber}-hand-area`,    
  //   data: "player-hand-area",
  //   // data: { type: "board-area" },
  // });

  console.log("Hand: ", cards);

  return (
    <div
      className="hand"
    >
      {slots.map((cardObj, index) => (
        <DroppableSlot
        // <DroppableBoardSlot
          key={cardObj?.card || `slot-${seatNumber}-${index}`}
          index={index}
          variant={"player"}
          location={seatNumber}
          cardObj={cardObj}
          scale={scale}
          showSlots={showSlots}
          activeSlot={activeSlot}
          onCardClick={onCardClick}
          onSlotClick={onSlotClick}
        />
      ))}
    </div>
  );
};

export default Hand;