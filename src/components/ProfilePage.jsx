import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useAuth } from "../hooks/useAuth";
import { useAuthRetry } from "../hooks/useAuthRetry";
import { useToast } from "./ToastProvider";
import { getPlayer } from "../api/tableApi";
import { updateProfile, setPin, isValidPin } from "../api/authApi";
import "../css/ProfilePage.css";

const ProfilePage = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const { player, playerId, refreshPlayer, clearPlayer } = useSession();
    const { logout, refreshMe } = useAuth();
    const withAuthRetry = useAuthRetry(playerId);

    const [me, setMe] = useState(null);          // fresh player (has_pin etc.)
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState(null);

    const [currentPin, setCurrentPin] = useState("");
    const [newPin, setNewPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [savingPin, setSavingPin] = useState(false);
    const [pinError, setPinError] = useState(null);
    const [lockLeft, setLockLeft] = useState(0);

    const load = useCallback(async () => {
        if (playerId == null) return;
        try {
            const p = await getPlayer(playerId);
            setMe(p);
            setName(p.name ?? "");
            setAvatar(p.avatar ?? "");
        } catch (e) {
            toast.error(e);
        }
    }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    // 429 Retry-After countdown.
    useEffect(() => {
        if (lockLeft <= 0) return undefined;
        const id = setTimeout(() => setLockLeft(s => s - 1), 1000);
        return () => clearTimeout(id);
    }, [lockLeft]);

    if (!player || playerId == null) {
        return (
            <div className="profile-page">
                <div className="profile-page__title">Profile</div>
                <div className="profile-page__help">No player selected.</div>
                <button className="profile-page__btn" onClick={() => navigate("/players")}>
                    Choose player
                </button>
            </div>
        );
    }

    const hasPin = !!me?.has_pin;
    const profileDirty = (name.trim() !== (me?.name ?? "")) || (avatar !== (me?.avatar ?? ""));

    const saveProfile = async () => {
        const body = {};
        if (name.trim() !== (me?.name ?? "")) body.name = name.trim();
        if (avatar !== (me?.avatar ?? "")) body.avatar = avatar || null;
        if (Object.keys(body).length === 0) return;
        if (body.name !== undefined && !body.name) {
            setProfileError("Name can't be empty.");
            return;
        }
        setSavingProfile(true);
        setProfileError(null);
        try {
            await withAuthRetry(() => updateProfile(playerId, body));
            toast.success("Profile updated.");
            await load();
            await refreshPlayer();
            await refreshMe();
        } catch (e) {
            // 409 name taken, 422 invalid
            setProfileError(e.detail ?? e.message);
            toast.error(e);
        } finally {
            setSavingProfile(false);
        }
    };

    const submitPin = async (newValue) => {
        // newValue: string (set/change) | null (remove)
        setPinError(null);
        if (hasPin && !currentPin) {
            setPinError("Enter your current PIN.");
            return;
        }
        if (newValue !== null) {
            if (!isValidPin(newValue)) {
                setPinError("New PIN must be 4-12 digits.");
                return;
            }
            if (newValue !== confirmPin) {
                setPinError("PINs don't match.");
                return;
            }
        }
        setSavingPin(true);
        try {
            await withAuthRetry(() => setPin(playerId, {
                currentPin: hasPin ? currentPin : undefined,
                newPin: newValue,
            }));
            toast.success(
                newValue === null
                    ? "PIN removed."
                    : "PIN saved. Other devices have been logged out."
            );
            setCurrentPin(""); setNewPin(""); setConfirmPin("");
            await load();
            await refreshPlayer();
            await refreshMe();
        } catch (e) {
            if (e.status === 429) {
                setLockLeft(e.retryAfter ?? 60);
                setPinError(e.detail);
            } else {
                // 403 wrong current PIN, 422 invalid, etc.
                setPinError(e.detail ?? e.message);
            }
            toast.error(e);
            setCurrentPin("");
        } finally {
            setSavingPin(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        clearPlayer();
        navigate("/players");
    };

    const pinLocked = lockLeft > 0;

    return (
        <div className="profile-page">
            <div className="profile-page__title">Profile</div>

            {/* ── Identity ── */}
            <div className="profile-page__card">
                <div className="profile-page__subtitle">Identity</div>

                <label className="profile-page__field">
                    <span>Name</span>
                    <input
                        className="profile-page__input"
                        value={name}
                        maxLength={40}
                        onChange={e => setName(e.target.value)}
                    />
                </label>

                <label className="profile-page__field">
                    <span>Avatar (emoji or short text)</span>
                    <input
                        className="profile-page__input"
                        value={avatar}
                        maxLength={8}
                        placeholder="🙂"
                        onChange={e => setAvatar(e.target.value)}
                    />
                </label>

                {profileError && <div className="profile-page__error">⚠ {profileError}</div>}

                <div className="profile-page__actions">
                    <button
                        className="profile-page__btn"
                        onClick={saveProfile}
                        disabled={savingProfile || !profileDirty}
                    >
                        {savingProfile ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>

            {/* ── PIN ── */}
            <div className="profile-page__card">
                <div className="profile-page__subtitle">
                    PIN {hasPin ? "🔒 (set)" : "(not set)"}
                </div>
                <div className="profile-page__help">
                    {hasPin
                        ? "Changing or removing your PIN logs out your other devices. This session stays valid."
                        : "Optional. With a PIN, only you can act as this player. Without one, anyone at this device can."}
                </div>

                {hasPin && (
                    <label className="profile-page__field">
                        <span>Current PIN</span>
                        <input
                            className="profile-page__input profile-page__input--pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            maxLength={12}
                            value={currentPin}
                            disabled={pinLocked}
                            onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                        />
                    </label>
                )}

                <label className="profile-page__field">
                    <span>New PIN (4-12 digits)</span>
                    <input
                        className="profile-page__input profile-page__input--pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={12}
                        value={newPin}
                        disabled={pinLocked}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                    />
                </label>

                <label className="profile-page__field">
                    <span>Confirm new PIN</span>
                    <input
                        className="profile-page__input profile-page__input--pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={12}
                        value={confirmPin}
                        disabled={pinLocked}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    />
                </label>

                {pinLocked ? (
                    <div className="profile-page__error">
                        Too many attempts. Try again in {lockLeft}s.
                    </div>
                ) : pinError ? (
                    <div className="profile-page__error">⚠ {pinError}</div>
                ) : null}

                <div className="profile-page__actions">
                    {hasPin && (
                        <button
                            className="profile-page__btn profile-page__btn--danger"
                            onClick={() => {
                                if (window.confirm("Remove your PIN? Anyone on this device will be able to act as you."))
                                    submitPin(null);
                            }}
                            disabled={savingPin || pinLocked}
                        >
                            Remove PIN
                        </button>
                    )}
                    <button
                        className="profile-page__btn"
                        onClick={() => submitPin(newPin)}
                        disabled={savingPin || pinLocked || !newPin}
                    >
                        {savingPin ? "Saving…" : hasPin ? "Change PIN" : "Set PIN"}
                    </button>
                </div>
            </div>

            {/* ── Session ── */}
            <div className="profile-page__card">
                <div className="profile-page__subtitle">Session</div>
                <div className="profile-page__actions profile-page__actions--left">
                    <button className="profile-page__btn profile-page__btn--ghost"
                            onClick={() => navigate("/players")}>
                        Switch player
                    </button>
                    <button className="profile-page__btn profile-page__btn--ghost"
                            onClick={handleLogout}>
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;