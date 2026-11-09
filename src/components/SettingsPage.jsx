import React from "react";
import { useSession } from "../hooks/useSession";
import { useToast } from "./ToastProvider";
import "../css/SettingsPage.css";

const SettingsPage = () => {
    const { player, recording, saveRecording } = useSession();
    const toast = useToast();

    const enabled = !!recording.enabled;
    const unknown = recording.enabled == null;

    const handleToggle = async (e) => {
        const next = e.target.checked;
        try {
            await saveRecording(next);
            toast.success(
                next ? "New tables will record by default." : "New tables will not record by default."
            );
        } catch (err) {
            toast.error(err);
        }
    };

    return (
        <div className="settings-page">
            <div className="settings-page__title">Settings</div>

            {player && (
                <div className="settings-page__player">
                    Playing as <strong>{player.name}</strong>
                </div>
            )}

            <div className="settings-page__card">
                <label className="settings-page__row">
                    <input
                        type="checkbox"
                        checked={enabled}
                        disabled={recording.loading || unknown}
                        onChange={handleToggle}
                    />
                    <span className="settings-page__label">Record sessions by default</span>
                </label>

                <div className="settings-page__help">
                    When on, new tables save bankroll changes and hand history.
                    When off, new tables are "Not recording": results don't affect
                    your saved bankroll or history.
                </div>
                <div className="settings-page__help settings-page__help--note">
                    This is the default for <strong>new</strong> tables only. It never
                    affects tables that are already open.
                </div>

                {recording.error && (
                    <div className="settings-page__error">⚠ {recording.error}</div>
                )}
            </div>
        </div>
    );
};

export default SettingsPage;