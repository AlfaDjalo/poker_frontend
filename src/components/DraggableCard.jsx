import React, { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";

const DraggableCard = ({ id, source, children, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${id}-${source.type}-${source.index}`, // Make ID unique based on location
    data: { 
      card: id,
      variant: source.variant, // e.g., { type: 'hand', seat: 1, index: 0 }
      location: source.location, // e.g., { type: 'hand', seat: 1, index: 0 }
      index: source.index, // e.g., { type: 'hand', seat: 1, index: 0 }
      // source: source // e.g., { type: 'hand', seat: 1, index: 0 }
    },
  });

  const pointerStart = useRef(null);

  const handlePointerDownCapture = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerUpCapture = (e) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const dt = Date.now() - pointerStart.current.time;

    // Short + small movement = click
    if (distance < 5 && dt < 300 && onClick) {
      onClick(e);
    }

    pointerStart.current = null;
  };

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    display: "inline-block",
    zIndex: isDragging ? 1000 : "auto",  // <-- bring to front while dragging
    position: isDragging ? "relative" : "static", // relative so z-index works
  };

  console.log("DraggableCard: ", id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={handlePointerUpCapture}
    >
      {children}
    </div>
  );
};

export default DraggableCard;
