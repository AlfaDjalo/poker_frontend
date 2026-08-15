import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { beginEdit, applyEdit, cancelEdit, loadEdit, buildEditRequest } from "../api/editApi";
import { saveTutorialHand, updateTutorialHand, fetchTutorialHandEditState } from "../api/tutorialApi";
import { fetchVariantConfig, phaseCapabilities }  from "../api/variantConfigApi";

const DEFAULT_STARTING_STACK = 200;

// ─────────────────────────────────────────────────────────────────
// Creation-mode betting helpers
// ─────────────────────────────────────────────────────────────────
 
/** Active (non-inactive, non-folded) players in seat order. */
function activePlayers(editState) {
    return editState.players
        .filter(p => !p._inactive && !p.has_folded)
        .sort((a, b) => a.seat - b.seat);
}
 
/**
 * Returns true once betting for the current street is "closed":
 * every active, non-all-in player has current_bet === the street's bet_to_call,
 * and at least one full round has occurred (tracked via _actedThisRound).
 */
function isBettingRoundClosed(editState) {
    const active = activePlayers(editState);
    const live = active.filter(p => !p.is_all_in);
    if (live.length <= 1) return true;
    return live.every(p => p.current_bet === editState.bet_to_call && p._actedThisRound);
}
 
/**
 * Find the next active, non-all-in, non-folded seat after `fromSeat`
 * (wrapping around). Returns null if no one else can act.
 */
function nextActingSeat(editState, fromSeat) {
    const active = activePlayers(editState).filter(p => !p.is_all_in);
    if (active.length === 0) return null;
    const seats = active.map(p => p.seat);
    const idx = seats.indexOf(fromSeat);
    for (let i = 1; i <= seats.length; i++) {
        const candidate = seats[(idx + i) % seats.length];
        if (candidate !== fromSeat || seats.length === 1) {
            // Skip players who have already matched the bet AND acted,
            // unless betting just reopened (handled by caller resetting _actedThisRound)
            return candidate;
        }
    }
    return null;
}
 
/**
 * Post small/big blinds into editState at the start of PREFLOP_BET.
 * Idempotent-ish: only posts if no bets have been posted yet this street
 * (bet_to_call === 0 and pot contributions are all 0).
 */
function postBlinds(editState, bettingConfig) {
    if (!bettingConfig) return editState;
    const { small_blind = 0, big_blind = 0, ante = 0 } = bettingConfig;
    const active = activePlayers(editState);
    if (active.length < 2) return editState;
 
    let pot = editState.pot;
    const players = editState.players.map(p => ({ ...p }));
 
    const applyToSeat = (seat, amount) => {
        const idx = players.findIndex(pl => pl.seat === seat);
        if (idx === -1 || amount <= 0) return;
        const paid = Math.min(amount, players[idx].stack);
        players[idx].stack -= paid;
        players[idx].current_bet += paid;
        players[idx].total_contribution += paid;
        if (players[idx].stack === 0) players[idx].is_all_in = true;
        pot += paid;
    };
 
    // Ante from everyone first
    if (ante > 0) {
        for (const p of active) applyToSeat(p.seat, ante);
    }
 
    // Heads-up: dealer posts SB, other posts BB. Otherwise seat order: first = SB, second = BB.
    const sbSeat = active[0].seat;
    const bbSeat = active[1] ? active[1].seat : active[0].seat;
    applyToSeat(sbSeat, small_blind);
    applyToSeat(bbSeat, big_blind);
 
    const betToCall = Math.max(...players.filter(p => !p._inactive).map(p => p.current_bet), 0);
 
    return {
        ...editState,
        pot,
        players: players.map(p => ({ ...p, _actedThisRound: false })),
        bet_to_call: betToCall,
        min_raise: big_blind || 1,
        current_player: nextActingSeat({ ...editState, players }, bbSeat) ?? sbSeat,
    };
}
 
/**
 * Build the `available_actions` list + min/max raise for the seat to act,
 * in the same shape PlayerActionPanel expects.
 */
function legalActionsForSeat(editState, seat) {
    const player = editState.players.find(p => p.seat === seat);
    if (!player) return { availableActions: [], minRaise: null, maxRaise: null };
 
    const toCall = editState.bet_to_call - player.current_bet;
    const actions = ["fold"];
 
    if (toCall <= 0) {
        actions.push("check");
    } else {
        actions.push("call");
    }
 
    // Bet/raise is legal as long as the player has chips beyond what's needed to call
    if (player.stack > Math.max(toCall, 0)) {
        actions.push(player.current_bet > 0 || editState.bet_to_call > 0 ? "raise" : "bet");
    }
 
    const minRaise = editState.bet_to_call + (editState.min_raise || 1);
    const maxRaise = player.stack + player.current_bet; // all-in cap
 
    return { availableActions: actions, minRaise, maxRaise };
}
 
/**
 * Apply a player action (fold / check / call / bet / raise) to editState.
 * `amount` is the TOTAL bet for the street (matches PlayerActionPanel's
 * convention — see pokerApi.sendAction / PlayerActionPanel.handleBet).
 */
