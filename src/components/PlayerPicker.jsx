import React, { useCallback, useEffect, useState } from "react";
import { listPlayers, createPlayer } from "../api/tableApi";
import { useSession } from "../hooks/useSession";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ToastProvider";
import "../css/PlayerPicker.css";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

/**
 * PlayerPicker
 *
 * Props:
 *   onPicked - optional (player) => void, called after a player is chosen
 *              (e.g. navigate to the lobby).
 */
const PlayerPicker = ({ onPicked }) => {
    const { player: current, selectPlayer } = useSession();
    const { requestLogin, login } = useAuth();
    const toast = useToast();

    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [showBots, setShowBots] = useState(false);

    const [newName, setNewName] = useState("");
    const [newBankroll, setNewBankroll] = useState(10000);
    const [newIsBot, setNewIsBot] = useState(false);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setPlayers(await listPlayers({ q: query.trim() || undefined, includeBots: showBots }));
        } catch (e) {
            toast.error(e);
        } finally {
            setLoading(false);
        }
    }, [query, showBots]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounce search typing; immediate on bots toggle.
    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [load]);

    const pick = async (p) => {
        if (p.has_pin) {
            // Protected: PIN modal -> login stores token + selects player.
            const ok = await requestLogin(p.player_id);
            if (!ok) return;
            onPicked?.(p);
            return;
        }
        // Hot-seat: no PIN. Log in token-less so any stale token is dropped.
        try { await login(p.player_id); } catch { /* fall back to hot-seat */ }
        selectPlayer(p);
        onPicked?.(p);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        setCreating(true);
        try {
            const p = await createPlayer({
                name,
                isBot: newIsBot,
                startingBankroll: Number(newBankroll) || 0,
            });
            setNewName("");
            if (newIsBot) {
                // Bots are created for seating, not for playing as.
                toast.success(`Bot "${p.name}" created.`);
                setShowBots(true);
                await load();
            } else {
                toast.success(`Welcome, ${p.name}!`);
                pick(p);
            }
        } catch (err) {
            toast.error(err);           // 409 name taken / 422 invalid
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="player-picker">
            <div className="player-picker__title">Who's playing?</div>
            {current && (
                <div className="player-picker__current">
                    Playing as <strong>{current.name}</strong> · {fmt(current.bankroll)} chips
                </div>
            )}

            <div className="player-picker__filters">
                <input
                    className="player-picker__input"
                    type="text"
                    placeholder="Search players…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <label className="player-picker__check">
                    <input
                        type="checkbox"
                        checked={showBots}
                        onChange={e => setShowBots(e.target.checked)}
                    />
                    Show bots
                </label>
            </div>

            <div className="player-picker__list">
                {loading && players.length === 0 && (
                    <div className="player-picker__empty">Loading…</div>
                )}
                {!loading && players.length === 0 && (
                    <div className="player-picker__empty">
                        No players found. Create one below.
                    </div>
                )}
                {players.map(p => {
                    const selected = current?.player_id === p.player_id;
                    return (
                        <button
                            key={p.player_id}
                            type="button"
                            className={`player-picker__row ${selected ? "player-picker__row--selected" : ""}`}
                            onClick={() => pick(p)}
                            disabled={p.is_bot}
                            title={p.is_bot ? "Bots are seated at tables, not played as" : undefined}
                        >
                            <span className="player-picker__avatar">
                                {p.avatar || (p.is_bot ? "🤖" : "🙂")}
                            </span>
                            <span className="player-picker__name">{p.name}</span>
                            {p.has_pin && <span className="player-picker__lock" title="PIN protected">🔒</span>}
                            {p.is_bot && <span className="player-picker__badge">BOT</span>}
                            <span className="player-picker__bankroll">{fmt(p.bankroll)}</span>
                        </button>
                    );
                })}
            </div>

            <form className="player-picker__create" onSubmit={handleCreate}>
                <div className="player-picker__subtitle">New player</div>
                <div className="player-picker__create-row">
                    <input
                        className="player-picker__input"
                        type="text"
                        placeholder="Name"
                        value={newName}
                        maxLength={40}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <input
                        className="player-picker__input player-picker__input--num"
                        type="number"
                        min={0}
                        step={100}
                        value={newBankroll}
                        onChange={e => setNewBankroll(e.target.value)}
                        title="Starting bankroll"
                    />
                </div>
                <div className="player-picker__create-row">
                    <label className="player-picker__check">
                        <input
                            type="checkbox"
                            checked={newIsBot}
                            onChange={e => setNewIsBot(e.target.checked)}
                        />
                        Bot
                    </label>
                    <button
                        className="player-picker__btn"
                        type="submit"
                        disabled={creating || !newName.trim()}
                    >
                        {creating ? "Creating…" : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PlayerPicker;