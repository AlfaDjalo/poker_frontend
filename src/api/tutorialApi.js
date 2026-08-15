const API_BASE_URL = "http://127.0.0.1:8000";

// ─────────────────────────────────────────────
// Tutorial / hypothetical hands  (/tutorial/hands)
// ─────────────────────────────────────────────

/**
 * Fetch list of hypothetical hands, optionally filtered by variant.
 */
export const fetchTutorialHands = async ({ limit = 50, offset = 0, variant = null } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (variant) params.append("variant", variant);
    const res = await fetch(`${API_BASE_URL}/tutorial/hands?${params}`);
    if (!res.ok) throw new Error("Failed to fetch tutorial hands");
    return res.json();
};

/**
 * Fetch a single hypothetical hand by id.
 */
export const fetchTutorialHand = async (handId) => {
    const res = await fetch(`${API_BASE_URL}/tutorial/hands/${handId}`);
    if (!res.ok) throw new Error(`Failed to fetch tutorial hand ${handId}`);
    return res.json();
};

/**
 * Save a newly created hypothetical hand.
 * @param {object} handData — fully described hand structure
 */
export const saveTutorialHand = async (handData) => {
    console.log("Hand data: ", handData);
    const res = await fetch(`${API_BASE_URL}/tutorial/hands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handData),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error("Failed to save tutorial hand"), { detail: err?.detail ?? null });
    }
    return res.json();
};

/**
 * Overwrite an existing hypothetical hand. (§3.5.4)
 */
export const updateTutorialHand = async (handId, handData) => {
    const res = await fetch(`${API_BASE_URL}/tutorial/hands/${handId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handData),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error("Failed to update tutorial hand"), { detail: err?.detail ?? null });
    }
    return res.json();
};

/**
 * Fetch a hypothetical hand decomposed into Creator-phase-indexed edit
 * state, for re-opening in the wizard. (§3.5.1)
 */
export const fetchTutorialHandEditState = async (handId) => {
    const res = await fetch(`${API_BASE_URL}/tutorial/hands/${handId}/edit-state`);
    if (!res.ok) throw new Error(`Failed to fetch edit-state for tutorial hand ${handId}`);
    return res.json();
};

/**
 * Delete a hypothetical hand.
 */
export const deleteTutorialHand = async (handId) => {
    const res = await fetch(`${API_BASE_URL}/tutorial/hands/${handId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete tutorial hand ${handId}`);
};

/**
 * Fetch variant list (reuse from replay API).
 */
export const fetchVariants = async () => {
    const res = await fetch(`${API_BASE_URL}/replay/variants`);
    if (!res.ok) throw new Error("Failed to fetch variants");
    return res.json();
};