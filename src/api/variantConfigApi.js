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
 *        board_layout: { nodes: number, streets: {[idx]: number[]}, street_names: {[idx]: string} },
 *        creation_phases: [
 *          { id, label, deals_hole, deals_board_street, allows_betting }
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
 * Returns { canDealHole, canDealBoardStreet (street idx|null), canBet }
 */
export const phaseCapabilities = (phase) => {
    if (!phase) return { canDealHole: false, canDealBoardStreet: null, canBet: false };
    return {
        canDealHole: !!phase.deals_hole,
        canDealBoardStreet: phase.deals_board_street ?? null,
        canBet: !!phase.allows_betting,
    };
};
 