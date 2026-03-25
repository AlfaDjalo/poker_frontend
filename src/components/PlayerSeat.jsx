import React from "react";
import "../css/PlayerSeat.css";
import Hand from "./Hand";
import { useDroppable } from "@dnd-kit/core";

const PlayerSeat = ({ 
  seatNumber, 
  player, 
  isActive, 
  activeSlot,
  onCardClick,
  onSlotClick, 
  onSeatClick,
  loading = false
}) => {
  
  const handleSeatClick = (e) => {
    // Only trigger seat click if not clicking on cards or slots
    if (e.target.closest('.hand') || e.target.closest('.card')) return;
    onSeatClick();
  };

  return (

    <div
      className={`player-seat 
        ${isActive ? 'active-target' : ''}
        ${player?.folded ? 'folded' : ''}
      `}
      // className={`player-seat ${isActive ? 'active-target' : ''} ${isOverHandArea ? "hovered" : ""}`}
      onClick={handleSeatClick}
      // ref={setHandAreaRef}
    >
      {player ? (
        <>
          <div className="player-info">
            <span className="player-name">{player.name}</span>
            <span className="player-stack">${player.stack}</span>
          </div>
          {console.log(player.hand)}
          <Hand 
            seatNumber={seatNumber}
            cards={player.hand}
            scale={1}
            showSlots={true}
            activeSlot={activeSlot}
            onCardClick={onCardClick}
            onSlotClick={onSlotClick}
            maxCards={player.hand.length}
          />
          {/* {console.log("Rendering PlayerSeat", seatNumber, player)} */}

          {!loading && player.equity !== undefined && (
            <div className="player-equity">
              Equity: {player.equity.toFixed(1)}%
            </div>
          )}

          {/* {player.equity !== undefined && (
            <div className="player-equity">
              Equity: {player.equity.toFixed(1)}%
            </div>
          )} */}
        </>
      ) : (
        <div className="player-info empty-seat">Empty Seat</div>
      )}
    </div>
  );
};

export default PlayerSeat;
