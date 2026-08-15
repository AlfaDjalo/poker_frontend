import React, { useState, useEffect } from "react";
import "../css/PlayerSeat.css";
import Hand from "./Hand";
import EditableStack from "./EditableStack";

/**
 * PlayerSeat
 *
 * Props (all optional — default behaviour unchanged outside edit mode):
 *   holeCardCount  — number of hole-card slots to render. Defaults to
 *                    player.hand.length (old behaviour) so non-editor call
 *                    sites are unaffected. In edit mode this should come
 *                    from the variant config (game_def.hole_cards) so empty
 *                    slots are visible to drop cards into.
 *   isEditing      — bool. When true: name becomes an editable text input,
 *                    stack becomes an editable number input (via
 *                    EditableStack), and Hand always shows its slots
 *                    regardless of fold state.
 *   isActive       — bool. Only meaningful when isEditing. Whether this seat
 *                    is participating in the hand being created. Inactive
 *                    seats render as an "Empty Seat" placeholder with a
 *                    button to activate them; active seats show full card
 *                    slots and name/stack inputs.
 *   onToggleActive — (seat) => void. Called when the user clicks the
 *                    activate/deactivate control (edit mode only).
 *   onNameChange   — (seat, name) => void
 *   onStackChange  — (seat, amount) => void
 *   hideEmptySeats — bool. When true AND not isEditing: a seat with no
 *                    `player` renders nothing at all (not even the
 *                    "Empty Seat" placeholder) — for table layouts like
 *                    the Trainer's, which only ever populate 2 of 6
 *                    seats and don't want the other 4 visually present.
 *                    Has no effect in edit mode, where an empty/inactive
 *                    seat's placeholder is the actual "add a player"
 *                    affordance and must stay visible.
 */
const PlayerSeat = ({ 
  seatNumber, 
  player, 
  isActive: isActiveTarget, 
  activeSlot,
  onCardClick,
  onSlotClick, 
  onSeatClick,
  loading = false,
  holeCardCount = null,
  isEditing = false,
  isSeatActive = true,
  onToggleActive,
  onNameChange,
  onStackChange,
  hideEmptySeats = false,
}) => {

  const [draftName, setDraftName] = useState(player?.name ?? "");

  useEffect(() => {
    setDraftName(player?.name ?? "");
  }, [player?.name]);

  const handleSeatClick = (e) => {
    // Only trigger seat click if not clicking on cards or slots
    if (e.target.closest('.hand') || e.target.closest('.card') || e.target.closest('input')  || e.target.closest('button')) return;
    onSeatClick?.();
  };

  const handleNameBlur = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== player?.name) {
      onNameChange?.(seatNumber, trimmed);
    } else {
      setDraftName(player?.name ?? "");
    }
  }

  // Outside edit mode, a seat with no player is either the "Empty
  // Seat" placeholder (default) or fully invisible (hideEmptySeats) —
  // e.g. the Trainer only ever populates 2 of 6 seats and doesn't want
  // the other 4 rendered at all.
  if (!isEditing && !player) {
    if (hideEmptySeats) return null;
    return (
      <div className="player-seat" onClick={handleSeatClick}>
        <div className="player-info empty-seat">Empty Seat</div>
      </div>
    );
  }

  // In edit mode, an inactive seat is shown as a dedicated "empty" state
  // with a button to activate it — no card slots, no inputs. Always
  // visible regardless of hideEmptySeats (see prop docstring above).
  if (isEditing && !isSeatActive) {
    return (
      <div
        className="player-seat edit-mode player-seat--inactive"
        onClick={handleSeatClick}
      >
        <div className="player-info empty-seat">Empty Seat</div>
        {onToggleActive && (
          <button
            type="button"
            className="player-seat__activate-btn"
            onClick={(e) => { e.stopPropagation(); onToggleActive(seatNumber); }}
          >
            + Add Player
          </button>
        )}
      </div>
    );
  }

  const effectivePlayer = isEditing 
    ? (player ?? { seat: seatNumber, name: `Player ${seatNumber}`, stack: 0, hand: [] })
    : player;
  const maxCards = holeCardCount ?? (effectivePlayer?.hand?.length ?? 0);

  return (

    <div
      className={[
        "player-seat",
        isActiveTarget ? "active-target" : "",
        effectivePlayer?.folded ? "folded" : "",
        isEditing ? "edit-mode" : "",
      ].filter(Boolean).join(" ")}
      onClick={handleSeatClick}
    >
      {effectivePlayer ? (
        <>
          <div className="player-info">
            {isEditing ? (
              <input
                className="player-name-input"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                placeholder={`Player ${seatNumber}`}
                />
            ) : (
              <span className="player-name">{effectivePlayer.name}</span>
            )}

            {isEditing ? (
              <EditableStack
                stack={effectivePlayer.stack}
                isEditing={true}
                onChange={(amount) => onStackChange?.(seatNumber, amount)}
              />
            ) : (
              <span className="player-stack">${effectivePlayer.stack}</span>
            )}
          </div>

          <Hand 
            seatNumber={seatNumber}
            cards={effectivePlayer.hand}
            showSlots={true}
            activeSlot={activeSlot}
            onCardClick={onCardClick}
            onSlotClick={onSlotClick}
            maxCards={maxCards}
          />

          {!loading && effectivePlayer.equity !== undefined && (
            <div className="player-equity">
              Equity: {effectivePlayer.equity.toFixed(1)}%
            </div>
          )}

          {isEditing && onToggleActive && (
            <button
              type="button"
              className="player-seat__deactivate-btn"
              onClick={(e) => { e.stopPropagation(); onToggleActive?.(seatNumber); }}
            >
              − Remove
            </button>
          )}

        </>
      ) : (
        <div className="player-info empty-seat">Empty Seat</div>
      )}
    </div>
  );
};

export default PlayerSeat;