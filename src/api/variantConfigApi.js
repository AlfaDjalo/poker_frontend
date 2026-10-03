const API_BASE_URL = "http://127.0.0.1:8000";
 
/**
 * variantConfigApi
 *
 * Fetches the per-variant config block that lives in the variant's yaml
 * file on the backend (e.g. holdem.yaml, double_board_plo_bomb_pot.yaml).
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 *   - hole_cards            (number of hole card slots per player)
 *   - board_layout          (nodes, streets map, street_names, layout_name)
 *   - creation_phases       (ordered wizard steps for Hand Creation mode,
 *                            see HAND_EDITOR_DESIGN.md §3.2)
 *
 * The engine (Python) reads the same yaml directly. The frontend never
 * hardcodes phase lists or node counts — it always asks the backend.
 *
 * New backend endpoint required:
 *   GET /game/variants/{game_name}/config
 *   -> {
 *        game_name: string,
 *        layout_name: string,
 *        hole_cards: number,
 *        board_layout: {
 *          nodes: number,
 *          // Keyed by reveal_group now (NOT a variant-specific street
 *          // index) — see creation_phases[i].reveal_group below. Kept
 *          // around for anything that still wants a reveal_group ->
 *          // node-indices lookup, but creation_phases[i].board_node_indices
 *          // is the preferred source for a given phase's own nodes.
 *          streets: {[reveal_group]: number[]},
 *          // Also keyed by reveal_group.
 *          street_names: {[reveal_group]: string},
 *        },
 *        creation_phases: [
 *          {
 *            id, label, deals_hole, allows_betting,
 *            deals_board,          // bool — replaces the old
 *                                  // deals_board_street: int|null
 *            reveal_group,         // int — which board-reveal batch this
 *                                  // phase deals (only meaningful when
 *                                  // deals_board is true)
 *            board_node_indices,   // number[] — this phase's own board
 *                                  // node indices, straight from the
 *                                  // phase object (no more indirection
 *                                  // through board_layout.streets)
 *            decision_domain,      // string|null, e.g. "BETTING",
 *                                  // "CARD_SELECT", null for AUTO nodes.
 *                                  // Not yet consumed here — present for
 *                                  // forward-compat, ignore unrecognized
 *                                  // non-BETTING values rather than
 *                                  // erroring.
 *          }
 *        ],
 *      }
 *
 * Implementation note for the backend: this can be a thin wrapper that
 * loads the variant's yaml (already parsed for engine use) and returns
 * the subset of fields above — no new config storage needed.
 */
 
const _cache = new Map();

export const fetchVariantConfig = async (gameName, { force = false } = {}) => {
    if (!gameName) return null;
    if (!force && _cache.has(gameName)) return _cache.get(gameName);

    const res = await fetch(`${API_BASE_URL}/game/variants/${encodeURIComponent(gameName)}/config`);
    if (!res.ok) throw new Error(`Failed to fetch config for variant ${gameName}`);
    const data = await res.json();
    _cache.set(gameName, data);
    return data;
};

export const clearVariantConfigCache = (gameName = null) => {
    if (gameName) _cache.delete(gameName);
}


/**
 * Convenience: derive the legal-action set for a given creation phase.
 * Returns { canDealHole, canDealBoard, revealGroup, boardNodeIndices, canBet }
 *
 * revealGroup / boardNodeIndices are only meaningful when canDealBoard is
 * true — kept null/[] otherwise rather than a stale leftover value, same
 * as the old canDealBoardStreet's null-when-inapplicable convention.
 */
export const phaseCapabilities = (phase) => {
    if (!phase) {
        return { canDealHole: false, canDealBoard: false, revealGroup: null, boardNodeIndices: [], canBet: false };
    }
    const canDealBoard = !!phase.deals_board;
    return {
        canDealHole: !!phase.deals_hole,
        canDealBoard,
        revealGroup: canDealBoard ? (phase.reveal_group ?? null) : null,
        boardNodeIndices: canDealBoard ? (phase.board_node_indices ?? []) : [],
        canBet: !!phase.allows_betting,
    };
};