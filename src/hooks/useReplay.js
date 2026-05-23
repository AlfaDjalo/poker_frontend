import { useState, useCallback, useMemo } from "react";

const FALLBACK_STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"];

function getStreetName(streetNames, streetIndex) {
    if (streetNames) {
        const name = streetNames[streetIndex];
        if (name != null) return name;
    }
    return FALLBACK_STREET_NAMES[streetIndex] ?? `Street ${streetIndex}`;
}

/**
 * useReplay
 *
 * Given a HandReplayDTO, reconstructs the full sequence of "frames" —
 * one frame per action plus an initial deal frame and a final showdown frame.
 */
export function useReplay(hand) {
    const [cursor, setCursor] = useState(0);

    const frames = useMemo(() => {
        if (!hand) return [];
        return buildFrames(hand);
    }, [hand]);

    const totalFrames = frames.length;
    const currentFrame = frames[cursor] ?? null;

    const canBack = cursor > 0;
    const canForward = cursor < totalFrames - 1;

    const stepForward = useCallback(() => {
        setCursor(c => Math.min(c + 1, totalFrames - 1));
    }, [totalFrames]);

    const stepBack = useCallback(() => {
        setCursor(c => Math.max(c - 1, 0));
    }, []);

    const jumpToStart = useCallback(() => setCursor(0), []);
    const jumpToEnd   = useCallback(() => setCursor(totalFrames - 1), [totalFrames]);

    const jumpToFrame = useCallback((i) => {
        setCursor(Math.max(0, Math.min(i, totalFrames - 1)));
    }, [totalFrames]);

    const resetCursor = useCallback(() => setCursor(0), []);

    return {
        frames,
        cursor,
        currentFrame,
        totalFrames,
        canBack,
        canForward,
        stepForward,
        stepBack,
        jumpToStart,
        jumpToEnd,
        jumpToFrame,
        resetCursor,
    };
}

// ─────────────────────────────────────────────────────────────────
// Frame builder
// ─────────────────────────────────────────────────────────────────

