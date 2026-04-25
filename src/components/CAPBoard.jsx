import React from "react";
import { getLayout } from "../layouts/boardLayouts";
import DroppableSlot from "./DroppableSlot";
// import { useDroppable } from "@dnd-kit/core";
import "../css/CAPBoard.css";

/**
 *  CAPBoard
 * 
 * Props:
 *  nodes           - array of card strings or null, indexed by node index
 *                      (comes directly from hand.nodes)
 *  layoutName      - string key into boardLayouts.js
 *  points          - array of { name, score_type, node_sets } from backend
 *  showdown        - showdown result object from backend (or null)
 *  onNodeClick     - optional (nodeIndex) => void
 *  onNodeSlotClick - optional (nodeIndex) => void
 */
const CAPBoard = ({
    nodes = [],
    layoutName = "single_board",
    points = [],
    showdown = null,
    onNodeClick,
    onNodeSlotClick,
}) => {
    const layout = getLayout(layoutName);
    const { positions, pointRegions, cardSize = 1.0 } = layout;

  // --------------------------------------------------
  // Compute which nodes are "winning" at showdown
  // Maps node index → array of point names that won on it
  // --------------------------------------------------
  const winningNodes = computeWinningNodes(showdown, points);

  // --------------------------------------------------
  // Base card dimensions — scale with cardSize hint
  // --------------------------------------------------
    const BASE_W = 60;      // px
    const BASE_H = 84;      // px
    const cardW = Math.round(BASE_W * cardSize);
    const cardH = Math.round(BASE_H * cardSize);

    console.log("Nodes: ", nodes)
    console.log("Positions: ", positions)
    console.log("PointRegions: ", pointRegions)

    return (
        <div className="cap-board">
            {/* Point region labels */}
            {pointRegions?.map((region, i) => {
                // Match region to point by index (backend sends points in the same order)
                const point = points[i];
                const label = point ? formatPointLabel(point) : region.name;
                return (
                    <div
                        key={i}
                        className="cap-board__point-label"
                        style={{ left: `${region.labelX}%`, top: `${region.labelY}%` }}
                    >
                        {label}
                    </div>
                );
            })}

            {/* Node slots */}
            {positions.map((pos, nodeIndex) => {
                const cardObj = nodes[nodeIndex] ?? null;
                const winPoints = winningNodes[nodeIndex];
                const isWinner = winPoints && winPoints.length > 0;

                return (
                    <div
                    key={nodeIndex}
                    className={`cap-board__node ${isWinner ? "cap-board__node--winner" : ""}`}
                    style={{
                        left: `calc(${pos.x}% - ${cardW / 2}px)`,
                        top: `calc(${pos.y}% - ${cardH / 2}px)`,
                        width: cardW,
                        height: cardH,
                    }}
                    title={isWinner ? `Wins: ${winPoints.join(", ")}` : undefined}
                >
                    <DroppableSlot
                        index={nodeIndex}
                        variant="board"
                        location="cap"
                        cardObj={cardObj}
                        scale={cardSize}
                        showSlots={true}
                        activeSlot={null}
                        onCardClick={(idx) => onNodeClick?.(idx)}
                        onSlotClick={(idx) => onNodeSlotClick?.(idx)}
                    />
                    {isWinner && (
                        <div className="cap-board__winner-badge" />
                    )}
                </div>
                );            
            })}
        </div>
    );
};

// --------------------------------------------------
// Helpers
// --------------------------------------------------

/**
 * Given a showdown result and points, return a map of
 * nodeIndex → [pointName, ...] for every node that appears
 * in a winning node_set.
 *
 * winners_by_pot is an array of payout maps (one per side pot).
 * We just need to know which node_sets contributed to wins.
 *
 * Strategy: for each point, for each node_set in that point,
 * if any player won on that point, mark all nodes in the
 * winning node_set.
 *
 * The backend sends scores[i].scores[boardIndex] — we find
 * the best score across players and mark that board's nodes.
 */
function computeWinningNodes(showdown, points) {
    const result = {};

    if (!showdown || !points?.length) return result;

    const { scores } = showdown;

    scores?.forEach((pointScore, pointIndex) => {
        const point = points[pointIndex];
        if (!point) return;

        pointScore.scores?.forEach((boardScores, boardIndex) => {
            if (!boardScores?.length) return;

            const nodeSet = point.node_sets[boardIndex];
            if (!nodeSet) return;

            // Mark all nodes in this node_set as participating in a winner
            nodeSet.forEach((nodeIndex) => {
                if (!result[nodeIndex]) result[nodeIndex] = [];
                result[nodeIndex].push(point.name);
            });
        });
    });

    return result;
}

/**
 *  Formats a point label for display.
 * e.g. { name: "board1", score_type: "HIGH" } -> "Board 1 (Hi)"
 */
function formatPointLabel(point) {
    const name = point.name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    const type = point.score_type === "HIGH" ? "Hi"
        : point.score_type === "LOW_27" ? "Lo(27)"
        : point.score_type === "LOW_A5" ? "Lo(A5)"
        : point.score_type;
    return `${name} . ${type}`;
}

export default CAPBoard;