// src/api/adminApi.js
import { request, qs } from "./authApi";

// ─────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────

/** -> [{ player_id, name, is_bot, has_pin, seated_table_id, bankroll, created_at, ... }] */
export const adminListPlayers = ({ includeBots = true } = {}) =>
    request("GET", `/admin/players${qs({ include_bots: includeBots })}`);

/** amount: signed number. 409 if bankroll would go below 0. */
export const adminAdjustBankroll = (playerId, amount, note) =>
    request("POST", `/admin/players/${playerId}/adjust-bankroll`, {
        amount: Number(amount),
        note: note || "",
    });

export const adminResetPin = (playerId) =>
    request("POST", `/admin/players/${playerId}/reset-pin`);

/** is_bot is admin-only on PATCH /players/{id}. */
export const adminSetBot = (playerId, isBot) =>
    request("PATCH", `/players/${playerId}`, { is_bot: !!isBot });

/** Tombstone delete. 409 if seated unless force=true. */
export const adminDeletePlayer = (playerId, { force = false } = {}) =>
    request("DELETE", `/players/${playerId}${qs({ force: force ? "true" : undefined })}`);

// ─────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────

/** Mid-hand: player leaves after the hand. */
export const adminKick = (tableId, playerId) =>
    request("POST", `/admin/tables/${tableId}/kick`, { player_id: playerId });

/**
 * Send ONLY changed fields. null clears owner_player_id / variant_allowlist.
 * 409 if the table is IN_HAND.
 */
export const adminPatchTable = (tableId, changes) =>
    request("PATCH", `/admin/tables/${tableId}`, changes);

/** Funded from player's bankroll; 409 if insufficient. */
export const adminSetStack = (tableId, playerId, stack, note) =>
    request("POST", `/admin/tables/${tableId}/set-stack`, {
        player_id: playerId,
        stack: Number(stack),
        note: note || "",
    });

/** Mid-hand voids the hand and refunds stacks. */
export const adminForceClose = (tableId) =>
    request("POST", `/admin/tables/${tableId}/force-close`);

/** Closed tables only; 204. */
export const adminDeleteTable = (tableId) =>
    request("DELETE", `/admin/tables/${tableId}`);

// ─────────────────────────────────────────────
// Ledger / audit
// ─────────────────────────────────────────────

export const adminLedger = ({ playerId, tableId, limit = 50, offset = 0 } = {}) =>
    request("GET", `/admin/ledger${qs({ player_id: playerId, table_id: tableId, limit, offset })}`);

export const adminAudit = ({ limit = 50, offset = 0 } = {}) =>
    request("GET", `/admin/audit${qs({ limit, offset })}`);