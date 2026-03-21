import React from "react";
import DroppableSlot from "./DroppableSlot";
// import DroppableBoardSlot from "./DroppableBoardSlot";
import { useDroppable } from "@dnd-kit/core";
import "../css/BoardArea.css";

const BoardArea = ({ 
  cards,
  scale,
  showSlots,
  isActive=false,
  activeSlot, 
  onCardClick,
  onSlotClick, 
  onAreaClick,
  maxCards=5
 }) => {
  // Create array with empty slots
  const slots = Array.from({ length: maxCards }, (_, index) => 
    cards[index] || null
  );

  React.useEffect(() => {
    console.log("BoardArea droppable mounted: board-area");
  }, []);

  return (
    // <div className="board-area" onClick={onAreaClick}>

    <div
      className={`board-area ${isActive ? 'active' : ''}`}
      onClick={(e) => {
        // Detect clicks *not* on any child slot
        if (e.target === e.currentTarget) {
          onAreaClick();
        }
      }}
    >
      {slots.map((cardObj, index) => (
        <DroppableSlot
          key={index}
          index={index}
          variant={"board"}
          location={"main"}
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

export default BoardArea;
