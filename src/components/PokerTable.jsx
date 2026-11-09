import React, { useCallback, useMemo, useRef } from "react";
import PlayerSeat from "./PlayerSeat";
import CAPBoard from "./CAPBoard";
import { getLayout, maxCardWidth } from "../layouts/boardLayouts";
import { useFitCardWidth, TableMetricsProvider } from "../hooks/useFitCardWidth";
import "../css/PokerTable.css";

const NARROW_BELOW = 1.1; // container width / height

// Board region as a fraction of .poker-table.
// Wide: table-outer 100% x 85%, table-inner 75%, board-container 65% x 55%.
const WIDE_BOX = { w: 0.75 * 0.65, h: 0.85 * 0.75 * 0.55 };
// Narrow: board is the middle grid row; assume it gets ~38% of the height.
const NARROW_BOX = { w: 0.96, h: 0.38 };

const SEATS = [1, 2, 3, 4, 5, 6];
const HOLE_MAX = 50;   // shared cap (px) for hole cards on every page

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
  onSeatClick,
  onPlayerCardClick,
  onPlayerSlotClick,
  onBoardCardClick,
  onBoardSlotClick,
  onBoardAreaClick,
  loading,
  // ── Editor-mode props (all optional; no-op outside the editor) ──
  isEditing = false,
  holeCardCount = null,
  seatActive = null,           // { [seatNum]: bool } — creation mode only
  onToggleSeatActive,
  onNameChange,
  onStackChange,
  // Render unoccupied seats as nothing (Trainer). No effect while isEditing.
  hideEmptySeats = false,
  // Seat shown at the bottom in narrow (portrait) mode. Optional.
  heroSeat = null,
}) => {
  const boardNodes = nodes?.length
    ? nodes
    : (boardCards || []).map(c => (typeof c === 'object' && c != null ? c.card : c));

  const tableRef = useRef(null);
  const positions = getLayout(layoutName || "single_board").positions;
  const fit = useCallback((W, H) => {
    const box = W / H < NARROW_BELOW ? NARROW_BOX : WIDE_BOX;
    return maxCardWidth(positions, W * box.w, H * box.h);
  }, [positions]);

  const { cardW, width, height } = useFitCardWidth(tableRef, { fit, min: 18, max: 60 });
  const narrow = height > 0 && width / height < NARROW_BELOW;

  // Which seats to draw, and which one is "hero" (narrow mode only).
  const skipEmpty = !isEditing && (hideEmptySeats || narrow);
  const visible = SEATS.filter(s => !(skipEmpty && !players?.[s]));
  const hero = !narrow ? null
    : (heroSeat != null && visible.includes(heroSeat)) ? heroSeat
    : visible.includes(4) ? 4
    : visible[visible.length - 1] ?? null;
  const nOpp = Math.max(visible.length - (hero != null ? 1 : 0), 1);

  const metrics = useMemo(() => ({
    cardW,
    // Hole cards are smaller than board cards. In narrow mode, also shrink
    // them so the opponent/hero seat rows leave room for the board.
    holeScale: (() => {
      let holeW = Math.min(cardW, HOLE_MAX);
      if (narrow && height > 0) {
        const rows = Math.ceil(nOpp / 3) + (hero != null ? 1 : 0);
        const perRow = (height * 0.55) / Math.max(rows, 1);
        holeW = Math.min(holeW, (perRow - 44) / 1.4); // 44px ≈ name row + padding
      }
      return Math.max(18, holeW) / cardW;
    })(),    
    // Width a seat's hand may use before it fans/wraps.
    seatW: (seat) => {
      const share = narrow
        ? (seat === hero ? width * 0.96 : width / Math.min(nOpp, 3))
        : width * (seat === 1 || seat === 4 ? 0.4 : 0.22);
      return Math.max(80, share - 32);
    },
  }), [cardW, width, narrow, hero, nOpp]);

  const renderSeat = (seatNum) => {
    const isSeatActive = seatActive ? !!seatActive[seatNum] : true;
    return (
      <div
        key={seatNum}
        className={`seat seat-${seatNum} ${seatNum === actionSeat ? "border-4 border-yellow-400" : "border border-gray-500"} rounded-full p-2`}
      >
        <PlayerSeat
          seatNumber={seatNum}
          player={players?.[seatNum]}
          isActive={seatNum === actionSeat}
          activeSlot={activeTarget?.type === "player" && activeTarget.seat === seatNum ? activeTarget.slot : null}
          onCardClick={(cardIndex) => onPlayerCardClick(seatNum, cardIndex)}
          onSlotClick={(slotIndex) => onPlayerSlotClick(seatNum, slotIndex)}
          onSeatClick={() => onSeatClick(seatNum)}
          loading={loading}
          holeCardCount={holeCardCount}
          isEditing={isEditing}
          isSeatActive={isSeatActive}
          onToggleActive={onToggleSeatActive}
          onNameChange={onNameChange}
          onStackChange={onStackChange}
          hideEmptySeats={hideEmptySeats}
        />
      </div>
    );
  };

  return (
    <div className="poker-table-container" data-mode={narrow ? "narrow" : "wide"}>
      <div className="poker-table" ref={tableRef}>
        <TableMetricsProvider value={metrics}>
          <div className="table-outer">
            <div
              className={`table-inner ${activeTarget?.type === "board" ? "active" : ""}`}
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
              </div>
            </div>
          </div>

          <div className="table-opponents">
            {visible.filter(s => s !== hero).map(renderSeat)}
          </div>
          <div className="table-hero">
            {hero != null && renderSeat(hero)}
          </div>
        </TableMetricsProvider>
      </div>
    </div>
  );
};

export default PokerTable;