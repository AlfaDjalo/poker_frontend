import React, { useRef, useState, useEffect } from "react";
import PokerCard from "./PokerCard";
import "../css/Board.css";

const Board = ({ cards = [], scaleFactor = 0.9 }) => {
  const containerRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(60);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current || cards.length === 0) return;

      const containerWidth = containerRef.current.offsetWidth;
      const n = cards.length;

      const newWidth = (containerWidth / n) * scaleFactor;

      setCardWidth(Math.min(newWidth, 100));
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [cards, scaleFactor]);

  return (
    <div className="board" ref={containerRef}>
      {cards.map((c, index) => (
        <PokerCard key={index} card={c.hidden ? "BACK" : c.card} width={cardWidth} />
      ))}
    </div>
  );
};

export default Board;
