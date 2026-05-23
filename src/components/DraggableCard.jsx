import React, { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";

const DraggableCard = ({ id, source, children, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${id}-${source.variant ?? 'card'}-${source.location ?? 'x'}-${source.index ?? 0}`, // Make ID unique based on location
    data: { 
      card: id,
      variant: source.variant, // e.g., { type: 'hand', seat: 1, index: 0 }
      location: source.location, // e.g., { type: 'hand', seat: 1, index: 0 }
      index: source.index, // e.g., { type: 'hand', seat: 1, index: 0 }
    },
  });

  const didDrag = useRef(false);

  const handlePointerDown = () => {
    didDrag.current = false;
  };

  React.useEffect(() => {
    if (isDragging) didDrag.current = true;
  }, [isDragging]);

  const handleClick = (e) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    onClick?.(e);
  }

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    display: "inline-block",
    zIndex: isDragging ? 1000 : "auto",  // <-- bring to front while dragging
    position: isDragging ? "relative" : "static", // relative so z-index works
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDownCapture={handlePointerDown}
      onPointerUpCapture={handleClick}
    >
      {children}
    </div>
  );
};

export default DraggableCard;
