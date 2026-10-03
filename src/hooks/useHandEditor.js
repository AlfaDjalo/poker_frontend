import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { beginEdit, applyEdit, cancelEdit, loadEdit, buildEditRequest } from "../api/editApi";
import { fetchVariantConfig } from "../api/variantConfigApi";
import {
    startConstruction,
    fetchConstructionState,
    submitConstructionStep,
    undoConstructionStep,
    finishConstruction,
    abandonConstruction,
} from "../api/creatorApi";

const DEFAULT_STARTING_STACK = 200;

const KNOWN_STEP_DOMAINS = [
    "DEAL_HOLE", "DEAL_BOARD", "BETTING", "CARD_SELECT",
    "CARD_PASS", "BOOLEAN", "CHOICE", "COMPLETE",
];

// Cap how many entries the step trail keeps so a very long hand doesn't
// grow this unboundedly.
const MAX_TRAIL_LENGTH = 200;

// ─────────────────────────────────────────────────────────────────
// Validation (shared by live/replayer editing)
// ─────────────────────────────────────────────────────────────────

function validateEditState(editState) {
    const errors = [];
    if (!editState) return errors;

    const allCards = [];

    for (const p of editState.players) {
        for (const c of p.hole_cards) {
            if (c) allCards.push(c);
        }
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

    const seen = new Set();
    for (const c of allCards) {
        if (seen.has(c)) errors.push(`Duplicate card: ${c}`);
        seen.add(c);
    }

    if (allCards.length > 52) errors.push("More than 52 cards accounted for");
    if (editState.pot < 0) errors.push("Pot cannot be negative");

    return errors;
}

// ─────────────────────────────────────────────────────────────────
// Card movement helpers (live/replayer editing only)
// ─────────────────────────────────────────────────────────────────

function removeCardFromState(state, card) {
    const players = state.players.map(p => ({
        ...p,
        hole_cards: p.hole_cards.map(c => c === card ? null : c),
    }));
    const node_cards = state.node_cards.map(c => c === card ? null : c);
    const discard_pile = state.discard_pile.filter(c => c !== card);
    return { ...state, players, node_cards, discard_pile };
}

function placeCardInZone(state, card, zone) {
    if (zone === "deck" || zone === null) return state;

    if (zone === "discard") {
        return { ...state, discard_pile: [...state.discard_pile, card] };
    }

    if (zone.startsWith("player-")) {
        const seat = Number(zone.replace("player-", ""));
        const players = state.players.map(p => {
            if (p.seat !== seat) return p;
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
// Build initial editState (live/replayer only)
// ─────────────────────────────────────────────────────────────────

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
        bet_to_call: hand.toCall ?? hand.to_call ?? 0,
        min_raise: hand.minRaise ?? hand.min_raise ?? 0,
        players,
        node_cards,
        discard_pile: hand.discard_pile ?? [],
    };
}

function editStateFromReplayFrame(frame, handData) {
    if (!frame || !handData) return null;

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

// ─────────────────────────────────────────────────────────────────
// Creation-mode setup helpers
// ─────────────────────────────────────────────────────────────────

function blankSetupPlayers(seatCount = 6, startingStack = DEFAULT_STARTING_STACK) {
    return Array.from({ length: seatCount }, (_, i) => ({
        seat: i + 1,
        name: `Player ${i + 1}`,
        stack: startingStack,
        _inactive: true,
    }));
}

/**
 * Normalize a ConstructionStepDTO's `state` into the same
 * { players: {seat: {...}}, nodes: [...] } shape PokerTable/HandEditor
 * already render elsewhere.
 *
 * ASSUMPTION (unconfirmed against the real backend): step.state carries
 * `players` (array, each with `hole_cards` or `hand`) and `nodes` (array
 * of card strings/objects), mirroring the live GameStateDTO shape. If
 * the real backend uses different field names, this is the one place to
 * fix it.
 */
function normalizeConstructionState(state, mapSeat = (s) => s) {
    if (!state) return null;

    const players = {};
    (state.players || []).forEach(p => {
                const cards = p.hole_cards ?? p.hand ?? [];
        const seat = mapSeat(p.seat);
        players[seat] = {
            seat,
            name: p.name ?? `Player ${seat}`,
            stack: p.stack ?? 0,
            bet: p.current_bet ?? p.bet ?? 0,
            folded: p.has_folded ?? p.folded ?? false,
            hand: cards.map(c => {
                if (!c) return null;
                const card = typeof c === "object" ? c.card : c;
                return card ? { card, hidden: false, selected: false } : null;
            }),
        };
    });

    const nodes = (state.nodes ?? state.node_cards ?? []).map(c => {
        if (!c) return null;
        const card = typeof c === "object" ? c.card : c;
        return card ? { card, hidden: false, selected: false } : null;
    });

    return {
        players,
        nodes,
        pot: state.pot ?? 0,
        game_name: state.game_name ?? null,
        layout_name: state.layout_name ?? null,
    };
}

/**
 * Defensively unwrap POST /creator/start's response. The task spec says
 * it "returns the first ConstructionStepDTO" but a session_id has to
 * come from *somewhere* in that same response — this accepts either a
 * nested `{ session_id, step: {...} }` shape or a flattened
 * `{ session_id, domain, state, ... }` shape (session_id merged directly
 * onto the step fields), and warns loudly rather than failing silently
 * if neither matches, since a silent null step here is exactly what
 * produces an unresponsive "nothing to interact with" screen.
 */
function extractStartResult(raw) {
    if (!raw) {
        console.warn("[CAP][creator] POST /creator/start returned an empty response.");
        return { sessionId: null, step: null };
    }
    const sessionId = raw.session_id ?? raw.sessionId ?? null;
    const step = raw.step ?? (raw.domain ? raw : null);
    if (!sessionId) {
        console.warn("[CAP][creator] POST /creator/start response has no session_id.", raw);
    }
    if (!step) {
        console.warn("[CAP][creator] POST /creator/start response has no recognizable step (no `.step` and no `.domain`).", raw);
    } else {
        warnIfUnrecognizedStep(step, "POST /creator/start");
    }
    return { sessionId, step };
}

function warnIfUnrecognizedStep(step, source) {
    if (!step) return;
    if (!step.domain) {
        console.warn(`[CAP][creator] ${source} returned a step with no \`domain\` field.`, step);
        return;
    }
    if (!KNOWN_STEP_DOMAINS.includes(step.domain)) {
        console.warn(
            `[CAP][creator] ${source} returned an unrecognized domain "${step.domain}" ` +
            `(expected one of ${KNOWN_STEP_DOMAINS.join(", ")}). The wizard will show a raw debug ` +
            `panel for this step instead of a dedicated control.`,
            step
        );
    }
}

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

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

    // ── live/replayer editing state ─────────────────────────────
    const [editState, setEditState] = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [serverErrors, setServerErrors] = useState([]);
    const [editorUnavailable, setEditorUnavailable] = useState(false);
    const preEditSnapshot = useRef(null);

    // ── Variant config — READ-ONLY PREVIEW ──────────────────────
    const [variantConfig, setVariantConfig] = useState(null);
    const [configLoading, setConfigLoading] = useState(false);
    const [configError, setConfigError] = useState(null);

    useEffect(() => {
        if (!gameName) { setVariantConfig(null); return; }
        let cancelled = false;
        setConfigLoading(true);
        setConfigError(null);
        fetchVariantConfig(gameName)
            .then(cfg => { if (!cancelled) setVariantConfig(cfg); })
            .catch(e => { if (!cancelled) setConfigError(e.message); })
            .finally(() => { if (!cancelled) setConfigLoading(false); });
        return () => { cancelled = true; };
    }, [gameName]);

    const holeCardCount = variantConfig?.hole_cards ?? null;
    const boardNodeCount = variantConfig?.board_layout?.nodes ?? null;
    const creationPhasesPreview = variantConfig?.creation_phases ?? [];

    // ── Creation mode: SETUP (local, pre-session) ───────────────────
    const [setupPlayers, setSetupPlayers] = useState(null);
    const [dealerSeat, setDealerSeatState] = useState(1);

    const setSetupPlayerName = useCallback((seat, name) => {
        setSetupPlayers(prev => prev?.map(p => p.seat === seat ? { ...p, name } : p) ?? prev);
    }, []);

    const setSetupStack = useCallback((seat, amount) => {
        setSetupPlayers(prev => prev?.map(p => p.seat === seat ? { ...p, stack: Number(amount) } : p) ?? prev);
    }, []);

    const toggleSetupPlayerActive = useCallback((seat) => {
        setSetupPlayers(prev => prev?.map(p => p.seat === seat ? { ...p, _inactive: !p._inactive } : p) ?? prev);
    }, []);

    const setDealerSeat = useCallback((seat) => setDealerSeatState(seat), []);

    const canStartSession = (setupPlayers || []).filter(p => !p._inactive).length >= 2;

    // ── Creation mode: construction session ─────────────────────────
    const [sessionId, setSessionId] = useState(null);
    const [currentStep, setCurrentStep] = useState(null); // ConstructionStepDTO
    const [stepSubmitting, setStepSubmitting] = useState(false);
    const [stepError, setStepError] = useState(null);
    const [canUndo, setCanUndo] = useState(false);
    // Seats the author activated in the setup screen. The engine may
    // compact these to 1..N; seatMap below maps engine seat -> chosen seat.
    const [chosenSeats, setChosenSeats] = useState([]);    

    // Visible trail of graph steps seen so far this session — purely a
    // client-side progress display (there is no dedicated "which graph
    // node am I on" endpoint yet, see the backend-follow-up note), built
    // from the sequence of ConstructionStepDTOs the session has returned.
    const [stepTrail, setStepTrail] = useState([]);

    const pushTrailEntry = useCallback((step) => {
        if (!step) return;
        setStepTrail(prev => {
            const next = [...prev, { domain: step.domain ?? "(unknown)", seat: step.seat ?? null }];
            return next.length > MAX_TRAIL_LENGTH ? next.slice(next.length - MAX_TRAIL_LENGTH) : next;
        });
    }, []);

    const seatMap = useMemo(() => {
        const engineSeats = (currentStep?.state?.players ?? [])
            .map(p => p.seat)
            .sort((a, b) => a - b);
        const chosen = [...chosenSeats].sort((a, b) => a - b);
        const m = {};
        if (engineSeats.length > 0 && engineSeats.length === chosen.length) {
            engineSeats.forEach((s, i) => { m[s] = chosen[i]; });
        }
        return m;
    }, [currentStep, chosenSeats]);

    const mapSeat = useCallback((s) => seatMap[s] ?? s, [seatMap]);

    const constructionDisplay = useMemo(
        () => normalizeConstructionState(currentStep?.state, mapSeat),
        [currentStep, mapSeat]
    );

    // Step with `seat` translated to the author's chosen seat numbering.
    const stepView = useMemo(
        () => currentStep
            ? { ...currentStep, seat: currentStep.seat != null ? mapSeat(currentStep.seat) : null }
            : null,
        [currentStep, mapSeat]
    );

    const stepTrailView = useMemo(
        () => stepTrail.map(e => ({ ...e, seat: e.seat != null ? mapSeat(e.seat) : null })),
        [stepTrail, mapSeat]
    );

    const stepDomain = currentStep?.domain ?? null;
    const isSessionComplete = stepDomain === "COMPLETE";
    const isUnknownStepDomain = !!currentStep && !KNOWN_STEP_DOMAINS.includes(stepDomain);
    // True once a session exists but we have nothing usable to render —
    // this is the exact "Undo/Abandon but nothing else" failure mode;
    // surfacing it explicitly lets the UI show a diagnostic instead of a
    // silently blank screen.
    const sessionStuck = !!sessionId && !currentStep && !stepSubmitting;

    const startSession = useCallback(async () => {
        if (!setupPlayers || !canStartSession) return;
        setStepSubmitting(true);
        setStepError(null);
        try {
            const active = setupPlayers.filter(p => !p._inactive);
            setChosenSeats(active.map(p => p.seat));
            const seats = Object.fromEntries(active.map(p => [p.seat, p.name]));
            const initial_stacks = Object.fromEntries(active.map(p => [p.seat, p.stack]));
            const raw = await startConstruction({
                gameName,
                dealerSeat,
                seats,
                initialStacks: initial_stacks,
            });
            const { sessionId: sid, step } = extractStartResult(raw);
            setSessionId(sid);
            setCurrentStep(step);
            setStepTrail(step ? [{ domain: step.domain ?? "(unknown)", seat: step.seat ?? null }] : []);
            setCanUndo(false);
            if (sid && !step) {
                setStepError(
                    "Session started but the server didn't return a usable step — check the console " +
                    "for the raw response. Try Abandon and starting again, or ping the backend team."
                );
            }
        } catch (e) {
            setStepError(e.detail ?? e.message);
        } finally {
            setStepSubmitting(false);
        }
    }, [setupPlayers, canStartSession, gameName, dealerSeat]);

    const refreshSessionState = useCallback(async () => {
        if (!sessionId) return;
        setStepSubmitting(true);
        setStepError(null);
        try {
            const step = await fetchConstructionState(sessionId);
            warnIfUnrecognizedStep(step, "GET /creator/{session_id}/state");
            setCurrentStep(step);
        } catch (e) {
            setStepError(e.detail ?? e.message);
        } finally {
            setStepSubmitting(false);
        }
    }, [sessionId]);

    const submitStep = useCallback(async (stepResponse) => {
        if (!sessionId) return;
        setStepSubmitting(true);
        setStepError(null);
        try {
            const next = await submitConstructionStep(sessionId, stepResponse);
            warnIfUnrecognizedStep(next, "POST /creator/{session_id}/step");
            setCurrentStep(next);
            pushTrailEntry(next);
            setCanUndo(true);
        } catch (e) {
            setStepError(e.detail ?? e.message);
        } finally {
            setStepSubmitting(false);
        }
    }, [sessionId, pushTrailEntry]);

    const submitDealStep = useCallback((cards = []) => submitStep({ cards }), [submitStep]);
    const submitBettingAction = useCallback((type, amount) => submitStep({ type, amount: amount ?? null }), [submitStep]);
    const submitCardSelect = useCallback((selectedCards) => submitStep({ selected_cards: selectedCards }), [submitStep]);
    const submitCardPass = useCallback((selectedCards) => submitStep({ selected_cards: selectedCards }), [submitStep]);
    const submitBoolean = useCallback((boolValue) => submitStep({ bool_value: boolValue }), [submitStep]);
    const submitChoice = useCallback((choice) => submitStep({ choice }), [submitStep]);

    const undoStep = useCallback(async () => {
        if (!sessionId || !canUndo) return;
        setStepSubmitting(true);
        setStepError(null);
        try {
            const prev = await undoConstructionStep(sessionId);
            warnIfUnrecognizedStep(prev, "POST /creator/{session_id}/undo");
            setCurrentStep(prev);
            setStepTrail(trail => trail.length > 0 ? trail.slice(0, -1) : trail);
        } catch (e) {
            setStepError(e.detail ?? e.message);
        } finally {
            setStepSubmitting(false);
        }
    }, [sessionId, canUndo]);

    const finishSession = useCallback(async () => {
        if (!sessionId) return;
        setStepSubmitting(true);
        setStepError(null);
        try {
            const result = await finishConstruction(sessionId);
            setSessionId(null);
            setCurrentStep(null);
            setSetupPlayers(null);
            setStepTrail([]);
            setChosenSeats([]);
            setIsEditing(false);
            onApplied?.(result);
        } catch (e) {
            setStepError(e.detail ?? e.message);
        } finally {
            setStepSubmitting(false);
        }
    }, [sessionId, onApplied]);

    const abandonSession = useCallback(async () => {
        if (sessionId) {
            try { await abandonConstruction(sessionId); } catch (_) { /* best-effort */ }
        }
        setSessionId(null);
        setCurrentStep(null);
        setSetupPlayers(null);
        setStepTrail([]);
        setChosenSeats([]);
        setStepError(null);
        setCanUndo(false);
        setIsEditing(false);
        onCancelled?.();
    }, [sessionId, onCancelled]);

    // ── Editing an existing hypothetical hand — not yet supported ───
    const [editingHandId, setEditingHandId] = useState(null);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [loadExistingError, setLoadExistingError] = useState(null);

    const loadExistingHand = useCallback(async (handId) => {
        setLoadingExisting(true);
        setLoadExistingError(null);
        try {
            throw new Error(
                "Editing an existing hand in the Creator isn't supported yet under the new " +
                "session-based wizard — this needs a backend endpoint to resume a saved hand " +
                "into a fresh /creator session."
            );
        } catch (e) {
            setLoadExistingError(e.message);
        } finally {
            setLoadingExisting(false);
        }
    }, []);

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
                if (e.isEditorUnavailable) setEditorUnavailable(true);
                setServerErrors([e.isEditorUnavailable ? e.message : (e.detail ?? e.message)]);
            }
        } else if (mode === "replayer") {
            const initialState = editStateFromReplayFrame(frame, handData);
            setEditState(initialState);
            setIsEditing(true);
        } else if (mode === "creation") {
            setSessionId(null);
            setCurrentStep(null);
            setStepError(null);
            setCanUndo(false);
            setStepTrail([]);
            setDealerSeatState(1);
            setSetupPlayers(blankSetupPlayers(6, DEFAULT_STARTING_STACK));
            setIsEditing(true);
        }
    }, [mode, hand, frame, handData, holeCardCount]);

    // ── Move card between zones (live/replayer editing only) ───────
    const moveCard = useCallback((card, _fromZone, toZone) => {
        setEditState(prev => {
            if (!prev) return prev;
            let next = removeCardFromState(prev, card);
            next = placeCardInZone(next, card, toZone);
            return next;
        });
        setValidationErrors([]);
        setServerErrors([]);
    }, []);

    const setStack = useCallback((seat, amount) => {
        setEditState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.seat === seat ? { ...p, stack: Number(amount) } : p
            ),
        }));
    }, []);

    const setPot = useCallback((amount) => {
        setEditState(prev => ({ ...prev, pot: Number(amount) }));
    }, []);

    const setPlayerName = useCallback((seat, name) => {
        setEditState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.seat === seat ? { ...p, name } : p
            ),
        }));
    }, []);

    const validate = useCallback(() => {
        const errs = validateEditState(editState);
        setValidationErrors(errs);
        return errs.length === 0;
    }, [editState]);

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
            if (e.isEditorUnavailable) setEditorUnavailable(true);
            setServerErrors([e.isEditorUnavailable ? e.message : (e.detail ?? e.message)]);
        } finally {
            setSubmitting(false);
        }
    }, [editState, validate, onApplied]);

    const playFromHere = useCallback(async () => {
        if (!validate()) return;
        setSubmitting(true);
        setServerErrors([]);
        try {
            const req = buildEditRequest(editState);
            const result = await loadEdit(req);
            setIsEditing(false);
            onApplied?.(result);
        } catch (e) {
            if (e.isEditorUnavailable) setEditorUnavailable(true);
            setServerErrors([e.isEditorUnavailable ? e.message : (e.detail ?? e.message)]);
        } finally {
            setSubmitting(false);
        }
    }, [editState, validate, onApplied]);

    const cancelEditMode = useCallback(async () => {
        if (mode === "live") {
            try {
                await cancelEdit();
            } catch (_) { /* best-effort, including 501 */ }
            setIsEditing(false);
            setEditState(null);
            setValidationErrors([]);
            setServerErrors([]);
            onCancelled?.();
        } else if (mode === "creation") {
            await abandonSession();
        } else {
            setIsEditing(false);
            setEditState(null);
            setValidationErrors([]);
            setServerErrors([]);
            onCancelled?.();
        }
    }, [mode, onCancelled, abandonSession]);

    return {
        isEditing,
        editState,
        validationErrors,
        serverErrors,
        submitting,
        editorUnavailable,
        beginEdit: beginEditMode,
        moveCard,
        setStack,
        setPot,
        setPlayerName,
        validate,
        applyEdit: applyEditMode,
        playFromHere,
        cancelEdit: cancelEditMode,
        setEditState,

        variantConfig,
        configLoading,
        configError,
        holeCardCount,
        boardNodeCount,
        creationPhasesPreview,

        setupPlayers,
        setSetupPlayerName,
        setSetupStack,
        toggleSetupPlayerActive,
        canStartSession,
        dealerSeat,
        setDealerSeat,

        sessionId,
        startSession,
        refreshSessionState,
        currentStep: stepView,
        stepDomain,
        isSessionComplete,
        isUnknownStepDomain,
        sessionStuck,
        constructionDisplay,
        stepSubmitting,
        stepError,
        canUndo,
        undoStep,
        stepTrail: stepTrailView,
        submitDealStep,
        submitBettingAction,
        submitCardSelect,
        submitCardPass,
        submitBoolean,
        submitChoice,
        finishSession,
        abandonSession,

        editingHandId,
        loadExistingHand,
        loadingExisting,
        loadExistingError,
    };
}