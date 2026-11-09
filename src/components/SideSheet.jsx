import React, { useEffect, useState } from "react";
import "../css/SideSheet.css";

/**
 * className  - applied to the root (so existing sidebar CSS keeps working)
 * defaultOpen- initial state (only visible below the breakpoint)
 * openWhen   - opens when this becomes truthy (e.g. showdown appears)
 * closeWhen  - closes when this changes to a truthy value (e.g. hand selected)
 */
const SideSheet = ({ title, className = "", defaultOpen = false, openWhen, closeWhen, children }) => {
    const [open, setOpen] = useState(defaultOpen);

    useEffect(() => { if (openWhen) setOpen(true); }, [openWhen]);
    useEffect(() => { if (closeWhen) setOpen(false); }, [closeWhen]);

    return (
        <div className={`side-sheet ${open ? "side-sheet--open" : ""} ${className}`}>
            <button
                type="button"
                className="side-sheet__toggle"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
            >
                <span>{title}</span>
                <span aria-hidden="true">{open ? "▾" : "▴"}</span>
            </button>
            <div className="side-sheet__body">{children}</div>
        </div>
    );
};

export default SideSheet;