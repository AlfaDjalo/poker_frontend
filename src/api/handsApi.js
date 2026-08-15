const API_BASE_URL = "http://127.0.0.1:8000";

// ─────────────────────────────────────────────
// Unified hand list — real + hypothetical
// (see HAND_EDITOR_DESIGN.md §7.5)
// ─────────────────────────────────────────────

/**
 * fetchAllHands
 *
 * @param {object} opts
 *   limit    - page size (default 20)
 *   offset   - page offset
 *   variant  - optional variant filter
 *   source   - "all" | "real" | "hypothetical"  (default "all")
 */
export const fetchAllHands = async ({ limit = 20, offset = 0, variant = null, source = "all" } = {}) => {
    const params = new URLSearchParams({ limit, offset, source });
    if (variant) params.append("variant", variant);
    const res = await fetch(`${API_BASE_URL}/hands?${params}`);
    if (!res.ok) throw new Error("Failed to fetch hands");
    return res.json();
};

export const deleteTutorialHand = async (handId) => {
    const res = await fetch(`${API_BASE_URL}/tutorial/hands/${handId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete tutorial hand ${handId}`);
};

export const fetchVariants = async () => {
    const res = await fetch(`${API_BASE_URL}/replay/variants`);
    if (!res.ok) throw new Error("Failed to fetch variants");
    return res.json();
};