import React from "react";
import { getLayout } from "../layouts/boardLayouts";
import DroppableSlot from "./DroppableSlot";
import "../css/CAPBoard.css";

/**
 * Props:
 *  nodes           - card strings/objects or null, indexed by node index
 *  layoutName      - key into boardLayouts.js
 *  points          - [{ name, score_type, node_sets }] (label text only)
 *  onNodeClick / onNodeSlotClick - optional (nodeIndex) => void
 * Card size comes from --card-w on an ancestor (set by PokerTable).
 */
const CAPBoard = ({
    nodes = [],
    layoutName = "single_board",
    points = [],
    onNodeClick,
    onNodeSlotClick,
}) => {
    const { positions, pointRegions } = getLayout(layoutName);

    return (
        <div className="cap-board">
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

            {positions.map((pos, nodeIndex) => (
                <div
                    key={nodeIndex}
                    className="cap-board__node"
                    style={{ "--x": pos.x, "--y": pos.y }}
                >
                    <DroppableSlot
                        index={nodeIndex}
                        variant="board"
                        location="cap"
                        cardObj={nodes[nodeIndex] ?? null}
                        scale={1}
                        showSlots={true}
                        activeSlot={null}
                        onCardClick={(idx) => onNodeClick?.(idx)}
                        onSlotClick={(idx) => onNodeSlotClick?.(idx)}
                    />
                </div>
            ))}
        </div>
    );
};

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