// EditablePot.jsx
import React, { useState, useEffect } from "react";
import "../css/HandEditor.css";

const EditablePot = ({ pot, onChange }) => {
    const [localValue, setLocalValue] = useState(String(pot ?? 0));

    useEffect(() => {
        setLocalValue(String(pot ?? 0));
    }, [pot]);

    const handleBlur = () => {
        const parsed = parseInt(localValue, 10);
        if (!isNaN(parsed) && parsed >= 0) {
            onChange(parsed);
        } else {
            setLocalValue(String(pot ?? 0));
        }
    };

    return (
        <input
            className="editable-pot__input"
            type="number"
            min={0}
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
            title="Edit pot"
        />
    );
};

export default EditablePot;