import React, { useState, useEffect } from "react";
import "../css/HandEditor.css";

/**
 * EditableStack
 *
 * Renders as a plain "$X" display outside edit mode, and an inline
 * number input inside edit mode.
 *
 * Props:
 *   stack      — current stack value (number)
 *   isEditing  — bool
 *   onChange   — (newValue: number) => void
 */
const EditableStack = ({ stack, isEditing, onChange }) => {
    const [localValue, setLocalValue] = useState(String(stack ?? 0));

    // Keep in sync when stack changes externally
    useEffect(() => {
        setLocalValue(String(stack ?? 0));
    }, [stack]);

    if (!isEditing) {
        return <span className="player-stack">${stack ?? 0}</span>;
    }

    const handleBlur = () => {
        const parsed = parseInt(localValue, 10);
        if (!isNaN(parsed) && parsed >= 0) {
            onChange(parsed);
        } else {
            // Reset to last good value on invalid input
            setLocalValue(String(stack ?? 0));
        }
    };

    return (
        <input
            className="editable-stack__input"
            type="number"
            min={0}
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
            title="Edit stack"
        />
    );
};

export default EditableStack;