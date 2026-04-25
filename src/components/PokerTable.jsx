import React, { useState } from "react";
import PlayerSeat from "./PlayerSeat";
import CAPBoard from "./CAPBoard";
// import BoardArea from "./BoardArea";
import "../css/PokerTable.css";
import { useDroppable } from "@dnd-kit/core";

const PokerTable = ({ 
  players,
  boardCards,
  nodes,
  layoutName,
  points,
  showdown,
  dealerSeat,
  activeTarget,
  actionSeat,
  // actionSeat=1,
  onSeatClick,
  onPlayerCardClick,
  onPlayerSlotClick,
  onBoardCardClick,
  onBoardSlotClick,
  onBoardAreaClick,
  loading
}) => {
  const boardNodes = nodes?.length ? nodes : (boardCards || []);
  // const boardNodes = nodes?.length
  //   ? nodes
  //   : (boardCards || []).map(c => c?.card ?? null);

  // console.log("BoardCards: ", boardCards)
  console.log("Nodes: ", nodes)
  console.log("BoardNodes: ", boardNodes)
  console.log("LayoutName: ", layoutName)
  // console.log("Players: ", players)

  return (
    <div className="poker-table-container">
      <div className="poker-table">
        {/* Outer ellipse - green felt */}
        <div className="table-outer">
          {/* Inner ellipse - betting line */}
          <div
            // ref={setNodeRef}
            className={`table-inner ${activeTarget?.type === "board" ? "active" : ""}`}
            // className={`table-inner ${isOver ? "hovered" : ""} ${
            //   activeTarget?.type === "board" ? "active" : ""
            // }`}
            onClick={onBoardAreaClick}
          >
            <div className="board-container cap-board-wrapper">
                <CAPBoard
                  nodes={boardNodes}
                  layoutName={layoutName || "single_board"}
                  points={points || []}
                  showdown={showdown}
                  onNodeClick={onBoardCardClick}
                  onNodeSlotClick={onBoardSlotClick}
                />
              {/* <BoardArea
                cards={boardCards}
                scale={1.0}
                showSlots={true}
                activeSlot={activeTarget?.type === "board" ? activeTarget.slot : null}
                onSlotClick={onBoardSlotClick}
                onCardClick={onBoardCardClick}
                onAreaClick={onBoardAreaClick}
                maxCards={5}
              /> */}
            </div>
          </div>
        </div>

        {Array.from({ length: 6 }, (_, i) => {
          const seatNum = i + 1;
          return (
            <div 
              key={seatNum}
              className={`seat seat-${seatNum} ${seatNum === actionSeat ? "border-4 border-yellow-400" : "border border-gray-500"} rounded-full p-2`}
            >
              <PlayerSeat
                // key={seatNum}
                seatNumber={seatNum}
                player={players[seatNum]}
                isActive={seatNum === actionSeat}
                // isActive={activeTarget?.type === "player" && actionSeat === seatNum}
                // isActive={activeTarget?.type === "player" && activeTarget.seat === seatNum}
                activeSlot={activeTarget?.type === "player" && activeTarget.seat === seatNum ? activeTarget.slot : null}
                onCardClick={(cardIndex) => onPlayerCardClick(seatNum, cardIndex)}
                onSlotClick={(slotIndex) => onPlayerSlotClick(seatNum, slotIndex)}
                onSeatClick={() => onSeatClick(seatNum)}
                loading={loading}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PokerTable;
