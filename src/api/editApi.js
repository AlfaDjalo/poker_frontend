const API_BASE_URL = "http://127.0.0.1:8000";

// ─────────────────────────────────────────────
// Live editing endpoints  (/game/edit/*)
// ─────────────────────────────────────────────

/**
 * Tell the backend we are entering edit mode.
 * The backend will delete all DB records for the current hand and
 * set editing_mode = true on GameService.
 * Returns the current game state snapshot so the frontend can
 * populate its local editState.
 */
export const beginEdit = async () => {
    const res = await fetch(`${API_BASE_URL}/game/edit/begin`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to begin edit");
    return res.json();
};

/**
 * Submit the edited state and resume the live game.
 * @param {EditStateRequest} editStateRequest
 */
export const applyEdit = async (editStateRequest) => {
    const res = await fetch(`${API_BASE_URL}/game/edit/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editStateRequest),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error("Failed to apply edit"), { detail: err?.detail ?? null });
    }
    return res.json();
};

/**
 * Load an arbitrary snapshot — used by Replayer → Game Simulator handoff.
 * @param {EditStateRequest} editStateRequest
 */
export const loadEdit = async (editStateRequest) => {
    const res = await fetch(`${API_BASE_URL}/game/edit/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editStateRequest),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error("Failed to load edit"), { detail: err?.detail ?? null });
    }
    return res.json();
};

/**
 * Cancel editing and restore the pre-edit in-memory snapshot.
 */
export const cancelEdit = async () => {
    const res = await fetch(`${API_BASE_URL}/game/edit/cancel`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to cancel edit");
    return res.json();
};

// ─────────────────────────────────────────────
// Helpers — build the EditStateRequest DTO
// ─────────────────────────────────────────────

/**
 * Build the EditStateRequest body from the hook's editState.
 *
 * editState shape:
 * {
 *   game_name: string,
 *   street_index: number,
 *   pot: number,
 *   dealer_position: number,   // 0-based
 *   current_player: number,    // 0-based engine index
 *   bet_to_call: number,
 *   min_raise: number,
 *   players: [
 *     { seat, stack, current_bet, total_contribution, has_folded, is_all_in, hole_cards }
 *   ],
 *   node_cards: (string|null)[],
 *   discard_pile: string[],
 * }
 */
export const buildEditRequest = (editState) => ({
    game_name: editState.game_name,
    street_index: editState.street_index,
    pot: editState.pot,
    dealer_position: editState.dealer_position,
    current_player: editState.current_player,
    bet_to_call: editState.bet_to_call,
    min_raise: editState.min_raise,
    players: editState.players.map(p => ({
        seat: p.seat,
        name: p.name,
        stack: p.stack,
        current_bet: p.current_bet,
        total_contribution: p.total_contribution,
        has_folded: p.has_folded,
        is_all_in: p.is_all_in,
        hole_cards: p.hole_cards,
    })),
    node_cards: editState.node_cards,
    discard_pile: editState.discard_pile,
});