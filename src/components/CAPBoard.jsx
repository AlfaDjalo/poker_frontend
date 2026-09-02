import React from "react";
import { getLayout } from "../layouts/boardLayouts";
import DroppableSlot from "./DroppableSlot";
import "../css/CAPBoard.css";

/**
 *  CAPBoard
 * 
 * Props:
 *  nodes           - array of card strings/objects or null, indexed by node index
 *                      (comes directly from hand.nodes). Each entry may carry
 *                      a `selected` flag — that's the ONLY highlighting source
 *                      now (driven by ShowdownSummary / PointDetailPanel
 *                      selection). There is no independent "winning board"
 *                      highlight computed here anymore — see git history if
 *                      that's ever wanted back.
 *  layoutName      - string key into boardLayouts.js
 *  points          - array of { name, score_type, node_sets } from backend
 *                      (still used for point region labels only)
 *  onNodeClick     - optional (nodeIndex) => void
 *  onNodeSlotClick - optional (nodeIndex) => void
 */
const CAPBoard = ({
    nodes = [],
    layoutName = "single_board",
    points = [],
    onNodeClick,
    onNodeSlotClick,
}) => {
    const layout = getLayout(layoutName);
    const { positions, pointRegions, cardSize = 1.0 } = layout;

    const BASE_W = 60;      // px
    const BASE_H = 84;      // px
    const cardW = Math.round(BASE_W * cardSize);
    const cardH = Math.round(BASE_H * cardSize);

    return (
        <div className="cap-board">
            {/* Point region labels */}
            {pointRegions?.map((region, i) => {
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

                return (
                    <div
                        key={nodeIndex}
                        className="cap-board__node"
                        style={{
                            left: `calc(${pos.x}% - ${cardW / 2}px)`,
                            top: `calc(${pos.y}% - ${cardH / 2}px)`,
                            width: cardW,
                            height: cardH,
                        }}
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
                    </div>
                );
            })}
        </div>
    );
};

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