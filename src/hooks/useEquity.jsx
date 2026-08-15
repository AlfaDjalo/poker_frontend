// useEquity.js
// React hook for equity calculation.
//
// Usage:
//   const { equity, loading, error, calculate, clear } = useEquity();
//
//   calculate({
//     variant_name: "holdem",
//     players: [
//       { seat: 1, hole_cards: ["Ah", "Kd"] },
//       { seat: 2, hole_cards: [null, null] },   // unknown
//     ],
//     board_nodes: [
//       { node: 0, card: "7s" },
//       { node: 1, card: "2h" },
//       { node: 2, card: "Jc" },
//       { node: 3, card: null },   // not yet dealt
//       { node: 4, card: null },
//     ],
//     street: 1,
//     pot_size: 240,
//   });
//
// ── REDESIGN (rich equity reporting) ────────────────────────────────
// The backend response shape changed from
//   { equity: { seat: { pointName: fraction } }, method, iterations, elapsed_ms }
// to
//   { players: { seat: PlayerEquity }, method, iterations, elapsed_ms }
// where PlayerEquity now carries overall pot equity (fraction + currency),
// scoop/split probability, and a per-point breakdown. `pot_size` is a new
// optional param — omit it (or send 0) to skip currency fields.
// ─────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';

const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * @typedef {Object} PointEquity
 * @property {number} win_share
 * @property {number} win_probability
 * @property {number} tie_probability
 * @property {number} equity_currency
 * @property {number} equity_percent
 */

/**
 * @typedef {Object} PlayerEquity
 * @property {number} overall_equity_fraction
 * @property {number} overall_equity_currency
 * @property {number} scoop_probability
 * @property {number} split_probability
 * @property {{ [pointName: string]: PointEquity }} points
 */

/**
 * @typedef {Object} EquityResult
 * @property {{ [seat: string]: PlayerEquity }} players
 * @property {"exact"|"monte_carlo"} method
 * @property {number} iterations
 * @property {number} elapsed_ms
 */

/**
 * @returns {{
 *   equity: EquityResult|null,
 *   loading: boolean,
 *   error: string|null,
 *   calculate: (params: object) => Promise<void>,
 *   clear: () => void,
 * }}
 */
export function useEquity() {
    const [equity, setEquity] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Keep a ref to the current AbortController so we can cancel in-flight requests
    const abortRef = useRef(null);

    const calculate = useCallback(async (params) => {
        // Cancel any in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
        }

        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/equity/calculate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params),
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail ?? `HTTP ${res.status}`);
            }

            const data = await res.json();
            setEquity(data);
        } catch (err) {
            if (err.name === "AbortError") {
                // Request was intentionally cancelled - do not update state
                return;
            }
            setError(err.message ?? "Unknown error");
            setEquity(null);
        } finally {
            // Only clear loading if this controller is still current
            if (abortRef.current === controller) {
                setLoading(false);
                abortRef.current = null;
            }
        }
    }, []);

    const clear = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setEquity(null);
        setError(null);
        setLoading(false);
    }, []);

    return { equity, loading, error, calculate, clear };
}


// ─────────────────────────────────────────────────────────────────
// Parameter builders — helpers to extract equity params from hand state
// ─────────────────────────────────────────────────────────────────

/**
 * Build equity params from GameSimulator hand state.
 *
 * @param {object} hand         — hand object returned by pokerApi (post-normalisation)
 * @param {boolean} [heroOnly]  — if true, only include known hero cards; hide others
 * @returns {object|null}       — params for calculate(), or null if not calculable
 */
export function buildEquityParamsFromHand(hand, heroOnly = false) {
    if (!hand || !hand.players || !hand.nodes) return null;

    const variant_name = hand.game_name;
    if (!variant_name) return null;

    // Players
    const players = Object.values(hand.players)
        .filter(p => !p.folded)
        .map(p => ({
            seat: p.seat,
            hole_cards: (p.hand || []).map(c => {
                if (!c) return null;
                const card = typeof c === "object" ? c.card : c;
                const hidden = typeof c === "object" ? c.hidden : false;
                // Hidden cards are unknown from viewer's perspective
                return (hidden || heroOnly && !p.isHero) ? null : (card ?? null);
            }),
        }));

    // Board nodes - indexed by position
    const board_nodes = (hand.nodes || []).map((c, idx) => ({
        node: idx,
        card: c ? (typeof c === "object" ? c.card : c) : null,
    }));

    return {
        variant_name,
        players,
        board_nodes,
        street: hand.street ?? 0,
        // Populates overall_equity_currency / equity_currency in the
        // response. Falls back to 0 (fraction/probability-only) if the
        // hand object doesn't carry a pot yet.
        pot_size: hand.pot ?? 0,
    };
}

/**
 * Build equity params from a HandReplayer frame (produced by useReplay).
 *
 * @param {object} frame        — currentFrame from useReplay
 * @param {string} variant_name — hand.variant_name from HandReplayer state
 * @returns {object|null}
 */
export function buildEquityParamsFromFrame(frame, variant_name) {
    if (!frame || !variant_name) return null;

    // Do not calculate equity at the showdown frame - it's already resolved
    if (frame.frameType === "showdown") return null;

    const players = Object.values(frame.players || {})
        .filter(p => !p.folded)
        .map(p => ({
            seat: p.seat,
            hole_cards: (p.hand || []).map(c => {
                if (!c) return null;
                const card = typeof c === "object" ? c.card : c;
                const hidden = typeof c === "object" ? c.hidden : false;
                // Respect the hidden flag - viewer's perspective
                return hidden ? null : (card ?? null);
            }),
        }));

    const board_nodes = (frame.nodes || []).map((c, idx) => ({
        node: idx,
        card: c ? (typeof c === "object" ? c.card : c) : null,
    }));

    return {
        variant_name,
        players,
        board_nodes,
        street: frame.street ?? 0,
        pot_size: frame.pot ?? 0,
    };
}