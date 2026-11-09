import { formatHandData } from "./pokerApi";
import { request, qs, ApiError, withToken, WS_BASE_URL } from "./authApi";

// Re-exported so existing `import { ApiError } from "../api/tableApi"` keeps working.
export { ApiError };

// Placeholder card code for a hidden (null) card. Card.jsx draws the back
// when isHidden is true and the code is a 2-char string.
export const HIDDEN_CARD = "XX";


// ─────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────

// pick_deadline / rebuy_deadline arrive as UTC ISO WITHOUT "Z".
export function parseDeadline(iso) {
    if (!iso) return null;
    const s = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
}

export function secondsLeft(iso, now = Date.now()) {
    const t = parseDeadline(iso);
    return t == null ? null : Math.max(0, Math.ceil((t - now) / 1000));
}

// ─────────────────────────────────────────────
// State normalisation
// ─────────────────────────────────────────────

const showHidden = (entry) => {
    if (!entry) return entry;
    if (entry.card == null) return { card: HIDDEN_CARD, hidden: true, selected: false };
    return entry;
};

/**
 * Run the raw hand through the existing formatHandData, then turn null
 * (hidden) cards into face-down placeholders. Array lengths are preserved.
 * `hand.players` becomes a map keyed by TABLE seat.
 */
export function normalizeTableState(raw) {
    if (!raw) return raw;
    let hand = null;
    if (raw.hand) {
        hand = formatHandData(raw.hand);
        hand = {
            ...hand,
            nodes: (hand.nodes || []).map(showHidden),
            board: (hand.board || []).map(showHidden),
            players: Object.fromEntries(
                Object.entries(hand.players || {}).map(([seat, p]) => [
                    seat,
                    { ...p, hand: (p.hand || []).map(showHidden) },
                ])
            ),
        };
    }
    return { ...raw, hand };
}

const N = normalizeTableState;

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

export const getRecordingSetting = () => request("GET", "/settings/recording");
export const setRecordingSetting = (enabled) => request("PUT", "/settings/recording", { enabled });

// ─────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────

export const listPlayers = ({ q, includeBots = true, limit = 100, offset = 0 } = {}) =>
    request("GET", `/players${qs({ q, include_bots: includeBots, limit, offset })}`);

export const createPlayer = ({ name, isBot = false, avatar = null, startingBankroll = 10000 }) =>
    request("POST", "/players", {
        name,
        is_bot: isBot,
        avatar,
        starting_bankroll: startingBankroll,
    });

export const getPlayer = (id) => request("GET", `/players/${id}`);
export const getBankroll = (id, limit = 20) =>
    request("GET", `/players/${id}/bankroll${qs({ limit })}`);

// ─────────────────────────────────────────────
// Variants
// ─────────────────────────────────────────────

export const listVariantNames = async () => (await request("GET", "/game/variants")).variants;
export const getVariantOptions = (name) =>
    request("GET", `/variants/${encodeURIComponent(name)}/options`);

// ─────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────

export const listTables = () => request("GET", "/tables");

export const createTable = (spec) => request("POST", "/tables", spec).then(N);

export const getTable = (id, viewerPlayerId = null, eventsSince = 0) =>
    request("GET", `/tables/${id}${qs({ viewer_player_id: viewerPlayerId, events_since: eventsSince })}`).then(N);

const act = (id, verb, body) => request("POST", `/tables/${id}/${verb}`, body).then(N);

// opts.waitForBB: sit down but only get dealt in once the big blind reaches you.
export const sitAtTable      = (id, playerId, seat, buyin, { waitForBB = false } = {}) =>
    act(id, "sit", { player_id: playerId, seat, buyin, ...(waitForBB ? { wait_for_bb: true } : {}) });
export const switchSeat      = (id, playerId, seat) => act(id, "switch-seat", { player_id: playerId, seat });
export const leaveTable      = (id, playerId) => act(id, "leave", { player_id: playerId });
// at: "now" (default, immediate) | "next_bb" (sit out when the big blind reaches you)
export const sitOut          = (id, playerId, at = "now") => act(id, "sit-out", { player_id: playerId, at });
// Cancels a pending "next_bb" sit-out.
export const cancelSitOut    = (id, playerId) => act(id, "cancel-sit-out", { player_id: playerId });
export const sitIn           = (id, playerId) => act(id, "sit-in", { player_id: playerId });
export const rebuy           = (id, playerId, amount) => act(id, "rebuy", { player_id: playerId, amount });
export const addon           = (id, playerId, amount) => act(id, "addon", { player_id: playerId, amount });
export const pickVariant     = (id, playerId, variant, config) =>
    act(id, "variant", { player_id: playerId, variant, ...(config && Object.keys(config).length ? { config } : {}) });
export const startHand       = (id, playerId) => act(id, "start", { player_id: playerId });
export const closeTable      = (id, playerId) => act(id, "close", { player_id: playerId });

// body per domain:
//   BETTING     { type, amount? }
//   CARD_SELECT { selected_cards }
//   CARD_PASS   { selected_cards }
//   BOOLEAN     { bool_value }
//   CHOICE      { choice }
export const sendTableAction = (id, playerId, body) =>
    act(id, "action", { player_id: playerId, ...body });

export const getTableEvents = (id, since = 0, limit = 100) =>
    request("GET", `/tables/${id}/events${qs({ since, limit })}`);

// ─────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────

// Appends &token=<token> when logged in (server downgrades to spectator
// on a bad/expired token, it never errors).
export const tableSocketUrl = (id, viewerPlayerId = null, eventsSince = 0) =>
    withToken(
        `${WS_BASE_URL}/ws/tables/${id}${qs({ viewer_player_id: viewerPlayerId, events_since: eventsSince })}`
    );