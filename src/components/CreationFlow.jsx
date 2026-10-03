import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    pointerWithin,
    rectIntersection,
} from "@dnd-kit/core";

import PokerTable from "./PokerTable";
import DraggableCard from "./DraggableCard";
import Card from "./Card";
import PlayerActionPanel from "./PlayerActionPanel";
import CardSelectPanel from "./CardSelectPanel";
import BooleanDecisionPanel from "./BooleanDecisionPanel";
import { useHandEditor } from "../hooks/useHandEditor";
import { getVariants } from "../api/pokerApi";
import "../css/HandEditor.css";
import "../css/CreationFlow.css";

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const FULL_DECK = SUITS.flatMap(s => RANKS.map(r => `${r}${s}`));

const EMPTY_SELECTION = {};
const EMPTY_ARRAY = [];

const padStaged = (arr, n) => Array.from({ length: n }, (_, i) => arr?.[i] ?? null);

// Canonical card format = the server's ("Ah": upper rank, lower suit), so
// comparisons never fail on suit case ("AS" vs "As" vs "Ah").
const canon = (c) => (typeof c === "string" && c.length === 2)
    ? c[0].toUpperCase() + c[1].toLowerCase()
    : c;
const cardStr = (c) => canon((c && typeof c === "object" ? c.card : c) ?? null);

