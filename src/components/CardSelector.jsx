import React, { useState } from "react";
import Card from "./Card";
import "../css/Card.css";
import "../css/CardSelector.css";
import DraggableCard from "./DraggableCard";
import { useDroppable } from "@dnd-kit/core";

const CardSelector = ({ onSelectCard, usedCards = [] }) => {
  // Generate a standard 52-card deck grouped by suit
  const suits = ["S", "H", "D", "C"]; // Spades, Hearts, Diamonds, Clubs
  const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

  const generateDeck = () => {
    return suits.map((suit) =>
      ranks.map((rank) => `${rank}${suit}`)
    );
  };

  const deck = generateDeck();

  const handleCardClick = (card) => {
    if (!usedCards.includes(card)) {
      onSelectCard(card); // push selection back up
    }
  };

  // Render one suit row
  const renderSuit = (suitCards, suitIndex) => (
    <div key={suitIndex} className="suitRow">
      {suitCards.map((card) => (
        <div key={card}>
          {usedCards.includes(card) ? (
            <div
              className="poker-card-placeholder" 
              style={{ transform: "scale(0.8)" }}
            />
          ) : (
            <DraggableCard 
              id={card}
              source={{ variant: 'selector' }}
              // source={{ type: 'selector' }}
              onClick={() => handleCardClick(card)}  // click works again
            >
              <Card
                card={card}
                scale={0.8}
                isHidden={false}
                isSelected={false}
                isClickable={false}  // disable internal click, we use wrapper now
                showOutline={true}
              />
            </DraggableCard>
          )}
        </div>
      ))}
    </div>
  );

  const { setNodeRef, isOver } = useDroppable({
    id: "card-selector",
    data: { variant: "selector" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`card-selector ${isOver ? "hovered" : ""}`}
    >
      <h2>Select Cards from Deck</h2>
      <div className="deckGrid">
        {deck.map((suitCards, suitIndex) => renderSuit(suitCards, suitIndex))}
      </div>
    </div>
  );
};

export default CardSelector;
