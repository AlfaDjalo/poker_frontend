import React, { useState, useCallback } from "react";

import PokerTable from "./PokerTable";
import ShowdownSummary from "./ShowdownSummary";
import ReplayControls from "./ReplayControls";
import HandBrowser from "./HandBrowser";
import AnnotationPanel from "./AnnotationPanel";

import { fetchHand, fetchAnnotations } from "../api/replayAPI";
import { useReplay } from "../hooks/useReplay";

import "../css/HandReplayer.css";

/**
 * HandReplayer
 *
 * Card selection model
 * ────────────────────
 * Two independent highlight sources are merged for display:
 *
 *   userCards  – cards the user has manually toggled by clicking on the table.
 *                Cleared when the user navigates to a different frame (new action)
 *                or loads a new hand.
 *
 *   annoCards  – cards pushed by AnnotationPanel when the user views a saved
 *                annotation that has associated card highlights.
 *                Replaced wholesale by onHighlightCards; also cleared on navigation
 *                so they don't linger on unrelated frames.
 *
 * The union of both sets is passed to buildDisplayPlayers / buildDisplayNodes.
 */
const HandReplayer = () => {
    const [handData, setHandData]           = useState(null);
    const [selectedHandId, setSelectedHandId] = useState(null);
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState(null);

    // showAllCards: when false only the hero's cards are visible during play;
    // board cards are ALWAYS visible regardless of this setting.
    const [showAllCards, setShowAllCards]   = useState(true);
    
    const [annotations, setAnnotations]     = useState([]);

    // User-driven card toggles — persist within a hand, cleared on navigation
    // to a different frame or when a new hand is loaded.
    const [userCards, setUserCards] = useState([]);

    // Annotation-driven highlights (replaced on each annotation view event,
    // cleared when the frame advances so they don't bleed into other frames).
    const [annoCards, setAnnoCards] = useState([]);
    
    // Merged highlight set used for display
    const highlightedCards = [...new Set([...userCards, ...annoCards])];

    const replay = useReplay(handData);
    const { currentFrame, frames, cursor } = replay;

    // ── Load a hand by id ─────────────────────────────────
    const loadHand = useCallback(async (id) => {
        setLoading(true)
        setError(null);
        // Clear all card selections when switching hands.
        setUserCards([]);
        setAnnoCards([]);
        try {
            const data = await fetchHand(id);
            setHandData(data);
            setSelectedHandId(id);
            replay.resetCursor();
            const anns = await fetchAnnotations(id);
            setAnnotations(anns);
        } catch (e) {
            setError("Failed to load hand.");
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
 
    // ── Toggle a single card in the user selection ────────────────
    // Clicking a card that is already in userCards deselects it.
    // annoCards are untouched by card clicks.
    const toggleUserCard = useCallback((card) => {
        setUserCards(prev =>
            prev.includes(card) ? prev.filter(c => c !== card) : [...prev, card]
        );
    }, []);

    // ── Clear all card selections ─────────────────────────────────
    // Called on every navigation step so selections don't carry across actions.
    const clearAllCards = useCallback(() => {
        setUserCards([]);
        setAnnoCards([]);
    }, []);
    
    // ── Annotation highlight handler ──────────────────────────────
    // Called by AnnotationPanel when the user browses to an annotation that has
    // saved card highlights (or with [] when switching away / entering edit mode).
    // We replace annoCards but leave userCards untouched so the user's own
    // selections are preserved while viewing annotations. 
    const handleAnnoHighlight = useCallback((cards) => {
        setAnnoCards(cards);
    }, []);
    
    // ── Navigation wrappers — clear selections on every step ──────   
    const handleStepForward = useCallback(() => {
        clearAllCards();
        replay.stepForward();
    }, [clearAllCards, replay]);

    const handleStepBack = useCallback(() => {
        clearAllCards();
        replay.stepBack();
    }, [clearAllCards, replay]);

    const handleJumpToStart = useCallback(() => {
        clearAllCards();
        replay.jumpToStart();
    }, [clearAllCards, replay]);

    const handleJumpToEnd = useCallback(() => {
        clearAllCards();
        replay.jumpToEnd();
    }, [clearAllCards, replay]);

    const handleScrub = useCallback((i) => {
        clearAllCards();
        replay.jumpToFrame(i);
    }, [clearAllCards, replay]);

    // ── Annotation refresh helper ─────────────────────────────────
    const refreshAnnotations = useCallback(async () => {
        if (!selectedHandId) return;
        const anns = await fetchAnnotations(selectedHandId);
        setAnnotations(anns);
    }, [selectedHandId]);

    // ── Build display objects ─────────────────────────────────────    
    const displayPlayers = buildDisplayPlayers(currentFrame, showAllCards, highlightedCards);
    const displayNodes   = buildDisplayNodes(currentFrame, highlightedCards);

    // frameActionId drives which annotations are shown:
    //   "hand"  → deal / street / showdown frame — show hand-level annotations
    //   number  → action frame — show annotations for that specific action    const rawFrameActionId = currentFrame?.frameActionId;
    const frameActionId = currentFrame?.frameActionId ?? "hand";

    const isShowdown = currentFrame?.frameType === "showdown";
    const potDisplay = currentFrame?.pot ?? 0;

    return (
        <div className="hand-replayer">

            {/* ── Left: Hand Browser ── */}
            <div className="hand-replayer__browser">
                <HandBrowser
                    selectedHandId={selectedHandId}
                    onSelectHand={loadHand}
                    onHandListChange={() => {}}
                />
            </div>

            {/* ── Centre: Table + Controls ── */}
            <div className="hand-replayer__centre">

                <div className="hand-replayer__status-bar">
                    {handData ? (
                        <>
                            <span className="hr-badge hr-badge--variant">{handData.variant_name}</span>
                            <span className="hr-badge hr-badge--layout">{handData.layout_name}</span>
                            <span className="hr-pot">Pot: ${potDisplay}</span>
                            {currentFrame?.label && (
                                <span className="hr-label">{currentFrame.label}</span>
                            )}
                        </>
                    ) : (
                        <span className="hr-hint">← Select a hand to replay</span>
                    )}
                    {loading && <span className="hr-loading">Loading…</span>}
                    {error && <span className="hr-error">{error}</span>}
                </div>

                <div className="hand-replayer__table-wrap">
                    {handData ? (
                        <PokerTable
                            players={displayPlayers}
                            boardCards={[]}
                            nodes={displayNodes}
                            layoutName={handData.layout_name}
                            points={[]}
                            showdown={null}
                            dealerSeat={handData.dealer_seat}
                            actionSeat={null}
                            onSeatClick={() => {}}
                            onPlayerCardClick={(seat, idx) => {
                                const card = displayPlayers[seat]?.hand?.[idx]?.card;
                                if (card) toggleUserCard(card);
                            }}
                            onPlayerSlotClick={() => {}}
                            onBoardCardClick={(idx) => {
                                const card = displayNodes[idx]?.card;
                                if (card) toggleUserCard(card);
                            }}
                            onBoardSlotClick={() => {}}
                            onBoardAreaClick={() => {}}
                            loading={loading}
                        />
                    ) : (
                        <div className="hand-replayer__empty">
                            <div className="hand-replayer__empty-icon">🂠</div>
                            <div className="hand-replayer__empty-text">
                                Select a hand from the browser to begin replay
                            </div>
                        </div>
                    )}
                </div>

                {handData && (
                    <div className="hand-replayer__controls">
                        <ReplayControls
                            cursor={cursor}
                            totalFrames={frames.length}
                            currentFrame={currentFrame}
                            frames={frames}
                            canBack={replay.canBack}
                            canForward={replay.canForward}
                            onBack={handleStepBack}
                            onForward={handleStepForward}
                            onJumpStart={handleJumpToStart}
                            onJumpEnd={handleJumpToEnd}
                            onScrub={handleScrub}
                            showAllCards={showAllCards}
                            onToggleCards={() => setShowAllCards(v => !v)}
                        />
                    </div>
                )}
            </div>

            {/* ── Right: Sidebar ── */}
            {handData && (
                <div className="hand-replayer__sidebar">

                    {isShowdown && currentFrame?.pointResults?.length > 0 && (
                        <ShowdownSummary
                            showdown={buildShowdownForSummary(currentFrame, handData)}
                            points={[]}
                            players={displayPlayers}
                            onSelectHand={({ playerCards, boardCards }) => {
                                // ShowdownSummary hand selection replaces the user
                                // selection so the chosen hand's cards are highlighted.
                                const all = [
                                    ...Object.values(playerCards).flat(),
                                    ...boardCards,
                                ];
                                setUserCards(all);
                                setAnnoCards([]);
                            }}
                        />
                    )}

                    {/* Annotation panel is shown on every frame type:
                        - deal / street frames → frameActionId is null → hand-level annotations
                        - action frames        → frameActionId is a number → action annotations
                        - showdown frame       → frameActionId is null → hand-level annotations
                        The panel is only suppressed entirely when there is no loaded hand
                        (guarded by the outer {handData && ...} check). */}
                    <AnnotationPanel
                        handId={selectedHandId}
                        actionId={frameActionId}
                        annotations={annotations}
                        selectedCards={highlightedCards}
                        onAnnotationSaved={refreshAnnotations}
                        onAnnotationDeleted={refreshAnnotations}
                        onHighlightCards={handleAnnoHighlight}
                    />

                    {isShowdown && currentFrame?.payouts?.length > 0 && (
                        <div className="hand-replayer__payouts">
                            <div className="hand-replayer__payouts-title">Payouts</div>
                            {currentFrame.payouts
                                .filter(p => p.amount > 0)
                                .sort((a, b) => b.amount - a.amount)
                                .map((p, i) => (
                                    <div key={i} className="hand-replayer__payout-row">
                                        <span>{p.player_name}</span>
                                        <span className="hand-replayer__payout-amount">+${p.amount}</span>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Build player objects for rendering.
 * showAllCards controls hole card visibility; board cards are unaffected.
 */
function buildDisplayPlayers(frame, showAllCards, highlightedCards) {
    if (!frame) return {};
    const players = { ...frame.players };
    const heroSeat = frame.heroSeat;
    for (const seat of Object.keys(players)) {
        const p = players[seat];
        const isHero = Number(seat) === heroSeat;
        players[seat] = {
            ...p,
            hand: (p.hand || []).map(c => {
                if (!c) return null;
                const card = typeof c === "string" ? c : c.card;
                // Hide during play unless: this is the hero seat, OR showAllCards is on,
                // OR we're at the showdown frame (frame.frameType === "showdown").
                const hidden = !isHero && !showAllCards && frame.frameType !== "showdown";
                return {
                    card,
                    hidden,
                    selected: highlightedCards.includes(card),
                };
            }),
        };
    }
    return players;
}

/**
 * Build node (board card) objects for rendering.
 * Board cards are ALWAYS face-up — hidden is always false.
 * The showAllCards toggle only applies to hole cards.
 */
function buildDisplayNodes(frame, highlightedCards) {
    if (!frame?.nodes) return [];
    return frame.nodes.map(n => {
        if (!n) return null;
        const card = typeof n === "string" ? n : n.card;
        return {
            card,
            hidden: false,
            selected: highlightedCards.includes(card),
        };
    });
}

function buildShowdownForSummary(frame, hand) {
    if (!frame?.pointResults) return null;

    const grouped = {};
    for (const pr of frame.pointResults) {
        const key = `${pr.point_name}::${pr.score_type}`;
        if (!grouped[key]) grouped[key] = { name: pr.point_name, score_type: pr.score_type, results: [] };
        grouped[key].results.push(pr);
    }

    const point_results = Object.values(grouped).map(g => {
        const maxShare = Math.max(...g.results.map(r => r.point_share));
        const winners = g.results.filter(r => r.point_share === maxShare).map(r => r.player_seat - 1);
        return {
            name: g.name,
            score_type: g.score_type,
            board_winners: [winners],
            board_results: [g.results.map(r => ({
                player_index: r.player_seat - 1,
                hand_category: r.hand_category,
                hand_value: r.hand_value,
                best_hand_cards: [],
                hole_cards_used: r.hole_cards_used,
                board_cards_used: r.board_cards_used,
                is_winner: r.point_share === maxShare,
            }))],
            no_qualify: [false],
            scoop: [false],
        };
    });

    const payouts = {};
    for (const p of (frame.payouts || [])) {
        payouts[p.player_seat - 1] = p.amount;
    }

    return {
        payout_type: hand.split_pot ? "split_pot" : "points",
        point_results,
        point_tallies: null,
        payouts,
        pot_winners: Object.entries(payouts).filter(([, v]) => v > 0).map(([k]) => Number(k)),
    };
}

export default HandReplayer;