// ─────────────────────────────────────────────────────────────────
// DealDeck — compact, self-contained card picker for deal steps.
// Draggable cards live in fixed-size boxes so the scaled-down cards
// actually shrink the layout (CSS transform alone doesn't).
// ─────────────────────────────────────────────────────────────────
const DealDeck = ({ available, onPick, scale = 0.55 }) => {
    const probeRef = useRef(null);
    const [base, setBase] = useState({ w: 50, h: 72 });

    // Measure the real unscaled card size once (falls back to 50x72).
    useEffect(() => {
        const img = probeRef.current?.querySelector("img");
        if (!img) return;
        const measure = () => {
            const r = img.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) setBase({ w: r.width, h: r.height });
        };
        measure();
        img.addEventListener("load", measure);
        return () => img.removeEventListener("load", measure);
    }, []);

    const { setNodeRef, isOver } = useDroppable({
        id: "card-selector",
        data: { variant: "selector" },
    });

    const availSet = useMemo(() => new Set(available), [available]);
    const w = Math.round(base.w * scale);
    const h = Math.round(base.h * scale);

    return (
        <div
            ref={setNodeRef}
            style={{
                position: "relative",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 14px",
                padding: 6,
                borderRadius: 6,
                background: "#111827",
                border: isOver ? "2px solid #3b82f6" : "1px solid rgba(128,128,128,0.3)",
            }}
        >
            <div ref={probeRef} aria-hidden="true"
                 style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}>
                <Card card="AS" scale={1} isClickable={false} />
            </div>

            {SUITS.map(suit => (
                <div key={suit} style={{ display: "flex", gap: 2 }}>
                    {RANKS.map(rank => {
                        const card = `${rank}${suit}`;
                        const free = availSet.has(card);
                        return (
                            <div
                                key={card}
                                style={{
                                    width: w, height: h, flex: "0 0 auto",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    boxSizing: "border-box",
                                    ...(free ? null : { border: "1px dashed rgba(128,128,128,0.35)", borderRadius: 3 }),
                                }}
                            >
                                {free && (
                                    <DraggableCard id={card} source={{ variant: "selector" }} onClick={() => onPick(card)}>
                                        <Card card={card} scale={scale} isClickable={false} showOutline={false} />
                                    </DraggableCard>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

const dealStyles = {
    panel: {
        display: "flex", flexDirection: "column", gap: 6,
        padding: "6px 12px", flex: "0 0 auto",
        borderTop: "1px solid rgba(128,128,128,0.3)",
    },
    hint: { fontSize: 12, opacity: 0.75 },
    row: { display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" },
    deck: { flex: "1 1 420px", minWidth: 0 },
    side: { display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" },
    status: { fontSize: 13 },
    buttons: { display: "flex", gap: 6, flexWrap: "wrap" },
};

const CreationFlow = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const handIdParam = searchParams.get("handId");

    const [variants, setVariants] = useState([]);
    const [gameName, setGameName]   = useState("");
    const [started, setStarted]     = useState(false);

    useEffect(() => {
        getVariants().then(({ variants: v }) => {
            setVariants(v);
            const isHoldem = (x) => x.toLowerCase() === "holdem";
            const pick = v.find(isHoldem) ?? v.find(x => x.toLowerCase().includes("holdem")) ?? v[0];
            if (pick) setGameName(pick);
        }).catch(() => {});
    }, []);

    const editor = useHandEditor({
        mode: "creation",
        gameName,
        onApplied: () => navigate("/tutorial"),
        onCancelled: () => navigate("/tutorial"),
    });

    const {
        variantConfig,
        configLoading,
        holeCardCount,
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
        currentStep,
        stepDomain,
        isSessionComplete,
        isUnknownStepDomain,
        sessionStuck,
        constructionDisplay,
        stepSubmitting,
        stepError,
        canUndo,
        undoStep,
        stepTrail,
        submitDealStep,
        submitBettingAction,
        submitCardSelect,
        submitCardPass,
        submitBoolean,
        submitChoice,
        finishSession,
    } = editor;

    // ── §3.5.1-equivalent load path — not supported yet under the new
    // session API (see useHandEditor.loadExistingHand).
    const loadedHandIdRef = React.useRef(null);
    useEffect(() => {
        if (!handIdParam) return;
        const id = Number(handIdParam);
        if (Number.isNaN(id) || loadedHandIdRef.current === id) return;
        loadedHandIdRef.current = id;
        editor.loadExistingHand(id);
    }, [handIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleStart = () => {
        editor.beginEdit();
        setStarted(true);
    };

    // ─────────────────────────────────────────────────────────────
    // SETUP screen (local, pre-session)
    // ─────────────────────────────────────────────────────────────

    const setupSeatActiveMap = useMemo(() => {
        if (!setupPlayers) return {};
        const map = {};
        for (const p of setupPlayers) map[p.seat] = !p._inactive;
        return map;
    }, [setupPlayers]);

    const setupDisplayPlayers = useMemo(() => {
        if (!setupPlayers) return {};
        const players = {};
        for (const p of setupPlayers) {
            if (p._inactive) continue;
            players[p.seat] = {
                seat: p.seat,
                name: p.name,
                stack: p.stack,
                bet: 0,
                folded: false,
                hand: Array.from({ length: holeCardCount ?? 0 }, () => null),
            };
        }
        return players;
    }, [setupPlayers, holeCardCount]);

    // ─────────────────────────────────────────────────────────────
    // Construction-session display (post "Start Hand")
    // ─────────────────────────────────────────────────────────────

    const actingSeat = currentStep?.seat ?? null;

    const [selectedCards, setSelectedCards] = useState(EMPTY_SELECTION);
    useEffect(() => { setSelectedCards(EMPTY_SELECTION); }, [currentStep]);

    const togglePlayerCard = useCallback((seatNum, card) => {
        if (seatNum !== actingSeat) return;
        setSelectedCards(prev => {
            const cur = prev[seatNum] || [];
            const next = cur.includes(card) ? cur.filter(c => c !== card) : [...cur, card];
            return { ...prev, [seatNum]: next };
        });
    }, [actingSeat]);

    // ── DEAL_HOLE / DEAL_BOARD manual dealing ───────────────────────
    // The engine may already hold random cards for every seat/node by the
    // time a deal step is surfaced. During deal steps we only SHOW cards
    // the author has already confirmed (revealLog); everything else is an
    // empty slot. The author either presses "Deal Random" (accepts the
    // engine's cards) or places cards by hand and confirms.
    const isDealStep = stepDomain === "DEAL_HOLE" || stepDomain === "DEAL_BOARD";
    const stepIdx = stepTrail.length - 1; // index of the current step in this session

    // revealLog entries: { idx, hole: {seat: string[]}, nodes: {nodeIdx: string} }
    // Only entries from EARLIER steps (idx < stepIdx) count as revealed, so
    // Undo naturally "un-reveals" cards.
    const [revealLog, setRevealLog] = useState(EMPTY_ARRAY);
    useEffect(() => { if (!sessionId) setRevealLog(EMPTY_ARRAY); }, [sessionId]);

    // On every non-deal step, everything on the table is by definition visible.
    useEffect(() => {
        if (stepIdx < 0 || !currentStep || !constructionDisplay || isDealStep) return;
        const hole = {};
        Object.entries(constructionDisplay.players).forEach(([seat, p]) => {
            hole[seat] = (p.hand || []).map(cardStr).filter(Boolean);
        });
        const nodes = {};
        (constructionDisplay.nodes || []).forEach((c, i) => { const s = cardStr(c); if (s) nodes[i] = s; });
        setRevealLog(prev => [...prev.filter(e => e.idx !== stepIdx), { idx: stepIdx, hole, nodes }]);
    }, [currentStep, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

    const revealed = useMemo(() => {
        const hole = {};
        const nodes = {};
        revealLog
            .filter(e => e.idx < stepIdx)
            .sort((a, b) => a.idx - b.idx)
            .forEach(e => {
                Object.entries(e.hole || {}).forEach(([seat, cards]) => {
                    hole[seat] = [...new Set([...(hole[seat] || []), ...cards])];
                });
                Object.assign(nodes, e.nodes || {});
            });
        return { hole, nodes };
    }, [revealLog, stepIdx]);

    // Engine hands / nodes filtered down to what the author has seen.
    const revealedHands = useMemo(() => {
        const out = {};
        Object.entries(constructionDisplay?.players ?? {}).forEach(([seat, p]) => {
            const known = new Set(revealed.hole[seat] ?? []);
            out[seat] = (p.hand || []).filter(c => c && known.has(cardStr(c)));
        });
        return out;
    }, [constructionDisplay, revealed]);

    const revealedNodes = useMemo(
        () => (constructionDisplay?.nodes ?? []).map((c, i) =>
            c && revealed.nodes[i] === cardStr(c) ? c : null),
        [constructionDisplay, revealed]
    );

    // staged[i] = card string | null, for slot i of the current deal step
    const [staged, setStaged] = useState(EMPTY_ARRAY);
    const [activeDrag, setActiveDrag] = useState(null);
    useEffect(() => { setStaged(EMPTY_ARRAY); setActiveDrag(null); }, [currentStep]);

    const dealInfo = useMemo(() => {
        if (!isDealStep || !currentStep || !constructionDisplay) return null;
        const fromStep = (currentStep.dealt_cards ?? []).map(canon);

        if (stepDomain === "DEAL_HOLE") {
            const seat = currentStep.seat;
            const baseHand = revealedHands[seat] ?? [];
            const known = new Set(baseHand.map(cardStr));
            const pending = (constructionDisplay.players?.[seat]?.hand || [])
                .map(cardStr).filter(c => c && !known.has(c));
            const dealt = fromStep.length ? fromStep : pending;
            // Trust what the engine actually dealt for THIS step; step.count can be
            // the per-player total, which would add extra slots to a seat that
            // already holds cards.
            const remaining = Math.max(0, (holeCardCount ?? Infinity) - baseHand.length);
            const count = dealt.length > 0
                ? dealt.length
                : Math.min(currentStep.count ?? 0, Number.isFinite(remaining) ? remaining : Infinity);
            return { kind: "hole", seat, count, baseHand, nodeIndices: [], dealt };
        }

        const nodeIndices = currentStep.board_node_indices ?? [];
        const engineNodes = constructionDisplay.nodes ?? [];
        const pending = nodeIndices.map(i => cardStr(engineNodes[i])).filter(Boolean);
        const dealt = fromStep.length ? fromStep : pending;
        const count = currentStep.count ?? nodeIndices.length;
        return { kind: "board", seat: null, count, baseHand: [], nodeIndices, dealt };
    }, [isDealStep, stepDomain, currentStep, constructionDisplay, revealedHands, holeCardCount]);

    const stagedPadded = useMemo(
        () => padStaged(staged, dealInfo?.count ?? 0),
        [staged, dealInfo]
    );
    const filledCount = stagedPadded.filter(Boolean).length;
    const allFilled = !!dealInfo && dealInfo.count > 0 && filledCount === dealInfo.count;

    // pool     = every card the author may pick (incl. cards the engine is
    //            holding for seats/nodes not yet revealed)
    // safePool = only cards the engine reports as unused (+ this step's dealt
    //            cards) — used for "fill rest randomly"
    const { pool, safePool } = useMemo(() => {
        if (!dealInfo || !currentStep) return { pool: EMPTY_ARRAY, safePool: EMPTY_ARRAY };

        const shown = new Set(stagedPadded.filter(Boolean));
        Object.values(revealedHands).forEach(h => h.forEach(c => shown.add(cardStr(c))));
        revealedNodes.forEach(c => { if (c) shown.add(cardStr(c)); });

        const engineAll = new Set();
        Object.values(constructionDisplay?.players ?? {}).forEach(p =>
            (p.hand || []).forEach(c => { const s = cardStr(c); if (s) engineAll.add(s); }));
        (constructionDisplay?.nodes ?? []).forEach(c => { const s = cardStr(c); if (s) engineAll.add(s); });

        const free = FULL_DECK.filter(c => !shown.has(c));
        if (!currentStep.eligible_cards) return { pool: free, safePool: free };

        const elig = new Set([...currentStep.eligible_cards.map(canon), ...dealInfo.dealt]);
        return {
            pool: free.filter(c => elig.has(c) || engineAll.has(c)),
            safePool: free.filter(c => elig.has(c)),
        };
    }, [dealInfo, currentStep, constructionDisplay, revealedHands, revealedNodes, stagedPadded]);

    // Map a droppable/draggable's data to a staged slot index (or null).
    const slotFromData = useCallback((data) => {
        if (!data || !dealInfo) return null;
        if (dealInfo.kind === "hole" && data.variant === "player" && Number(data.location) === dealInfo.seat) {
            const s = data.index - dealInfo.baseHand.length;
            return s >= 0 && s < dealInfo.count ? s : null;
        }
        if (dealInfo.kind === "board" && data.variant === "board") {
            const s = dealInfo.nodeIndices.indexOf(data.index);
            return s >= 0 ? s : null;
        }
        return null;
    }, [dealInfo]);

    const placeInFirstEmpty = useCallback((card) => {
        if (!dealInfo) return;
        setStaged(prev => {
            const next = padStaged(prev, dealInfo.count);
            if (next.includes(card)) return next;
            const i = next.indexOf(null);
            if (i === -1) return next;
            next[i] = card;
            return next;
        });
    }, [dealInfo]);

    const removeStagedAt = useCallback((slot) => {
        if (!dealInfo || slot == null || slot < 0) return;
        setStaged(prev => {
            const next = padStaged(prev, dealInfo.count);
            next[slot] = null;
            return next;
        });
    }, [dealInfo]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
    );

    const collisionDetection = useCallback((args) => {
        const hits = pointerWithin(args);
        return hits.length > 0 ? hits : rectIntersection(args);
    }, []);

    const handleDragStart = useCallback((event) => {
        setActiveDrag(event.active.data.current?.card ?? null);
    }, []);

    const handleDragEnd = useCallback((event) => {
        setActiveDrag(null);
        if (!dealInfo) return;

        const src = event.active.data.current;
        const dst = event.over?.data.current;
        if (!src?.card) return;

        const fromSelector = src.variant === "selector";
        const fromSlot = fromSelector ? null : slotFromData(src);
        // Dragging a card that isn't one of the staged ones (e.g. an already-confirmed card)
        if (!fromSelector && fromSlot == null) return;

        const toSlot = slotFromData(dst);

        setStaged(prev => {
            const next = padStaged(prev, dealInfo.count);
            if (toSlot != null) {
                const displaced = next[toSlot];
                if (fromSlot != null) next[fromSlot] = displaced ?? null; // swap
                next[toSlot] = src.card;
            } else if (fromSlot != null) {
                next[fromSlot] = null; // dropped on selector / elsewhere → back to deck
            }
            return next;
        });
    }, [dealInfo, slotFromData]);

    const handleDragCancel = useCallback(() => setActiveDrag(null), []);

    // Remember which cards this deal step revealed so later steps show them.
    const recordDeal = (cards) => {
        if (!dealInfo) return;
        const entry = { idx: stepIdx, hole: {}, nodes: {} };
        if (dealInfo.kind === "hole") entry.hole[dealInfo.seat] = cards.filter(Boolean);
        else dealInfo.nodeIndices.forEach((ni, i) => { if (cards[i]) entry.nodes[ni] = cards[i]; });
        setRevealLog(prev => [...prev.filter(e => e.idx !== stepIdx), entry]);
    };

    const handleDealRandom = () => {
        if (!dealInfo) return;
        if (filledCount === 0) {
            // Accept the engine's random deal as-is.
            recordDeal(dealInfo.dealt);
            submitDealStep([]);
            return;
        }
        // Some slots placed by hand → fill the rest at random.
        const rest = [...safePool];
        const filled = stagedPadded.map(c =>
            c ?? rest.splice(Math.floor(Math.random() * rest.length), 1)[0] ?? null);
        if (filled.every(Boolean)) {
            recordDeal(filled);
            submitDealStep(filled);
        }
    };

    const handleDealConfirm = () => {
        if (!allFilled) return;
        recordDeal(stagedPadded);
        submitDealStep(stagedPadded);
    };

    // ── Table data ──────────────────────────────────────────────────
    const displayPlayersWithSelection = useMemo(() => {
        if (!constructionDisplay) return {};
        const sel = selectedCards[actingSeat] || [];
        const players = {};
        Object.entries(constructionDisplay.players).forEach(([seat, p]) => {
            const seatNum = Number(seat);
            let hand = p.hand || [];
            if (isDealStep) {
                // Only already-confirmed cards; everything else is an empty slot.
                hand = [...(revealedHands[seat] ?? [])];
                if (dealInfo?.kind === "hole" && seatNum === dealInfo.seat) {
                    hand = [
                        ...hand,
                        ...stagedPadded.map(c => (c ? { card: c, hidden: false, selected: false } : null)),
                    ];
                }
                while (hand.length < (holeCardCount ?? 0)) hand.push(null);
            }
            players[seat] = {
                ...p,
                hand: hand.map(c =>
                    c ? { ...c, selected: seatNum === actingSeat && sel.includes(c.card) } : null
                ),
            };
        });
        return players;
    }, [constructionDisplay, selectedCards, actingSeat, isDealStep, dealInfo, revealedHands, stagedPadded, holeCardCount]);

    const displayNodes = useMemo(() => {
        const nodes = constructionDisplay?.nodes ?? [];
        if (!isDealStep) return nodes;
        const size = Math.max(nodes.length, ...(dealInfo?.nodeIndices ?? []).map(i => i + 1));
        const out = Array.from({ length: size }, (_, i) => revealedNodes[i] ?? null);
        if (dealInfo?.kind === "board") {
            dealInfo.nodeIndices.forEach((nodeIdx, i) => {
                out[nodeIdx] = stagedPadded[i]
                    ? { card: stagedPadded[i], hidden: false, selected: false }
                    : null;
            });
        }
        return out;
    }, [constructionDisplay, isDealStep, dealInfo, revealedNodes, stagedPadded]);

    // ── CARD_SELECT / CARD_PASS confirm ─────────────────────────────
    const cardSelectOption = (stepDomain === "CARD_SELECT" || stepDomain === "CARD_PASS")
        ? (currentStep?.options?.[0] ?? null)
        : null;

    const handleCardSelectConfirm = () => {
        const cards = selectedCards[actingSeat] || [];
        if (stepDomain === "CARD_PASS") submitCardPass(cards);
        else submitCardSelect(cards);
    };

    const handleCardSelectClear = () => {
        setSelectedCards(prev => ({ ...prev, [actingSeat]: [] }));
    };

    // ── Step trail (graph progress) ─────────────────────────────────
    const trailBar = stepTrail.length > 0 && (
        <div className="creation-flow__trail">
            <span className="creation-flow__trail-label">Progress:</span>
            {stepTrail.map((entry, i) => {
                const isCurrent = i === stepTrail.length - 1;
                return (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="creation-flow__trail-arrow">→</span>}
                        <span className={`creation-flow__trail-chip ${isCurrent ? "creation-flow__trail-chip--current" : ""}`}>
                            {entry.domain}{entry.seat != null ? ` (seat ${entry.seat})` : ""}
                        </span>
                    </React.Fragment>
                );
            })}
        </div>
    );

    if (handIdParam && (editor.loadingExisting || editor.loadExistingError)) {
        return (
            <div className="creation-flow__center">
                <div className="creation-flow__subtitle">
                    {editor.loadExistingError ? "Can't open this hand for editing" : "Loading hand…"}
                </div>
                {editor.loadExistingError && (
                    <div className="creation-flow__hint">{editor.loadExistingError}</div>
                )}
                <button className="editor-btn editor-btn--cancel" onClick={() => navigate("/tutorial")}>
                    Back to Tutorial
                </button>
            </div>
        );
    }

    if (!started) {
        return (
            <div className="creation-flow__center">
                <div className="creation-flow__title">Create a Tutorial Hand</div>

                <div className="creation-flow__field">
                    <label className="creation-flow__field-label">Game:</label>
                    <select
                        className="creation-flow__select"
                        value={gameName}
                        onChange={e => setGameName(e.target.value)}
                    >
                        {variants.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>

                <button
                    className="creation-flow__start-btn"
                    onClick={handleStart}
                    disabled={!gameName || configLoading}
                >
                    {configLoading ? "Loading…" : "Start"}
                </button>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // SETUP (post "Start", pre-session)
    // ─────────────────────────────────────────────────────────────

    if (!sessionId) {
        const setupTable = (
            <PokerTable
                players={setupDisplayPlayers}
                boardCards={[]}
                nodes={[]}
                layoutName={variantConfig?.layout_name ?? gameName}
                points={[]}
                showdown={null}
                dealerSeat={dealerSeat}
                actionSeat={null}
                isEditing={true}
                holeCardCount={holeCardCount}
                seatActive={setupSeatActiveMap}
                onToggleSeatActive={toggleSetupPlayerActive}
                onSeatClick={() => {}}
                onPlayerCardClick={() => {}}
                onPlayerSlotClick={() => {}}
                onBoardCardClick={() => {}}
                onBoardSlotClick={() => {}}
                onBoardAreaClick={() => {}}
                onNameChange={setSetupPlayerName}
                onStackChange={setSetupStack}
                loading={false}
            />
        );

        return (
            <div className="creation-flow">
                <div className="creation-flow__banner">
                    Setting Up — add at least 2 players, set stacks, then Start Hand
                </div>

                {stepError && <div className="creation-flow__error-bar">⚠ {stepError}</div>}

                <div className="creation-flow__body">
                    {setupTable}
                </div>

                <div className="creation-flow__footer-bar">
                    <label className="creation-flow__field-label">
                        Dealer seat:
                        <select
                            className="creation-flow__select creation-flow__dealer-select"
                            value={dealerSeat}
                            onChange={e => setDealerSeat(Number(e.target.value))}
                        >
                            {(setupPlayers || [])
                                .filter(p => !p._inactive)
                                .map(p => <option key={p.seat} value={p.seat}>{p.name} (seat {p.seat})</option>)}
                        </select>
                    </label>

                    <div className="creation-flow__footer-actions">
                        <button className="editor-btn editor-btn--cancel" onClick={editor.cancelEdit}>
                            Cancel
                        </button>
                        <button
                            className="editor-btn editor-btn--apply"
                            onClick={startSession}
                            disabled={!canStartSession || stepSubmitting}
                        >
                            {stepSubmitting ? "Starting…" : "Start Hand ▶"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Session-driven stepping
    // ─────────────────────────────────────────────────────────────

    if (sessionStuck) {
        return (
            <div className="creation-flow">
                <div className="creation-flow__banner">
                    <span>Session started, but no step data came back</span>
                    <div className="creation-flow__banner-actions">
                        <button className="editor-btn editor-btn--cancel" onClick={editor.cancelEdit}>
                            ✕ Abandon
                        </button>
                    </div>
                </div>
                <div className="creation-flow__debug-panel">
                    <div className="creation-flow__debug-panel-title">
                        Nothing to render for session {sessionId}
                    </div>
                    <div>
                        POST /creator/start (or the most recent step call) didn't return a step the
                        frontend could parse. Check the browser console for a
                        <code>[CAP][creator]</code> warning with the raw response — that will show
                        exactly what came back.
                    </div>
                    <button
                        className="editor-btn editor-btn--apply creation-flow__debug-panel-action"
                        onClick={refreshSessionState}
                        disabled={stepSubmitting}
                    >
                        {stepSubmitting ? "Retrying…" : "Retry — GET /creator/{session_id}/state"}
                    </button>
                </div>
            </div>
        );
    }

    const sessionTable = (
        <PokerTable
            players={displayPlayersWithSelection}
            boardCards={[]}
            nodes={displayNodes}
            layoutName={constructionDisplay?.layout_name ?? variantConfig?.layout_name ?? gameName}
            points={[]}
            showdown={null}
            dealerSeat={dealerSeat}
            actionSeat={actingSeat}
            isEditing={false}
            onSeatClick={() => {}}
            onPlayerCardClick={(seatNum, cardIndex) => {
                if (dealInfo?.kind === "hole") {
                    // Click a staged card to send it back to the selector
                    if (seatNum === dealInfo.seat) removeStagedAt(cardIndex - dealInfo.baseHand.length);
                    return;
                }
                if (!(stepDomain === "CARD_SELECT" || stepDomain === "CARD_PASS")) return;
                const card = constructionDisplay?.players?.[seatNum]?.hand?.[cardIndex]?.card;
                if (card) togglePlayerCard(seatNum, card);
            }}
            onPlayerSlotClick={() => {}}
            onBoardCardClick={(nodeIndex) => {
                if (dealInfo?.kind === "board") removeStagedAt(dealInfo.nodeIndices.indexOf(nodeIndex));
            }}
            onBoardSlotClick={() => {}}
            onBoardAreaClick={() => {}}
            loading={false}
        />
    );

    const actingPlayer = actingSeat != null ? constructionDisplay?.players?.[actingSeat] : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
        <div className="creation-flow">

            <div className="creation-flow__banner">
                <span>{stepBannerText(stepDomain)}</span>
                <div className="creation-flow__banner-actions">
                    <button
                        className="editor-btn editor-btn--cancel"
                        onClick={undoStep}
                        disabled={!canUndo || stepSubmitting}
                    >
                        ◀ Undo
                    </button>
                    <button className="editor-btn editor-btn--cancel" onClick={editor.cancelEdit}>
                        ✕ Abandon
                    </button>
                </div>
            </div>

            {trailBar}

            {stepError && <div className="creation-flow__error-bar">⚠ {stepError}</div>}

            <div className="creation-flow__body">
                <div className="creation-flow__pot">Pot: ${constructionDisplay?.pot ?? 0}</div>
                {sessionTable}
            </div>

            {/* ── DEAL_HOLE / DEAL_BOARD ── */}
            {dealInfo && (
                <div style={dealStyles.panel}>
                    <div style={dealStyles.hint}>
                        {dealInfo.kind === "hole"
                            ? `Deal to ${constructionDisplay?.players?.[dealInfo.seat]?.name ?? `seat ${dealInfo.seat}`}`
                            : "Deal to the board"}
                        {" — drag cards into the slots, or click a card to fill the next empty slot. Click a placed card to remove it."}
                    </div>
                    <div style={dealStyles.row}>
                        <div style={dealStyles.deck}>
                            <DealDeck available={pool} onPick={placeInFirstEmpty} />
                        </div>
                        <div style={dealStyles.side}>
                            <span style={dealStyles.status}>
                                Placed {filledCount} / {dealInfo.count}
                            </span>
                            <div style={dealStyles.buttons}>
                                <button
                                    className="editor-btn editor-btn--cancel"
                                    onClick={() => setStaged(EMPTY_ARRAY)}
                                    disabled={filledCount === 0 || stepSubmitting}
                                >
                                    Clear
                                </button>
                                <button
                                    className="editor-btn editor-btn--cancel"
                                    onClick={handleDealRandom}
                                    disabled={stepSubmitting || allFilled}
                                >
                                    {filledCount === 0 ? "🎲 Deal Random" : "🎲 Fill Rest Randomly"}
                                </button>
                                <button
                                    className="editor-btn editor-btn--apply"
                                    onClick={handleDealConfirm}
                                    disabled={!allFilled || stepSubmitting}
                                >
                                    {stepSubmitting ? "…" : "Confirm ▶"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── BETTING ── */}
            {stepDomain === "BETTING" && actingPlayer && (
                <PlayerActionPanel
                    player={actingPlayer}
                    options={currentStep?.options || []}
                    toCall={currentStep?.to_call}
                    disabled={stepSubmitting}
                    onAction={submitBettingAction}
                />
            )}

            {/* ── CARD_SELECT / CARD_PASS ── */}
            {(stepDomain === "CARD_SELECT" || stepDomain === "CARD_PASS") && actingPlayer && (
                <CardSelectPanel
                    player={actingPlayer}
                    minCount={cardSelectOption?.min_count}
                    maxCount={cardSelectOption?.max_count}
                    selectedCards={selectedCards[actingSeat] || []}
                    onConfirm={handleCardSelectConfirm}
                    onClear={handleCardSelectClear}
                    submitting={stepSubmitting}
                    error={stepError}
                />
            )}

            {/* ── BOOLEAN ── */}
            {stepDomain === "BOOLEAN" && actingPlayer && (
                <BooleanDecisionPanel
                    player={actingPlayer}
                    prompt={currentStep?.context?.prompt}
                    options={currentStep?.options || []}
                    onDecide={submitBoolean}
                    submitting={stepSubmitting}
                    error={stepError}
                />
            )}

            {/* ── CHOICE ── */}
            {stepDomain === "CHOICE" && (
                <div className="creation-flow__footer-panel">
                    {(currentStep?.options || []).map(opt => (
                        <button
                            key={opt.action_name ?? opt.value ?? opt.label}
                            className="editor-btn editor-btn--apply creation-flow__choice-btn"
                            disabled={stepSubmitting}
                            onClick={() => submitChoice(opt.action_name ?? opt.value)}
                        >
                            {opt.label ?? opt.action_name ?? opt.value}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Unknown domain — diagnostic instead of a blank panel ── */}
            {currentStep && isUnknownStepDomain && (
                <div className="creation-flow__debug-panel">
                    <div className="creation-flow__debug-panel-title">
                        Unrecognized step domain: "{stepDomain ?? "(missing)"}"
                    </div>
                    <div>
                        The wizard doesn't have a control for this domain yet. Raw step data below —
                        share this with the backend team if it's unexpected.
                    </div>
                    <pre>{JSON.stringify(currentStep, null, 2)}</pre>
                </div>
            )}

            {/* ── COMPLETE ── */}
            {isSessionComplete && (
                <div className="creation-flow__footer-panel">
                    <span className="creation-flow__complete-msg">Hand construction complete.</span>
                    <div className="creation-flow__footer-panel-actions">
                        <button
                            className="editor-btn editor-btn--save"
                            onClick={finishSession}
                            disabled={stepSubmitting}
                        >
                            {stepSubmitting ? "Saving…" : "Finish & Save Hand"}
                        </button>
                    </div>
                </div>
            )}
        </div>

        <DragOverlay>
            {activeDrag ? (
                <Card card={activeDrag} scale={0.9} isHidden={false} isClickable={false} />
            ) : null}
        </DragOverlay>
        </DndContext>
    );
};

function stepBannerText(domain) {
    switch (domain) {
        case "DEAL_HOLE": return "Deal hole cards — place cards manually or deal random";
        case "DEAL_BOARD": return "Deal board cards — place cards manually or deal random";
        case "BETTING": return "Betting decision";
        case "CARD_SELECT": return "Card selection";
        case "CARD_PASS": return "Card pass";
        case "BOOLEAN": return "Yes / No decision";
        case "CHOICE": return "Choice";
        case "COMPLETE": return "Complete";
        default: return domain ? `Step: ${domain}` : "";
    }
}

export default CreationFlow;