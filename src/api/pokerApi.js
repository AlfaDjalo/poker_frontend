const API_BASE_URL = "http://127.0.0.1:8000"

function wrapCards(cardStrings) {
    return (cardStrings || []).map(card => ({
        card,
        hidden: false,
        selected: false
    }));
}

function normalizePlayers(playersArray) {
    const bySeat = {};
    (playersArray || []).forEach(p => {
        bySeat[p.seat] = {
            ...p,
            hand: wrapCards(p.hand || [])
        };
    });
    return bySeat;
}

/**
 * Derive the legacy-shaped convenience fields the frontend used to get
 * flat off GameStateDTO (phase / available_actions / to_call / min_raise /
 * max_raise) from the new GraphEngine `decision` object.
 *
 * decision is null when there's nothing pending (hand complete / between
 * hands) — see BACKEND_MIGRATION note "GameStateDTO shape changed for
 * /game/* routes".
 */
function deriveDecisionFields(rawHand) {
    const decision = rawHand.decision ?? null;
    // Case-insensitive compare — defensive against any casing drift in
    // decision.domain across engine paths during the GraphEngine
    // migration (spec says "BETTING", but don't let a stray lowercase
    // response silently hide the whole action panel).
    const isBetting = typeof decision?.domain === "string"
        && decision.domain.toUpperCase() === "BETTING";
    const isHandComplete = !!rawHand.hand_complete;

    const options = decision?.options ?? [];
    const availableActions = options.map(o => o.action_name);

    // Bet/raise-shaped option, if any — carries the real min/max for sizing.
    const betOption = options.find(
        o => o.action_name === "bet" || o.action_name === "raise"
    );

    return {
        decision,
        isBetting,
        isHandComplete,
        availableActions,
        toCall: decision?.to_call ?? null,
        minRaise: decision?.min_raise ?? betOption?.min_amount ?? null,
        maxRaise: decision?.max_raise ?? betOption?.max_amount ?? null,
        // Legacy-shaped "phase" string for any UI still branching on it —
        // derived, not sent by the backend anymore.
        phase: isHandComplete
            ? "HAND_COMPLETE"
            : isBetting
                ? "BETTING"
                : (decision ? decision.domain : "SHOWDOWN"),
    };
}

function formatHandData(rawHand) {
    return {
        ...rawHand,
        ...deriveDecisionFields(rawHand),
        board: wrapCards(rawHand.board || []),
        nodes: wrapCards(rawHand.nodes || []),
        points: rawHand.point || rawHand.points || [],
        layout_name: rawHand.layout_name || null,
        game_name: rawHand.game_name || null,
        street_names: rawHand.street_names || null,
        players: normalizePlayers(rawHand.players || []),
    };
}

// Fetches the current authoritative game state without submitting any
// action — used to resync the frontend after a submit that may have
// failed AFTER the engine already advanced (e.g. the last player's
// CARD_PASS: the backend can 500 on-distribution while the engine has
// already moved past the CARD_PASS node internally). GET /game/state
// is assumed to mirror the same GameStateDTO shape /game/action
// returns, so it goes through the same formatHandData normalization.
export const fetchGameState = async () => {
    const response = await fetch(`${API_BASE_URL}/game/state`);
    if (!response.ok) throw new Error('Failed to fetch game state');
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const getVariants = async () => {
    const response = await fetch(`${API_BASE_URL}/game/variants`);
    if (!response.ok) throw new Error('Failed to fetch variants');
    return response.json();
}

export const selectGame = async (gameName) => {
    const response = await fetch(`${API_BASE_URL}/game/select-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName })
    });
    if (!response.ok) throw new Error('Failed to select game variant');
    return response.json();
};

export const startNewHand = async (gameName = null) => {
    const response = await fetch(`${API_BASE_URL}/game/new-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName }),
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const restart = async (gameName = null) => {
    const response = await fetch(`${API_BASE_URL}/game/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName })
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const sendAction = async(type, amount = null) => {
    const response = await fetch(`${API_BASE_URL}/game/action`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ type, amount })
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const rawHand = await response.json();
    return formatHandData(rawHand);
};

// CARD_SELECT domain (e.g. drawmaha's discard/draw step) — per
// ActionRequest's per-domain field mapping in game_api.py, this domain
// takes `selected_cards` instead of `type`/`amount`.
export const sendCardSelectAction = async (selectedCards) => {
    const response = await fetch(`${API_BASE_URL}/game/action`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ selected_cards: selectedCards })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to submit card selection"), { detail: err?.detail ?? null });
    }

    const rawHand = await response.json();
    return formatHandData(rawHand);
};

// ─── Additions to pokerApi.js ───

// BOOLEAN domain (e.g. Grinch's "Christmas next street?" prompt) —
// per ActionRequest's per-domain field mapping, this domain takes a
// `bool_value` instead of `type`/`amount` or `selected_cards`.
export const sendBooleanAction = async (boolValue) => {
    const response = await fetch(`${API_BASE_URL}/game/action`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ bool_value: boolValue })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to submit decision"), { detail: err?.detail ?? null });
    }

    const rawHand = await response.json();
    return formatHandData(rawHand);
};

// CARD_PASS domain (e.g. Pass the Trash) — wire-identical to
// CARD_SELECT (`selected_cards`), the target seat is resolved
// server-side (see CAP_Technical_Document.md §2.9.6), never chosen by
// the caller. Exported under its own name for call-site clarity even
// though the body is the same request as sendCardSelectAction; note
// passed cards will NOT appear in anyone's hand in the response until
// every eligible player has submitted — that's expected, not a bug,
// see CardSelectPanel's CARD_PASS usage in GameSimulator.
export const sendCardPassAction = async (selectedCards) => {
    const response = await fetch(`${API_BASE_URL}/game/action`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ selected_cards: selectedCards })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw Object.assign(new Error(err?.detail ?? "Failed to submit card pass"), { detail: err?.detail ?? null });
    }

    const rawHand = await response.json();
    return formatHandData(rawHand);
};