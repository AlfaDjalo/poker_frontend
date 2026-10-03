const API_BASE_URL = "http://127.0.0.1:8000";

// ─────────────────────────────────────────────
// Hand Creator session stepper (/creator/*)
//
// Replaces the old creation_phases-driven wizard contract.
// creation_phases (from variantConfigApi.fetchVariantConfig) is now a
// read-only, always-graph-derived PREVIEW only — this module is what
// actually drives the wizard, one real GameGraph node at a time.
//
// See CAP_Technical_Quick_Reference.md §4.4.
// ─────────────────────────────────────────────

// Reads a FastAPI HTTPException's {detail: "..."} body when present, so
// error messages surfaced to the user are the real backend failure
// reason rather than a generic fallback. Same pattern as trainerApi.js.
async function _errorMessage(res, fallback) {
    try {
        const body = await res.json();
        if (body?.detail) return body.detail;
    } catch (_) {
        // response wasn't JSON — fall through to the generic message
    }
    return fallback;
}

/**
 * Start a new construction session.
 *
 * @param {object} params
 *   gameName        - string, variant name
 *   dealerSeat      - number (1-based, matches the rest of the wire contract)
 *   seats           - { [seat]: name } — which seats are active and their names
 *   initialStacks   - { [seat]: stack }
 * @returns {Promise<{session_id: string, step: ConstructionStepDTO}>}
 *   (or however the backend shapes session_id alongside the first step —
 *   callers should treat the response as { session_id, ...stepFields } OR
 *   { session_id, step }; see fetchConstructionState's identical shape.)
 */
export const startConstruction = async ({ gameName, dealerSeat, seats, initialStacks }) => {
    const res = await fetch(`${API_BASE_URL}/creator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            game_name: gameName,
            dealer_seat: dealerSeat,
            seats,
            initial_stacks: initialStacks,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(await _errorMessage(res, "Failed to start hand construction")), {
            detail: err?.detail ?? null,
        });
    }
    return res.json();
};

/**
 * Fetch the current pending step for an existing session — used on
 * reconnect/refresh so the wizard doesn't need to keep its own copy of
 * "what step are we on" as the source of truth.
 */
export const fetchConstructionState = async (sessionId) => {
    const res = await fetch(`${API_BASE_URL}/creator/${encodeURIComponent(sessionId)}/state`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch construction session state"));
    return res.json();
};

/**
 * Submit a ConstructionStepResponse for the current pending step.
 *
 * `stepResponse` should populate only the field matching the current
 * step's `domain`:
 *   DEAL_HOLE / DEAL_BOARD -> { cards: string[] }  (accept dealt cards
 *                              with [] / omitted, or override with an
 *                              explicit list)
 *   BETTING                -> { type: string, amount?: number }
 *   CARD_SELECT/CARD_PASS  -> { selected_cards: string[] }
 *   BOOLEAN                -> { bool_value: bool }
 *   CHOICE                 -> { choice: string }
 *
 * Returns the next ConstructionStepDTO (domain "COMPLETE" once the
 * graph has nothing left to review).
 */
export const submitConstructionStep = async (sessionId, stepResponse) => {
    const res = await fetch(`${API_BASE_URL}/creator/${encodeURIComponent(sessionId)}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stepResponse),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to submit construction step"), {
            detail: err?.detail ?? null,
        });
    }
    return res.json();
};

/**
 * Revert the last applied step. Returns the resulting (now-current)
 * ConstructionStepDTO — i.e. the step that was undone becomes pending
 * again.
 */
export const undoConstructionStep = async (sessionId) => {
    const res = await fetch(`${API_BASE_URL}/creator/${encodeURIComponent(sessionId)}/undo`, {
        method: "POST",
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to undo construction step"), {
            detail: err?.detail ?? null,
        });
    }
    return res.json();
};

/**
 * Persist the constructed hand and end the session. Response shape
 * matches POST /tutorial/hands (i.e. carries hand_id) since this
 * delegates straight to that same save path server-side.
 */
export const finishConstruction = async (sessionId) => {
    const res = await fetch(`${API_BASE_URL}/creator/${encodeURIComponent(sessionId)}/finish`, {
        method: "POST",
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to finish hand construction"), {
            detail: err?.detail ?? null,
        });
    }
    return res.json();
};

/**
 * Abandon the session without saving. Best-effort — callers generally
 * shouldn't block navigation on this succeeding.
 */
export const abandonConstruction = async (sessionId) => {
    const res = await fetch(`${API_BASE_URL}/creator/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
        throw new Error(await _errorMessage(res, "Failed to abandon construction session"));
    }
};