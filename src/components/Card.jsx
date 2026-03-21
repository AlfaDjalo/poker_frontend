import React from "react";
import "../css/Card.css";

const cardBaseURL = "https://deckofcardsapi.com/static/img";
const backCardURL = "https://deckofcardsapi.com/static/img/back.png";

const Card = ({ 
  card = null, 
  scale = 1.0, 
  isHidden = false, 
  isSelected = false,
  isActiveTarget = false,
  showOutline = false,
  isClickable = true, 
  onClick 
}) => {
  const normalizeForImage = (card) => {
    if (!card || card.length !== 2) return null;
    const rank = card[0] === "T" ? "0" : card[0];
    const suit = card[1].toUpperCase();
    return `${rank}${suit}`;
  };

  // Clamp scale to reasonable values
  const scaleFactor = Math.max(0.1, Math.min(3.0, Number(scale) || 1.0));

  // console.log("Card: ", card);

  if (!card) {
    return (
      <span
        className={`cardEmpty 
          ${showOutline ? "cardEmpty-outline" : ""} 
          ${isActiveTarget ? "card-target" : ""}`}
        style={{ transform: `scale(${scaleFactor})` }}
        onClick={onClick}
      />
    );
  }

  // If card is hidden, show card back
  if (isHidden) {
    return (
      <img
        src={backCardURL}
        alt="Hidden card"
        className={`card ${isSelected ? 'selected' : ''}`}
        onClick={isClickable ? onClick : undefined}
        style={{ 
          cursor: isClickable ? 'pointer' : 'default',
          transform: `scale(${scaleFactor})`
        }}
      />
    );
  }

  const apiCard = normalizeForImage(card);
  
  // Build class names properly
  // const classNames = `card ${isSelected ? 'selected' : ''}`;
  const classNames=`card 
    ${isSelected ? "selected" : ""} 
    ${isClickable ? "clickable" : ""} 
    ${isActiveTarget ? "card-target" : ""}`

  return (
    <img
      src={`${cardBaseURL}/${apiCard}.png`}
      alt={card}
      className={classNames}
      onClick={isClickable ? onClick : undefined}
      style={{ 
        cursor: isClickable ? 'pointer' : 'default',
        transform: `scale(${scaleFactor})`
      }}
    />
  );
};

export default Card;