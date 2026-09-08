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
        if (typeof window !== "undefined" && window.__CAP_DEBUG_STREETS__) {
            logStreetDiagnostics(hand);
        }
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

// ─────────────────────────────────────────────────────────────────
// Diagnostic — compares board_card.street (reveal-order group, from
// session_logger.log_board) against action.street (deal-group-count
// derived from graph_engine_callbacks._betting_node_street_map's walk)
// for a loaded hand. The two are DIFFERENT numbering schemes that only
// happen to agree for flows where deal/bet steps strictly alternate
// (every standard/bomb-pot variant today — see buildNodes' own
// docstring). If they diverge for a given hand (e.g. a non-standard
// flow like drawmaha's discard/draw step), a board card can end up
// with a `street` value no action's `street` ever reaches until later
// than expected — the symptom is a board card "missing" on the street
// it should have appeared on.
//
// This exact mismatch is why buildFrames below no longer compares
// board_card.street to action.street directly — see the ordinal
// remap in the "Node → { card, street }" section.
//
// Opt-in only (set `window.__CAP_DEBUG_STREETS__ = true` in the
// console before loading a hand) so this never runs/logs by default.
// Not a fix — a way to confirm, on a specific repro hand, whether the
// two numbering schemes actually agree before assuming this is a
// frontend bug.
function logStreetDiagnostics(hand) {
    const actionStreets = (hand.actions || []).map(a => ({
        action_index: a.action_index,
        street: a.street,
        action_type: a.action_type,
        player_seat: a.player_seat,
    }));
    const boardStreets = (hand.board_cards || []).map(bc => ({
        node: bc.node,
        street: bc.street,
        card: bc.card,
    }));
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[CAP] street diagnostics — hand ${hand.hand_id ?? "(unsaved)"}`);
    // eslint-disable-next-line no-console
    console.log("actions (action.street):");
    // eslint-disable-next-line no-console
    console.table(actionStreets);
    // eslint-disable-next-line no-console
    console.log("board_cards (board_card.street, reveal-order):");
    // eslint-disable-next-line no-console
    console.table(boardStreets);
    // eslint-disable-next-line no-console
    console.log(
        "Expect: for each board card, some action's street should be >= that card's street "
        + "at or before the point it's meant to be revealed. If a board card's street is HIGHER "
        + "than every action's street up to where it should appear, the two numbering schemes "
        + "have diverged for this hand (backend-side, not fixable here)."
    );
    // eslint-disable-next-line no-console
    console.log("hole_card_events (raw, first 10):", (hand.hole_card_events || []).slice(0, 10));
    // eslint-disable-next-line no-console
    console.log("board_cards (raw, first 10):", (hand.board_cards || []).slice(0, 10));

    // eslint-disable-next-line no-console
    console.groupEnd();
}

/**
 * buildHoleCardTimeline
 *
 * Reconstructs, for every real board-street 0..maxRealStreet, the set
 * of hole cards each seat actually held AS OF the end of that street —
 * from hole_card_events (the real chronological ledger: { sequence,
 * street, event_type, card, from_seat, to_seat }), NOT the flat
 * hole_cards snapshot (which only has final cards with no timing).
 *
 * event_type values handled:
 *   "deal" / "receive"                    — card enters to_seat's hand
 *   "discard" / "remove" / "pass_away"    — card leaves from_seat's hand
 * Unrecognised event_types are ignored rather than thrown on, since
 * this ledger is expected to grow new mechanic-specific types over
 * time and an unhandled one should degrade to "card doesn't move"
 * rather than crash the replay.
 *
 * Events are applied in (street, sequence) order so same-street
 * mechanics (e.g. a mid-street discard-then-receive) resolve in the
 * right order within that street's snapshot.
 *
 * Falls back to treating every seat's FINAL cards as present from
 * street 0 onward when hole_card_events is missing/empty — this is
 * the previous (timing-free) behaviour, kept for hands saved before
 * this ledger existed (e.g. some older tutorial hands) so they still
 * render rather than showing empty hands.
 */
function buildHoleCardTimeline(seatNumbers, holeCardsBySeat, holeCardEvents, maxRealStreet) {
    const snapshots = []; // snapshots[street] = { [seat]: string[] }

    if (!holeCardEvents || holeCardEvents.length === 0) {
        for (let s = 0; s <= maxRealStreet; s++) {
            const snap = {};
            for (const seat of seatNumbers) snap[seat] = [...(holeCardsBySeat[seat] || [])];
            snapshots.push(snap);
        }
        return snapshots;
    }

    const sorted = [...holeCardEvents].sort((a, b) =>
        (a.street ?? 0) - (b.street ?? 0) || (a.sequence ?? 0) - (b.sequence ?? 0)
    );

    const running = {};
    for (const seat of seatNumbers) running[seat] = [];

    let evIdx = 0;
    for (let s = 0; s <= maxRealStreet; s++) {
        while (evIdx < sorted.length && (sorted[evIdx].street ?? 0) <= s) {
            const ev = sorted[evIdx];
            // Backend sends event_type in UPPERCASE ("DEALT", "DISCARDED", ...).
            // Normalize once here so this stays robust to casing drift from
            // either side rather than silently matching nothing (which
            // previously left every seat's hand empty at every street except
            // the showdown frame, which bypasses this ledger entirely).
            const type = (ev.event_type || "").toLowerCase();
            if (ev.to_seat != null && (type === "dealt" || type === "deal" || type === "receive" || type === "received")) {
                running[ev.to_seat] = [...(running[ev.to_seat] || []), ev.card];
            }
            if (ev.from_seat != null && (type === "discard" || type === "discarded" || type === "remove" || type === "removed" || type === "pass_away")) {
                running[ev.from_seat] = (running[ev.from_seat] || []).filter(c => c !== ev.card);
            }
            evIdx++;
        }
        const snap = {};
        for (const seat of seatNumbers) snap[seat] = [...(running[seat] || [])];
        snapshots.push(snap);
    }
    return snapshots;
}

function buildFrames(hand) {
    let { actions, board_cards, point_results, payouts, initial_stacks, street_names, hole_card_events } = hand;

    // ── Normalize `seats` ─────────────────────────────────────────
    // Real hands: seats = { "1": "Alice", "2": "Bob" }
    // Tutorial hands from some backends: seats missing, players array present.
    let seats = hand.seats;
    if (!seats || Object.keys(seats).length === 0) {
        seats = {};
        const playersArr = Array.isArray(hand.players)
            ? hand.players
            : Object.values(hand.players || {});
        for (const p of playersArr) {
            if (p.seat != null) seats[String(p.seat)] = p.name ?? `Player ${p.seat}`;
        }
    }

    // ── Normalize `hole_cards` ────────────────────────────────────
    // Real hands: hole_cards = [{ player_seat, cards }]
    // Tutorial hands: may be missing; derive from players[].hole_cards.
    // This flat snapshot is still used as: (a) the showdown frame's
    // authoritative final view, and (b) the fallback timeline when
    // hole_card_events isn't present — see buildHoleCardTimeline.
    let hole_cards = hand.hole_cards;
    if (!hole_cards || hole_cards.length === 0) {
        const playersArr = Array.isArray(hand.players)
            ? hand.players
            : Object.values(hand.players || {});
        hole_cards = playersArr
            .filter(p => p.hole_cards?.length)
            .map(p => ({ player_seat: p.seat, cards: p.hole_cards }));
    }
    hole_cards = hole_cards ?? [];

    // ── Normalize `actions` / `payouts` / `board_cards` / `hole_card_events` ──
    actions    = actions    ?? [];
    board_cards = board_cards ?? [];
    payouts    = payouts    ?? [];
    hole_card_events = hole_card_events ?? [];

    // Build seat → cards lookup (flat, final — see usage notes above)
    const holeCardsBySeat = {};
    for (const hc of hole_cards) {
        holeCardsBySeat[hc.player_seat] = hc.cards;
    }

    // ── Node → { card, street } ───────────────────────────────────
    // board_card.street is a REVEAL-ORDER GROUP number (1, 2, 3... —
    // incremented once per board-dealing batch), NOT the same
    // numbering as action.street (the real board-street index, 0-3).
    // The two only happen to line up when nothing else in the hand
    // consumes a reveal-order slot — which breaks for extra-card
    // mechanics (ESG, Catchup ESG, Christmas, Grinch's bonus card,
    // pass-the-trash all deal/move HOLE cards mid-hand, and previously
    // shared this same reveal-order counter), pushing later board
    // batches' raw street number above the real max street ever
    // reached. Comparing the raw values directly meant those batches
    // never satisfied `entry.street <= upToStreet` until the terminal
    // showdown frame (upToStreet=99) — i.e. "the board doesn't render
    // until showdown".
    //
    // Fix: re-map each DISTINCT raw reveal-order value seen among
    // board_cards, in ascending order, onto its own 1-based ORDINAL
    // position. That ordinal is what action.street actually counts
    // through (1st postflop board batch, 2nd, 3rd, ...) regardless of
    // how many reveal-order slots were consumed elsewhere in the hand.
    //
    // Known limitation: this still assumes one board-reveal batch per
    // real street. A layout that deals MULTIPLE board batches within a
    // single real street (e.g. hopscotch's two separate flops, both at
    // real street 1) will still misalign from that point on — that
    // needs a real per-board-card street field from the backend
    // (mirroring the hole_card_events.street fix) to resolve fully.
    // Flagging it here rather than silently mishandling it.
    const distinctBoardGroups = [...new Set(board_cards.map(bc => bc.street))].sort((a, b) => a - b);
    const boardGroupToRealStreet = {};
    distinctBoardGroups.forEach((g, i) => { boardGroupToRealStreet[g] = i + 1; });

    const boardCardsByNode = {};
    for (const bc of board_cards) {
        boardCardsByNode[bc.node] = { card: bc.card, street: boardGroupToRealStreet[bc.street] };
    }

    const maxNode = board_cards.length > 0
        ? Math.max(...board_cards.map(bc => bc.node))
        : 4;
    const nodeCount = maxNode + 1;

    // ── Seat ordering ─────────────────────────────────────────────
    const seatNumbers = Object.keys(seats).map(Number).sort();
    const heroSeat = seatNumbers[0] ?? 1;

    // ── Per-real-street hole card snapshots ─────────────────────────
    // Real board-street index (0=preflop..3=river typically), derived
    // the same way action frames already derive `currentStreet` below.
    // hole_card_events carry the CORRECTED real street per the backend
    // fix, so this is safe to gate on directly (unlike board_cards).
    const maxRealStreet = Math.max(
        0,
        ...actions.map(a => a.street ?? 0),
        ...hole_card_events.map(e => e.street ?? 0),
    );
    const holeCardSnapshots = buildHoleCardTimeline(seatNumbers, holeCardsBySeat, hole_card_events, maxRealStreet);
    const holeCardsAtStreet = (street) => holeCardSnapshots[Math.max(0, Math.min(street, maxRealStreet))] ?? holeCardsBySeat;
 
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
            players: buildPlayers(seatNumbers, seats, holeCardsAtStreet(firstActionStreet), { ...betBySeat }, { ...stackBySeat }, false, new Set(), heroSeat),
            // Show board cards already dealt at hand start (e.g. bomb-pot flop).
            // firstActionStreet is the engine street_index of the first action,
            // which equals the number of board-deal rounds that already happened.
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
                players: buildPlayers(seatNumbers, seats, holeCardsAtStreet(currentStreet), { ...betBySeat }, { ...stackBySeat }, false, new Set(folded), heroSeat),
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
            players: buildPlayers(seatNumbers, seats, holeCardsAtStreet(a.street), { ...betBySeat }, { ...stackBySeat }, false, new Set(folded), heroSeat),
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
    // Uses the flat, final holeCardsBySeat directly (not the ledger
    // reconstruction) — this is the authoritative end state regardless
    // of any timeline-reconstruction edge case, and every card is
    // shown face-up here anyway (showCards=true).
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
 * `boardCardsByNode[i].street` is now the ORDINAL board-reveal position
 * (1st batch, 2nd batch, ...) — see the remap in buildFrames — which is
 * directly comparable to `upToStreet`'s convention:
 *   0  → preflop, no board yet (standard games)
 *   1  → 1st board batch dealt (standard: after flop; bomb pot: from the start)
 *   2  → 2nd board batch dealt (turn, in the common case)
 *   3  → 3rd board batch dealt (river, in the common case)
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