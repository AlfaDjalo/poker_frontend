import React from "react";
import "../css/Hand.css";
import DroppableSlot from "./DroppableSlot";
import { useTableMetrics } from "../hooks/useFitCardWidth";

const MIN_VISIBLE = 0.4; // never hide more than 60% of a card

function layoutHand(count, cardW, availW) {
  if (count <= 1) return { perRow: Math.max(count, 1), step: cardW };
  const fitPerRow = Math.max(2, Math.floor(1 + (availW - cardW) / (MIN_VISIBLE * cardW)));
  const rows = Math.ceil(count / fitPerRow);
  const perRow = Math.ceil(count / rows);
  const step = Math.min(cardW, (availW - cardW) / (perRow - 1));
  return { perRow, step: Math.max(step, 0.2 * cardW) };
}

const Hand = ({
  seatNumber,
  cards,
  scale = 1,
  showSlots,
  activeSlot,
  onCardClick,
  onSlotClick,
  maxCards,
}) => {
  const { cardW, seatW } = useTableMetrics();
  const w = cardW * scale;
  const n = Math.max(maxCards ?? 0, 0);
  const { perRow, step } = layoutHand(n, w, seatW(seatNumber));
  const overlap = step - w; // <= 0

  const slots = Array.from({ length: n }, (_, i) => cards[i] || null);
  const rows = [];
  for (let i = 0; i < n; i += perRow) {
    rows.push(slots.slice(i, i + perRow).map((cardObj, col) => ({ cardObj, index: i + col, col })));
  }

  return (
    <div className={`hand ${overlap < 0 ? "hand--fan" : ""}`}>
      {rows.map((row, r) => (
        <div key={r} className="hand__row">
          {row.map(({ cardObj, index, col }) => (
            <div
              key={`hand-slot-${seatNumber}-${index}`}
              className="hand__slot-wrapper"
              style={{ marginLeft: col > 0 ? overlap : 0, zIndex: col }}
            >
              <DroppableSlot
                key={cardObj?.card || `slot-${seatNumber}-${index}`}
                index={index}
                variant="player"
                location={seatNumber}
                cardObj={cardObj}
                scale={scale}
                showSlots={showSlots}
                activeSlot={activeSlot}
                onCardClick={onCardClick}
                onSlotClick={onSlotClick}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Hand;