function buildFrames(hand) {
    const { actions, hole_cards, board_cards, point_results, payouts, seats, initial_stacks, street_names } = hand;

    // Build seat → cards lookup
    const holeCardsBySeat = {};
    for (const hc of hole_cards) {
        holeCardsBySeat[hc.player_seat] = hc.cards;
    }

    // ── Node → { card, street } ───────────────────────────────────
    // board_card.street is 1-based (1=flop, 2=turn, 3=river) as stored by
    // session_logger._build_node_street_map (enumerates street_nodes starting at 1).
    // For bomb pots the flop is dealt before any betting; those nodes get street=1.
    // Action.street is the engine's street_index (also 1 after the flop is dealt).
    // The comparison "board_card.street <= action.street" is therefore valid.
    const boardCardsByNode = {};
    for (const bc of board_cards) {
        boardCardsByNode[bc.node] = { card: bc.card, street: bc.street };
    }

    const maxNode = board_cards.length > 0
        ? Math.max(...board_cards.map(bc => bc.node))
        : 4;
    const nodeCount = maxNode + 1;

    // ── Seat ordering ─────────────────────────────────────────────
    const seatNumbers = Object.keys(seats).map(Number).sort();
    const heroSeat = seatNumbers[0] ?? 1;
 
    // ── Reconstruct starting stacks ───────────────────────────────
    // Priority: initial_stacks (backend) > stack_before of first action per player.
    // stack_before on a blind/ante IS the starting stack (action hasn't reduced it yet).
    // For players who never act we fall back to 0 so the seat still renders.    const stackBySeat = {};
    const stackBySeat = {};

    // 1. Seed from initial_stacks if backend provides them
    if (initial_stacks) {
        for (const [seat, stack] of Object.entries(initial_stacks)) {
            if (stack != null) stackBySeat[Number(seat)] = stack;
        }
    }
    
    // 2. Seed from first action per player (only if not already set)
    for (const a of actions) {
        if (a.stack_before != null && !(a.player_seat in stackBySeat)) {
            stackBySeat[a.player_seat] = a.stack_before;
        }
    }

    // 3. Any seat still missing gets 0 (avoids null / empty display)
    for (const s of seatNumbers) {
        if (!(s in stackBySeat)) stackBySeat[s] = 0;
    }

    // ── Pot: derive from pot_before chain ────────────────────────
    // pot_before[i] = pot just before action i executes.
    // The pot AFTER action i = pot_before[i+1]  (next action's pot_before).
    // For the last action, the pot after = total payouts.
    //
    // Fallback: if pot_before is missing, accumulate contributions manually
    // so the display is at least approximate.
    const hasPotBefore = actions.length > 0 && actions[0].pot_before != null;
    const totalPayout = payouts.reduce((s, p) => s + (p.amount || 0), 0);

    const potAfterAction = [];
    if (hasPotBefore) {
        for (let i = 0; i < actions.length; i++) {
            const next = actions[i + 1];
            potAfterAction[i] = (next != null && next.pot_before != null)
                ? next.pot_before
                : totalPayout;
        }
    } else {
        // Manual accumulation fallback: sum contributions up to and including each action
        let runningPot = 0;
        for (let i = 0; i < actions.length; i++) {
            const type = actions[i].action_type?.toLowerCase();
            if (type === "call" || type === "blind" || type === "ante" || type === "bet" || type === "raise") {
                runningPot += actions[i].amount || 0;
            }
            potAfterAction[i] = runningPot;
        }
    }

    // ── Per-street bet display ────────────────────────────────────
    const betBySeat = {};
    for (const s of seatNumbers) betBySeat[s] = 0;
    
    const folded = new Set();
    let currentStreet = 0;

    // ── Deal frame pot & board ────────────────────────────────────
    // For standard games: pot = 0, no board cards yet (street = -1 shows nothing).
    // For bomb pots: pot = pot_before of first action (antes/blinds already posted),
    // and the flop is already dealt (engine street_index = 1 after dealing flop).
    // Board cards with board_card.street <= firstActionStreet are already visible.
    const firstActionStreet = actions.length > 0 ? actions[0].street : 0;
    const dealFramePot = hasPotBefore && actions.length > 0 && actions[0].pot_before != null
        ? actions[0].pot_before
        : 0;

    // ── Frame 0: deal ─────────────────────────────────────────────
    const frames = [
        {
            frameType: "deal",
            street: 0,
            street_names,
            phase: "DEAL",
            pot: dealFramePot,
            players: buildPlayers(seatNumbers, seats, holeCardsBySeat, { ...betBySeat }, { ...stackBySeat }, false, new Set(), heroSeat),
            // Show board cards already dealt at hand start (e.g. bomb-pot flop).
            // firstActionStreet is the engine street_index of the first action,
            // which equals the number of board-deal rounds that already happened.            nodes: buildNodes(boardCardsByNode, nodeCount, -1),
            nodes: buildNodes(boardCardsByNode, nodeCount, firstActionStreet),
            action: null,
            frameActionId: "hand",
            label: "Deal",
            actionIndex: -1,
            heroSeat,
        },
    ];

    for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        const type = a.action_type?.toLowerCase()

        // ── Street transition ─────────────────────────────────────
        if (a.street !== currentStreet) {
            currentStreet = a.street;
            // Reset per-street bets
            for (const s of seatNumbers) betBySeat[s] = 0;

            // For the street frame the pot is the amount accumulated just before
            // this street's first action. Use pot_before if available, otherwise
            // use the accumulated total from the previous action.
            const streetPot = hasPotBefore && a.pot_before != null
                ? a.pot_before
                : (i > 0 ? (potAfterAction[i - 1] ?? 0) : 0);

            frames.push({
                frameType: "street",
                street: currentStreet,
                street_names,
                phase: "DEAL_BOARD",
                pot: streetPot,
                players: buildPlayers(seatNumbers, seats, holeCardsBySeat, { ...betBySeat }, { ...stackBySeat }, false, new Set(folded), heroSeat),
                nodes: buildNodes(boardCardsByNode, nodeCount, currentStreet),
                action: null,
                frameActionId: "hand",
                label: getStreetName(street_names, currentStreet),
                actionIndex: i,
                heroSeat,
            });
        }
        
        // ── Update running stacks & bets ─────────────────────────
        if (type === "fold") {
            folded.add(a.player_seat);
            if (a.stack_before != null) stackBySeat[a.player_seat] = a.stack_before;
 
        } else if (type === "check") {
            if (a.stack_before != null) stackBySeat[a.player_seat] = a.stack_before;
 
        } else if (type === "call" || type === "blind" || type === "ante") {
            const amount = a.amount || 0;
            if (a.stack_before != null) {
                stackBySeat[a.player_seat] = a.stack_before - amount;
            }
            betBySeat[a.player_seat] = (betBySeat[a.player_seat] || 0) + amount;
 
        } else if (type === "bet" || type === "raise") {
            // a.amount = total bet for this street (not increment)
            const totalBet = a.amount || 0;
            const alreadyIn = betBySeat[a.player_seat] || 0;
            const added = totalBet - alreadyIn;
            if (a.stack_before != null) {
                stackBySeat[a.player_seat] = a.stack_before - added;
            }
            betBySeat[a.player_seat] = totalBet;
        }

        const framePot = potAfterAction[i] ?? totalPayout;

        frames.push({
            frameType: "action",
            street: a.street,
            street_names,
            phase: "BETTING",
            pot: framePot,
            players: buildPlayers(seatNumbers, seats, holeCardsBySeat, { ...betBySeat }, { ...stackBySeat }, false, new Set(folded), heroSeat),
            nodes: buildNodes(boardCardsByNode, nodeCount, currentStreet),
            action: a,
            // 
            frameActionId: a.action_id,
            label: formatActionLabel(a),
            actionIndex: i,
            heroSeat,
        });
    }

    // ── Showdown frame ────────────────────────────────────────────
    frames.push({
        frameType: "showdown",
        street: 4,
        street_names,
        phase: "SHOWDOWN",
        pot: totalPayout,
        players: buildPlayers(seatNumbers, seats, holeCardsBySeat, {}, { ...stackBySeat }, true, new Set (folded), heroSeat),
        nodes: buildNodes(boardCardsByNode, nodeCount, 99), // all cards visible
        action: null,
        frameActionId: "hand", // null = hand-level annotations shown at showdown
        label: "Showdown",
        actionIndex: actions.length,
        pointResults: point_results,
        payouts,
        heroSeat,
    });

    return frames;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function buildPlayers(seatNumbers, seats, holeCardsBySeat, bets, stacks, showCards, folded = new Set(), heroSeat = null) {
    const players = {};
    for (const seat of seatNumbers) {
        const cards = holeCardsBySeat[seat] || [];
        const isHero = seat === heroSeat;
        const stack = stacks[seat];
        players[seat] = {
            seat,
            name: seats[String(seat)] ?? `Player ${seat}`,
            // Show stack if available; if 0 or missing, show as null for UI fallback
            stack: stack !== null && stack !== undefined ? stack : null,
            bet: bets[seat] || 0,
            folded: folded.has(seat),
            isHero,
            hand: cards.map(c => ({
                card: c,
                hidden: !isHero && !showCards,
                selected: false,
            })),
        };
    }
    return players;
}

/**
 * buildNodes — returns the node array visible up to and including upToStreet.
 *
 * board_card.street is 1-based (1=flop, 2=turn, 3=river) from session_logger.
 * upToStreet = engine street_index, which is also 1-based after first board deal:
 *   0  → preflop, no board yet (standard games)
 *   1  → flop dealt (standard: after flop; bomb pot: from the start)
 *   2  → turn dealt
 *   3  → river dealt
 *   99 → show everything (showdown frame)
 *
 * Board cards are NEVER hidden — they are always shown face-up once dealt.
 * The showAllCards toggle in HandReplayer only affects hole cards.
 */
function buildNodes(boardCardsByNode, nodeCount, upToStreet) {
    const nodes = Array(nodeCount).fill(null);
    for (let i = 0; i < nodeCount; i++) {
        const entry = boardCardsByNode[i];
        if (entry && entry.street <= upToStreet) {
            nodes[i] = { card: entry.card, hidden: false, selected: false };
        }
    }
    return nodes;
}
 
function formatActionLabel(a) {
    const name = a.player_name;
    const type = a.action_type.charAt(0).toUpperCase() + a.action_type.slice(1);
    if (a.amount) return `${name}: ${type} $${a.amount}`;
    return `${name}: ${type}`;
}