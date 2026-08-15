import React from "react";
import "../css/HandEditor.css";

/**
 * HandEditorControls
 *
 * Props:
 *   mode              — "live" | "replayer" | "creation"
 *   submitting        — bool (disable buttons during async calls)
 *   validationErrors  — string[]
 *   serverErrors      — string[]
 *   onApply           — called for mode="live" Apply button
 *   onPlayFromHere    — called for mode="replayer" Play-from-here button
 *   onSave            — called for mode="creation" Save button
 *   onCancel          — always available
 */
function toMessage(e) {
    if (e == null) return null;
    if (typeof e === "string") return e;
    if (typeof e === "object") {
        if (typeof e.msg === "string") {
            const field = Array.isArray(e.loc) ? e.loc.join(".") : e.loc;
            return field ? `${field}: ${e.msg}` : e.msg;
        }
        try { return JSON.stringify(e); } catch { return String(e); }
    }
    return String(e);
}

function flattenErrors(errs) {
    if (!errs) return [];
    const list = Array.isArray(errs) ? errs : [errs];
    return list.map(toMessage).filter(Boolean);
}

const HandEditorControls = ({
    mode,
    submitting = false,
    validationErrors = [],
    serverErrors = [],
    onApply,
    onPlayFromHere,
    onSave,
    onSaveAsNew,
    onCancel,
}) => {
    const allErrors = [...flattenErrors(validationErrors), ...flattenErrors(serverErrors)];


    return (
        <div className="hand-editor-controls">

            {/* Error list */}
            {allErrors.length > 0 && (
                <div className="hand-editor-controls__errors">
                    {allErrors.map((e, i) => (
                        <div key={i} className="hand-editor-controls__error">⚠ {e}</div>
                    ))}
                </div>
            )}

            <div className="hand-editor-controls__buttons">

                {/* Cancel is always available */}
                <button
                    className="editor-btn editor-btn--cancel"
                    onClick={onCancel}
                    disabled={submitting}
                >
                    Cancel
                </button>

                {/* Mode-specific primary action */}
                {mode === "live" && (
                    <button
                        className="editor-btn editor-btn--apply"
                        onClick={onApply}
                        disabled={submitting}
                    >
                        {submitting ? "Applying…" : "Apply & Resume"}
                    </button>
                )}

                {mode === "replayer" && (
                    <button
                        className="editor-btn editor-btn--play"
                        onClick={onPlayFromHere}
                        disabled={submitting}
                    >
                        {submitting ? "Loading…" : "▶ Play from Here"}
                    </button>
                )}

                {mode === "creation" && (
                    <>
                        <button
                            className="editor-btn editor-btn--save"
                            onClick={onSave}
                            disabled={submitting}
                        >
                            {submitting ? "Saving…" : "Save Hand"}
                        </button>
                        {onSaveAsNew && (
                            <button
                                className="editor-btn editor-btn--save-as-new"
                                onClick={onSaveAsNew}
                                disabled={submitting}
                                title="Save as a new hand without overwriting the one you opened"
                            >
                                {submitting ? "Saving…" : "Save As New"}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default HandEditorControls;