function applyActionToState(editState, seat, type, amount) {
    const players = editState.players.map(p => ({ ...p }));
    const idx = players.findIndex(p => p.seat === seat);
    if (idx === -1) return editState;
    const player = players[idx];
 
    let pot = editState.pot;
    let betToCall = editState.bet_to_call;
    let minRaise = editState.min_raise;
 
    if (type === "fold") {
        player.has_folded = true;
        player._actedThisRound = true;
    } else if (type === "check") {
        player._actedThisRound = true;
    } else if (type === "call") {
        const toCall = Math.min(betToCall - player.current_bet, player.stack);
        player.stack -= toCall;
        player.current_bet += toCall;
        player.total_contribution += toCall;
        pot += toCall;
        if (player.stack === 0) player.is_all_in = true;
        player._actedThisRound = true;
    } else if (type === "bet" || type === "raise") {
        const targetTotal = Math.max(amount ?? 0, betToCall);
        const added = Math.min(targetTotal - player.current_bet, player.stack);
        const newTotal = player.current_bet + added;
        player.stack -= added;
        player.current_bet = newTotal;
        player.total_contribution += added;
        pot += added;
        if (player.stack === 0) player.is_all_in = true;
 
        // Reopen betting for everyone else
        const raiseSize = newTotal - betToCall;
        if (newTotal > betToCall) {
            minRaise = raiseSize > 0 ? raiseSize : minRaise;
            betToCall = newTotal;
            for (const p of players) {
                if (p.seat !== seat && !p.has_folded && !p.is_all_in) {
                    p._actedThisRound = false;
                }
            }
        }
        player._actedThisRound = true;
    }
 
    let next = { ...editState, players, pot, bet_to_call: betToCall, min_raise: minRaise };
 
    const stillActive = activePlayers(next).filter(p => !p.is_all_in);
    const nextSeat = stillActive.length > 0 ? nextActingSeat(next, seat) : null;
    next.current_player = nextSeat ?? seat;
 
    return next;
}

/**
 * Reset betting state at the start of a NEW (non-preflop) betting street.
 * Unlike postBlinds, no forced bets are posted — bet_to_call starts at 0
 * so the first actor sees "bet" (not "raise") and can bet any amount.
 * Action starts with the first active, non-folded, non-all-in player
 * in seat order (mirrors the simplified seat-order convention used by
 * postBlinds for preflop).
 */
function resetStreetBetting(editState) {
    const players = editState.players.map(p => ({
        ...p,
        current_bet: 0,
        _actedThisRound: false,
    }));

    const live = activePlayers({ ...editState, players }).filter(p => !p.is_all_in);
    const firstSeat = live.length > 0 ? live[0].seat : editState.current_player;

    return {
        ...editState,
        players,
        bet_to_call: 0,
        min_raise: editState.min_raise || 1,
        current_player: firstSeat,
    };
}


// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

function validateEditState(editState) {
    const errors = [];
    if (!editState) return errors;

    // 1. Collect all cards in play
    const allCards = [];

    for (const p of editState.players) {
        for (const c of p.hole_cards) {
            if (c) allCards.push(c);
        }
        // Stacks
        if (p.stack < 0 || !Number.isInteger(p.stack)) {
            errors.push(`Player seat ${p.seat}: stack must be a non-negative integer`);
        }
    }

    for (const c of editState.node_cards) {
        if (c) allCards.push(c);
    }
    for (const c of editState.discard_pile) {
        if (c) allCards.push(c);
    }

    // 2. Duplicates
    const seen = new Set();
    for (const c of allCards) {
        if (seen.has(c)) errors.push(`Duplicate card: ${c}`);
        seen.add(c);
    }

    // 3. Total <= 52
    if (allCards.length > 52) errors.push("More than 52 cards accounted for");

    // 4. Pot non-negative
    if (editState.pot < 0) errors.push("Pot cannot be negative");

    return errors;
}

// ─────────────────────────────────────────────────────────────────
// Card movement helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Remove a card from wherever it currently lives in editState.
 * Returns a new editState with the card removed (does not place it anywhere).
 */
function removeCardFromState(state, card) {
    const players = state.players.map(p => ({
        ...p,
        hole_cards: p.hole_cards.map(c => c === card ? null : c),
    }));
    const node_cards = state.node_cards.map(c => c === card ? null : c);
    const discard_pile = state.discard_pile.filter(c => c !== card);
    return { ...state, players, node_cards, discard_pile };
}

/**
 * Place a card into a zone. Zones:
 *   "deck"          — remove from elsewhere (card enters available deck)
 *   "discard"       — push onto discard_pile
 *   "player-{seat}" — place in first empty slot of that player's hand
 *   "node-{index}"  — place at that board node index
 */
