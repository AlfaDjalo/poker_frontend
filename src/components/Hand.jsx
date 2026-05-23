import React from "react";
import "../css/Hand.css";
import DroppableSlot from "./DroppableSlot";

/**
 * handLayout — returns the card scale and per-card overlap offset.
 *
 * The card base width is 50px (from Card.css).
 * overlap is the negative margin-left applied from the 2nd card onward,
 * computed so the total hand width fits a seat that is ~160px wide.
 *
 * Target max hand width ≈ 160px:
 *   visible_width = cardW + (count-1) * (cardW + overlap)
 *   where cardW = 50 * scale
 *
 *  count  scale  overlap   approx total
 *  1–4    1.00     0        50–200px  (no overlap needed, ≤4 fits fine)
 *  5      0.90   -14px      ~172px
 *  6      0.85   -16px      ~172px
 *  7      0.80   -18px      ~168px
 *  8      0.75   -20px      ~160px
 *  9      0.70   -22px      ~158px
 *  10     0.65   -22px      ~149px
 *  11+    0.60   -22px      ~138px
 */
function handLayout(count) {
  if (count <= 4) return { scale: 1.00, overlap: 0 };
  if (count === 5) return { scale: 0.90, overlap: -14 };
  if (count === 6) return { scale: 0.85, overlap: -16 };
  if (count === 7) return { scale: 0.80, overlap: -18 };
  if (count === 8) return { scale: 0.75, overlap: -20 };
  if (count === 9) return { scale: 0.70, overlap: -22 };
  if (count === 10) return { scale: 0.65, overlap: -22 };
  return { scale: 0.60, overlap: -22 };
}

const Hand = ({ 
  seatNumber,
  cards, 
  scale: scaleProp = 1, 
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

  const { scale: autoScale, overlap } = handLayout(maxCards);
  const finalScale = autoScale * scaleProp;
  const shouldOverlap = overlap < 0;

  return (
    <div className={`hand ${shouldOverlap ? "hand--fan" : ""}`}>
      {slots.map((cardObj, index) => (
        <div
          key={cardObj?.card || `slot-${seatNumber}-${index}`}
          className="hand__slot-wrapper"
          style={
            shouldOverlap && index > 0
            ? { marginLeft: overlap }
            : undefined
          }
        >
          <DroppableSlot
          // <DroppableBoardSlot
            key={cardObj?.card || `slot-${seatNumber}-${index}`}
            index={index}
            variant="player"
            location={seatNumber}
            cardObj={cardObj}
            scale={finalScale}
            showSlots={showSlots}
            activeSlot={activeSlot}
            onCardClick={onCardClick}
            onSlotClick={onSlotClick}
          />
        </div>
      ))}
    </div>
  );
};

export default Hand;