function placeCardInZone(state, card, zone) {
    if (zone === "deck" || zone === null) return state; // removal was enough

    if (zone === "discard") {
        return { ...state, discard_pile: [...state.discard_pile, card] };
    }

    if (zone.startsWith("player-")) {
        const seat = Number(zone.replace("player-", ""));
        const players = state.players.map(p => {
            if (p.seat !== seat) return p;
            // Fill the first null slot, or append if all filled
            const hand = [...p.hole_cards];
            const emptyIdx = hand.indexOf(null);
            if (emptyIdx !== -1) {
                hand[emptyIdx] = card;
            } else {
                hand.push(card);
            }
            return { ...p, hole_cards: hand };
        });
        return { ...state, players };
    }

    if (zone.startsWith("node-")) {
        const idx = Number(zone.replace("node-", ""));
        const node_cards = [...state.node_cards];
        node_cards[idx] = card;
        return { ...state, node_cards };
    }

    return state;
}

// ─────────────────────────────────────────────────────────────────
// Build initial editState from various sources
// ─────────────────────────────────────────────────────────────────

/**
 * Convert a live game hand object (from pokerApi) into an editState.
 * The hand must be in a state where a player is about to act (BETTING phase).
 */
function editStateFromLiveHand(hand, holeCardCount = null) {
    if (!hand) return null;
    const players = Object.values(hand.players).map(p => {
        const hole_cards = (p.hand || []).map(c => (typeof c === "object" ? c.card : c) ?? null);
        if (holeCardCount != null) {
            while (hole_cards.length < holeCardCount) hole_cards.push(null);
        }
        return {
            seat: p.seat,
            name: p.name ?? `Player ${p.seat}`,
            stack: p.stack ?? 0,
            current_bet: p.bet ?? 0,
            total_contribution: p.contribution ?? 0,
            has_folded: p.folded ?? false,
            is_all_in: p.is_all_in ?? false,
            hole_cards,
        };
    });

    const node_cards = (hand.nodes || []).map(n => {
        if (!n) return null;
        return typeof n === "object" ? n.card : n;
    });

    return {
        game_name: hand.game_name ?? null,
        street_index: hand.street ?? 0,
        pot: hand.pot ?? 0,
        dealer_position: hand.dealer_position ?? 0,
        current_player: hand.current_player ?? 0,
        bet_to_call: hand.to_call ?? 0,
        min_raise: hand.min_raise ?? 0,
        players,
        node_cards,
        discard_pile: hand.discard_pile ?? [],
    };
}

/**
 * Convert a replay frame into an editState.
 */
function editStateFromReplayFrame(frame, handData) {
    if (!frame || !handData) return null;

    // The frame itself only carries each player's CURRENT stack and
    // this-street bet — it doesn't track total_contribution or all-in
    // status directly. We can still derive both from data we actually
    // have: total_contribution so far = starting stack - current stack
    // (chips only ever move from a player's stack into the pot), and
    // is_all_in = stack is down to 0 and the player hasn't folded.
    // initial_stacks comes from handData (see useReplay.js buildFrames).
    const initialStacks = handData.initial_stacks ?? {};

    const players = Object.values(frame.players).map(p => {
        const stack = p.stack ?? 0;
        const startingStack = initialStacks[p.seat] ?? initialStacks[String(p.seat)] ?? stack;
        const totalContribution = Math.max(0, startingStack - stack);
        return {
            seat: p.seat,
            name: p.name ?? `Player ${p.seat}`,
            stack,
            current_bet: p.bet ?? 0,
            total_contribution: totalContribution,
            has_folded: p.folded ?? false,
            is_all_in: stack === 0 && !(p.folded ?? false),
            hole_cards: (p.hand || []).map(c => (typeof c === "object" ? c.card : c) ?? null),
        };
    });

    const node_cards = (frame.nodes || []).map(n => {
        if (!n) return null;
        return typeof n === "object" ? n.card : n;
    });

    const action = frame.action;

    return {
        game_name: handData.variant_name ?? null,
        street_index: frame.street ?? 0,
        pot: frame.pot ?? 0,
        dealer_position: handData.dealer_seat ?? 0,
        current_player: action?.player_seat ?? 0,
        bet_to_call: action?.amount ?? 0,
        min_raise: 0,
        players,
        node_cards,
        discard_pile: [],
    };
}

/**
 * Build a blank editState for creation mode.
 * holeCardCount / nodeCount come from the variant config (see variantConfigApi.js)
 * so the right number of empty slots render for the selected variant.
 *
 * All seats start INACTIVE — the user opts seats in via togglePlayerActive
 * (the "+ Add Player" control on each PlayerSeat). hole_cards is pre-filled
 * with `holeCardCount` nulls for every seat up front so the slots are
 * already there — and droppable — the instant a seat is activated.
 */
function blankEditState(gameName, seatCount = 6, holeCardCount = 2, nodeCount = 5) {
    return {
        game_name: gameName,
        street_index: 0,
        pot: 0,
        dealer_position: 0,
        current_player: 0,
        bet_to_call: 0,
        min_raise: 0,
        players: Array.from({ length: seatCount }, (_, i) => ({
            seat: i + 1,
            name: `Player ${i + 1}`,
            stack: DEFAULT_STARTING_STACK,
            current_bet: 0,
            total_contribution: 0,
            has_folded: false,
            is_all_in: false,
            _inactive: true,
            hole_cards: [],
        })),
        node_cards: Array(nodeCount).fill(null),
        discard_pile: [],
    };
}

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

/**
 * useHandEditor
 *
 * Props:
 *   mode      — "live" | "replayer" | "creation"
 *   hand      — live hand object (mode="live")
 *   frame     — current replay frame (mode="replayer")
 *   handData  — full hand data from HandReplayer (mode="replayer")
 *   gameName  — selected game variant (mode="creation")
 *   onApplied — callback(newHandState) after a successful apply/load
 *   onCancelled — callback() after cancel
 */
export function useHandEditor({
    mode,
    hand = null,
    frame = null,
    handData = null,
    gameName = null,
    onApplied = null,
    onCancelled = null,
} = {}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editState, setEditState] = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [serverErrors, setServerErrors] = useState([]);

    // ── Variant config (creation_phases, hole_cards, board_layout) ────
    const [variantConfig, setVariantConfig] = useState(null);
    const [configLoading, setConfigLoading] = useState(false);
    const [configError, setConfigError] = useState(null);

    // Current step within variantConfig.creation_phases (creation mode only)
    const [phaseIdx, setPhaseIdx] = useState(0);

    // Snapshot saved when entering edit mode (live only) for cancel restore
    const preEditSnapshot = useRef(null);

    // ── Creation-mode hand history recording ────────────────────────
    // The Tutorial save payload needs a real action log + per-street
    // board card tags so HandReplayer/useReplay can reconstruct more than
    // a deal-frame and a showdown-frame. These are populated as the user
    // posts blinds / takes actions / deals cards during CreationFlow.
    const actionLogRef = useRef([]);     // [{player_seat, player_name, action_type, amount, street, stack_before, pot_before}]
    const initialStacksRef = useRef({}); // {seat: stack} captured just before PREFLOP_BET posts blinds

    // ── §3.5: editing an existing hypothetical hand ─────────────────
    // editingHandId is non-null once a previously-saved hand has been
    // loaded into the wizard (vs. building one from scratch).
    const [editingHandId, setEditingHandId] = useState(null);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [loadExistingError, setLoadExistingError] = useState(null);

    // phaseSnapshots[i] = { potBefore, contributionBefore: {seat: total_contribution} }
    // captured the moment phase i is first entered, so invalidateBettingFromPhase
    // knows what to roll back TO. Stored in a ref (not state) since it's an
    // internal bookkeeping structure, not something that should re-render.
    const phaseSnapshotsRef = useRef({});

    // Load config whenever gameName changes (creation mode primarily, but
    // live/replayer also want hole_cards/node counts for correct slot display)
    useEffect(() => {
        if (!gameName) { setVariantConfig(null); return; }
        let cancelled = false;
        setConfigLoading(true);
        setConfigError(null);
        fetchVariantConfig(gameName)
            .then(cfg => { if (!cancelled) setVariantConfig(cfg); })
            .catch(e => {if (!cancelled) setConfigError(e.message); })
            .finally(() => {if (!cancelled) setConfigLoading(false); });
        return () => { cancelled = true; };
    }, [gameName]);

    const creationPhases = variantConfig?.creation_phases ?? [];
    const currentPhase = creationPhases[phaseIdx] ?? null;
    const phaseCaps = phaseCapabilities(currentPhase);
    const holeCardCount = variantConfig?.hole_cards ?? null;
    const boardNodeCount = variantConfig?.board_layout?.nodes ?? null;
    const bettingConfig = variantConfig?.betting ?? null;

    // Engine-style street index per creation phase: 0 = preflop. Bumped to
    // (deals_board_street + 1) once that street's deal phase is reached,
    // matching the convention used by board_card.street in useReplay.js
    // (1=flop, 2=turn, 3=river).
    const phaseStreets = useMemo(() => {
        const arr = [];
        let current = 0;
        for (const p of creationPhases) {
            if (p.deals_board_street != null) current = p.deals_board_street + 1;
            arr.push(current);
        }
        return arr;
    }, [creationPhases]);

    // node index -> 1-based street (matches useReplay's board_card.street convention)
    const nodeStreetMap = useMemo(() => {
        const map = {};
        const streets = variantConfig?.board_layout?.streets ?? {};
        Object.entries(streets).forEach(([streetIdx, nodes]) => {
            (nodes || []).forEach(n => { map[n] = Number(streetIdx) + 1; });
        });
        return map;
    }, [variantConfig]);

    // ── Initialize betting state once per betting phase (creation mode) ──
    // PREFLOP_BET posts forced blinds/antes (and logs them for the saved
    // hand's action history). Every other betting phase (FLOP_BET,
    // TURN_BET, RIVER_BET, ...) resets current_bet/bet_to_call/
    // _actedThisRound to 0 so the new street starts clean — otherwise stale
    // values from the previous street make isBettingRoundClosed() report
    // "closed" immediately, hiding the action panel and falsely enabling Next.
    // Keyed on phaseIdx so it runs exactly once per phase entry, even if the
    // user steps back and the phase list is re-entered later.
    const bettingSetupRef = useRef(null);
    useEffect(() => {
        if (mode !== "creation") return;
        if (!currentPhase?.allows_betting) return;
        if (!editState) return;
        if (bettingSetupRef.current === phaseIdx) return;
        bettingSetupRef.current = phaseIdx;

        // Snapshot pot/contributions BEFORE this phase's betting begins,
        // so invalidateBettingFromPhase can roll back to exactly this point
        // if the user edits an action here later (§3.5.3).
        phaseSnapshotsRef.current[phaseIdx] = {
            potBefore: editState.pot,
            contributionBefore: Object.fromEntries(
                editState.players.map(p => [p.seat, p.total_contribution])
            ),
        };

        if (currentPhase.id === "PREFLOP_BET") {
            // Capture starting stacks (pre-blinds) for the saved hand's
            // initial_stacks field — this is what useReplay's deal frame
            // and stack reconstruction key off of.
            initialStacksRef.current = Object.fromEntries(
                activePlayers(editState).map(p => [p.seat, p.stack])
            );
            // Compute the post-blinds state and diff it against the CURRENT
            // editState here, outside setEditState's updater. Pushing to
            // actionLogRef from inside the updater is impure — React 18
            // StrictMode double-invokes updaters in dev, which silently
            // logged every blind/ante twice.
            const next = postBlinds(editState, bettingConfig);
            let runningPot = editState.pot;
            const anteAmount = bettingConfig?.ante || 0;
            for (const before of editState.players) {
                const after = next.players.find(p => p.seat === before.seat);
                if (!after) continue;
                const posted = after.current_bet - before.current_bet;
                if (posted > 0) {
                    runningPot += posted;
                    actionLogRef.current.push({
                        action_index: actionLogRef.current.length,
                        player_seat: before.seat,
                        player_name: before.name,
                        action_type: (anteAmount > 0 && posted === anteAmount && before.current_bet === 0)
                            ? "ante"
                            : "blind",
                        amount: posted,
                        street: 0,
                        stack_before: before.stack,
                        pot_before: runningPot - posted,
                    });
                }
            }
            setEditState(next);
        } else {
            setEditState(prev => prev ? resetStreetBetting(prev) : prev);
        }
    }, [mode, currentPhase, phaseIdx, editState, bettingConfig]);

    // Reset the "blinds posted" guard whenever we leave/re-enter a betting phase
    // useEffect(() => {
    //     blindsPostedRef.current = false;
    // }, [phaseIdx]);

    // ── Derived betting info for the seat currently to act ─────────
    const bettingClosed = editState && currentPhase?.allows_betting
        ? isBettingRoundClosed(editState)
        : false;

    const actingSeat = (mode === "creation" && currentPhase?.allows_betting && editState && !bettingClosed)
        ? editState.current_player
        : null;

    const { availableActions, minRaise, maxRaise } = (actingSeat != null && editState)
        ? legalActionsForSeat(editState, actingSeat)
        : { availableActions: [], minRaise: null, maxRaise: null };

    // ── Handle a PlayerActionPanel action (creation mode) ───────────
    // Every action is appended to actionLogRef BEFORE it's applied, so the
    // saved hand carries a full, replayable history (HAND_EDITOR_DESIGN.md
    // §7.5 / §3.5.4 — hypothetical hands must be indistinguishable from
    // real ones except for the is_hypothetical flag).
    const onPlayerAction = useCallback((type, amount) => {
        if (actingSeat == null || !editState) return;
        const player = editState.players.find(p => p.seat === actingSeat);
        // Build + push the log entry exactly once, here, BEFORE calling
        // setEditState. setEditState's updater function must stay pure —
        // React 18 StrictMode double-invokes updaters in dev to catch
        // side effects, so pushing to actionLogRef from inside the updater
        // silently logged every action twice.
        actionLogRef.current.push({
            action_index: actionLogRef.current.length,
            player_seat: actingSeat,
            player_name: player?.name ?? `Player ${actingSeat}`,
            action_type: type,
            amount: amount ?? 0,
            street: phaseStreets[phaseIdx] ?? 0,
            stack_before: player?.stack ?? 0,
            pot_before: editState.pot,
        });
        setEditState(prev => {
            if (!prev) return prev;
            return applyActionToState(prev, actingSeat, type, amount);
        });
    }, [actingSeat, editState, phaseStreets, phaseIdx]);


    // ── Begin edit ────────────────────────────────────────────────
    const beginEditMode = useCallback(async () => {
        setServerErrors([]);
        setValidationErrors([]);

        if (mode === "live") {
            try {
                const snapshot = await beginEdit();
                const initialState = editStateFromLiveHand({ ...hand, ...snapshot }, holeCardCount);
                preEditSnapshot.current = initialState;
                setEditState(initialState);
                setIsEditing(true);
            } catch (e) {
                setServerErrors([e.message]);
            }
        } else if (mode === "replayer") {
            const initialState = editStateFromReplayFrame(frame, handData);
            setEditState(initialState);
            setIsEditing(true);
        } else if (mode === "creation") {
            actionLogRef.current = [];
            initialStacksRef.current = {};
            bettingSetupRef.current = null;
            phaseSnapshotsRef.current = {};
            setPhaseIdx(0);
            setEditState(blankEditState(
                gameName,
                6,
                holeCardCount ?? 2,
                boardNodeCount ?? 5,
            ));
            setIsEditing(true);
        }
    }, [mode, hand, frame, handData, gameName, holeCardCount, boardNodeCount]);

    // ── Phase navigation (creation mode) ───────────────────────────
    // furthestPhaseIdx tracks the deepest phase the user has reached so
    // far in this session — used to gate which phase-indicator entries
    // are clickable (§3.5.2: any phase ≤ furthest completed phase).
    const [furthestPhaseIdx, setFurthestPhaseIdx] = useState(0);

    const nextPhase = useCallback(() => {
        setPhaseIdx(i => {
            const next = Math.min(i + 1, creationPhases.length - 1);
            setFurthestPhaseIdx(f => Math.max(f, next));
            return next;
        });
    }, [creationPhases.length]);

    const prevPhase = useCallback(() => {
        setPhaseIdx(i => Math.max(i - 1, 0));
        bettingSetupRef.current = null;
    }, []);

    /**
     * navigateToPhase — jump directly to any phase ≤ furthestPhaseIdx
     * without invalidating anything (§3.5.2). Invalidation only happens
     * if the user subsequently *edits* something on that phase.
     */
    const navigateToPhase = useCallback((targetPhaseIdx) => {
        if (targetPhaseIdx < 0 || targetPhaseIdx > furthestPhaseIdx) return;
        setPhaseIdx(targetPhaseIdx);
    }, [furthestPhaseIdx]);

    /**
     * invalidateCardsAfterPhase (§3.5.3, card-dealing phases)
     * Clears cards dealt in phases AFTER targetPhaseIdx. Does NOT touch
     * betting/pot — only used when stepping back from a brand-new
     * (never-saved) hand, or as the legacy "step back" behaviour.
     */
    const invalidateCardsAfterPhase = useCallback((targetPhaseIdx) => {
        setEditState(prev => {
            if (!prev) return prev;
            let next = prev;
            for (let i = targetPhaseIdx + 1; i < creationPhases.length; i++) {
                const phase = creationPhases[i];
                if (phase.deals_hole) {
                    next = {
                        ...next,
                        players: next.players.map(p => ({
                            ...p,
                            hole_cards: p.hole_cards.map(() => null),
                        })),
                    };
                }
                if (phase.deals_board_street != null) {
                    const streetNodes = variantConfig?.board_layout?.streets?.[phase.deals_board_street] ?? [];
                    const node_cards = [...next.node_cards];
                    for (const idx of streetNodes) node_cards[idx] = null;
                    next = { ...next, node_cards };
                }
            }
            return next;
        });
    }, [creationPhases, variantConfig]);

    /**
     * invalidateBettingFromPhase (§3.5.3, betting phases)
     * Clears pot / current_bet / total_contribution / _actedThisRound for
     * `targetPhaseIdx` and every LATER betting phase only. Cards already
     * dealt (including in later card phases, e.g. the river) are kept.
     * `potAtPhaseStart` should come from phaseSnapshots — the pot value
     * recorded just before targetPhaseIdx began. Falls back to 0 when no
     * snapshot exists (brand-new hand, nothing to roll back to).
     *
     * Also truncates actionLogRef back to entries with street strictly
     * before the rolled-back-to phase's street, so re-played betting
     * doesn't leave stale duplicate actions in the saved history.
     */
    const invalidateBettingFromPhase = useCallback((targetPhaseIdx, potAtPhaseStart = null) => {
        const snap = phaseSnapshotsRef.current?.[targetPhaseIdx];
        const resolvedPot = potAtPhaseStart ?? snap?.potBefore ?? 0;
        setEditState(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                pot: resolvedPot,
                bet_to_call: 0,
                players: prev.players.map(p => ({
                    ...p,
                    current_bet: 0,
                    total_contribution: snap?.contributionBefore?.[p.seat] ?? 0,
                    is_all_in: false,
                    _actedThisRound: false,
                })),
            };
        });
        // Drop logged actions for this street and any later street — they'll
        // be re-recorded as the user re-enters betting from this point.
        const cutoffStreet = phaseStreets[targetPhaseIdx] ?? 0;
        actionLogRef.current = actionLogRef.current.filter(a => a.street < cutoffStreet);
        // Re-open betting setup so postBlinds/resetStreetBetting reruns for
        // this phase and every later betting phase the user revisits.
        bettingSetupRef.current = null;
        for (let i = targetPhaseIdx; i < creationPhases.length; i++) {
            phaseSnapshotsRef.current && delete phaseSnapshotsRef.current[i];
        }
    }, [creationPhases, phaseStreets]);

    /**
     * Legacy combined invalidation — kept for the original "step back on
     * a brand-new hand" confirm flow (§10, superseded by §3.5.3 for hands
     * loaded from an existing save, but still the simplest behaviour for
     * a hand that has never been saved and has no phaseSnapshots yet).
     */
    const invalidateAfterPhase = useCallback((targetPhaseIdx) => {
        invalidateCardsAfterPhase(targetPhaseIdx);
        invalidateBettingFromPhase(targetPhaseIdx + 1, 0);
    }, [invalidateCardsAfterPhase, invalidateBettingFromPhase]);

    // ── Move card between zones ───────────────────────────────────
    // In creation mode, the current phase constrains which zones are legal
    // drop targets (HAND_EDITOR_DESIGN.md §3.1 step ordering). Live/replayer
    // editing remains unconstrained per §4.2 — the whole point there is
    // free-form correction of an existing hand.
    const moveCard = useCallback((card, _fromZone, toZone) => {
        if (mode === "creation" && currentPhase) {
            if (toZone?.startsWith("player-") && !phaseCaps.canDealHole) {
                setValidationErrors([`Cannot deal hole cards during "${currentPhase.label}"`]);
                return;
            }
            if (toZone?.startsWith("node-")) {
                const nodeIdx = Number(toZone.replace("node-", ""));
                const allowedNodes = phaseCaps.canDealBoardStreet != null
                    ? (variantConfig?.board_layout?.streets?.[phaseCaps.canDealBoardStreet] ?? [])
                    : [];
                if (!allowedNodes.includes(nodeIdx)) {
                    setValidationErrors([`Cannot deal that board card during "${currentPhase.label}"`]);
                    return;
                }
            }
        }
        
        setEditState(prev => {
            // 1. Remove from everywhere
            let next = removeCardFromState(prev, card);
            // 2. Place in target zone
            next = placeCardInZone(next, card, toZone);
            return next;
        });
        // Clear errors on every change
        setValidationErrors([]);
        setServerErrors([]);
    }, [mode, currentPhase, phaseCaps, variantConfig]);

    // ── Set a player's stack ──────────────────────────────────────
    const setStack = useCallback((seat, amount) => {
        setEditState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.seat === seat ? { ...p, stack: Number(amount) } : p
            ),
        }));
    }, []);

    // ── Set the pot ───────────────────────────────────────────────
    const setPot = useCallback((amount) => {
        setEditState(prev => ({ ...prev, pot: Number(amount) }));
    }, []);

    // ── Set a player name (creation only) ─────────────────────────
    const setPlayerName = useCallback((seat, name) => {
        setEditState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.seat === seat ? { ...p, name } : p
            ),
        }));
    }, []);

    // ── Toggle player active (creation only) ──────────────────────
    const togglePlayerActive = useCallback((seat) => {
        setEditState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.seat === seat ? { ...p, _inactive: !p._inactive } : p
            ),
        }));
    }, []);

    // ── Run local validation ──────────────────────────────────────
    const validate = useCallback(() => {
        const errs = validateEditState(editState);
        setValidationErrors(errs);
        return errs.length === 0;
    }, [editState]);

    // ── Apply (live mode) ─────────────────────────────────────────
    const applyEditMode = useCallback(async () => {
        if (!validate()) return;
        setSubmitting(true);
        setServerErrors([]);
        try {
            const req = buildEditRequest(editState);
            const result = await applyEdit(req);
            setIsEditing(false);
            onApplied?.(result);
        } catch (e) {
            setServerErrors([e.detail ?? e.message]);
        } finally {
            setSubmitting(false);
        }
    }, [editState, validate, onApplied]);

    // ── Play from here (replayer mode) ────────────────────────────
    const playFromHere = useCallback(async () => {
        if (!validate()) return;
        setSubmitting(true);
        setServerErrors([]);
        try {
            const req = buildEditRequest(editState);
            const result = await loadEdit(req);
            setIsEditing(false);
            onApplied?.(result); // parent navigates to GameSimulator
        } catch (e) {
            setServerErrors([e.detail ?? e.message]);
        } finally {
            setSubmitting(false);
        }
    }, [editState, validate, onApplied]);

    /**
     * buildHandPayload — assembles the full structure the backend (and,
     * via GET /tutorial/hands/{id}, HandReplayer/useReplay.js) needs to
     * treat a saved hypothetical hand exactly like a real one: actions[]
     * (with street tags), board_cards[] (with street tags, matching
     * useReplay's 1-based convention), hole_cards[], seats, initial_stacks,
     * street_names — not just the final card/pot snapshot.
     *
     * `extra` lets callers override/add fields (e.g. nothing today, but
     * keeps this future-proof without needing a signature change).
     */
    const buildHandPayload = useCallback((extra = {}) => {
        if (!editState) return null;

        const activeSeats = editState.players.filter(p => !p._inactive);

        const seats = Object.fromEntries(activeSeats.map(p => [p.seat, p.name]));

        const initial_stacks = Object.keys(initialStacksRef.current).length > 0
            ? initialStacksRef.current
            : Object.fromEntries(activeSeats.map(p => [p.seat, p.stack]));

        const hole_cards = activeSeats.map(p => ({
            player_seat: p.seat,
            cards: p.hole_cards,
        }));

        const board_cards = editState.node_cards
            .map((card, idx) => (card ? { node: idx, card, street: nodeStreetMap[idx] ?? 0 } : null))
            .filter(Boolean);

        const street_names = variantConfig?.board_layout?.street_names ?? null;

        return {
            game_name: editState.game_name,
            variant_name: editState.game_name,
            layout_name: variantConfig?.layout_name ?? editState.game_name,
            dealer_seat: (editState.dealer_position ?? 0) + 1,
            pot: editState.pot,
            seats,
            initial_stacks,
            players: activeSeats.map(p => ({
                seat: p.seat,
                name: p.name,
                stack: p.stack,
                hole_cards: p.hole_cards,
            })),
            hole_cards,
            node_cards: editState.node_cards,
            board_cards,
            discard_pile: editState.discard_pile,
            actions: actionLogRef.current,
            street_names,
            ...extra,
        };
    }, [editState, variantConfig, nodeStreetMap]);

    // ── Save hypothetical hand (creation mode) ─────────────────────
    // asNew=false + editingHandId set → PUT (overwrite). Otherwise → POST
    // (always creates new — both for brand-new hands and explicit forks).
    const saveHand = useCallback(async (handPayload, { asNew = false } = {}) => {
        setSubmitting(true);
        setServerErrors([]);
        try {
            const result = (editingHandId != null && !asNew)
                ? await updateTutorialHand(editingHandId, handPayload)
                : await saveTutorialHand(handPayload);
            setIsEditing(false);
            setEditingHandId(result?.hand_id ?? (asNew ? null : editingHandId));
            onApplied?.(result);
        } catch (e) {
            setServerErrors([e.detail ?? e.message]);
        } finally {
            setSubmitting(false);
        }
    }, [onApplied, editingHandId]);

    /**
     * loadExistingHand — §3.5.1. Fetches a previously-saved hypothetical
     * hand's phase-decomposed edit-state and opens the wizard already
     * populated, jumped to its last (furthest) completed phase.
     *
     * Also restores actionLogRef / initialStacksRef from the fetched
     * edit-state (the backend's /edit-state endpoint should round-trip
     * these alongside editState/phaseSnapshots) so further edits append
     * onto a correct history rather than starting from empty.
     */
    const loadExistingHand = useCallback(async (handId) => {
        setLoadingExisting(true);
        setLoadExistingError(null);
        try {
            const data = await fetchTutorialHandEditState(handId);
            // Expected shape: { editState, phaseSnapshots: {[phaseIdx]: {potBefore, contributionBefore}}, furthestPhaseIdx, actionLog?, initialStacks? }
            phaseSnapshotsRef.current = data.phaseSnapshots ?? {};
            bettingSetupRef.current = null;
            actionLogRef.current = data.actionLog ?? [];
            initialStacksRef.current = data.initialStacks ?? {};
            setEditState(data.editState);
            setEditingHandId(handId);
            const furthest = data.furthestPhaseIdx ?? 0;
            setFurthestPhaseIdx(furthest);
            setPhaseIdx(furthest);
            setIsEditing(true);
            setValidationErrors([]);
            setServerErrors([]);
        } catch (e) {
            setLoadExistingError(e.message);
        } finally {
            setLoadingExisting(false);
        }
    }, []);

    // ── Cancel ────────────────────────────────────────────────────
    const cancelEditMode = useCallback(async () => {
        if (mode === "live") {
            try {
                await cancelEdit();
            } catch (_) { /* ignore */ }
        }
        setIsEditing(false);
        setEditState(null);
        setValidationErrors([]);
        setServerErrors([]);
        onCancelled?.();
    }, [mode, onCancelled]);

    return {
        isEditing,
        editState,
        validationErrors,
        serverErrors,
        submitting,
        beginEdit: beginEditMode,
        moveCard,
        setStack,
        setPot,
        setPlayerName,
        togglePlayerActive,
        validate,
        applyEdit: applyEditMode,
        playFromHere,
        saveHand,
        buildHandPayload,
        cancelEdit: cancelEditMode,
        // Expose setter for direct state patches (creation wizard)
        setEditState,

        // ── Variant config ──────────────────────────────────────
        variantConfig,
        configLoading,
        configError,
        holeCardCount,
        boardNodeCount,

        // ── Creation phase machinery ────────────────────────────
        creationPhases,
        currentPhase,
        phaseIdx,
        phaseCaps,
        phaseStreets,
        nodeStreetMap,
        nextPhase,
        prevPhase,
        navigateToPhase,
        furthestPhaseIdx,
        invalidateAfterPhase,
        invalidateCardsAfterPhase,
        invalidateBettingFromPhase,

        // ── Editing an existing hypothetical hand (§3.5) ────────
        editingHandId,
        loadExistingHand,
        loadingExisting,
        loadExistingError,

        // ── Betting (creation mode) ─────────────────────────────
        actingSeat,
        availableActions,
        minRaise,
        maxRaise,
        bettingClosed,
        onPlayerAction,
    };
}