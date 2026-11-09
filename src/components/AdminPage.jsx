import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ToastProvider";
import { listTables, getTable } from "../api/tableApi";
import {
    adminListPlayers, adminAdjustBankroll, adminResetPin, adminSetBot,
    adminDeletePlayer, adminKick, adminPatchTable, adminSetStack,
    adminForceClose, adminDeleteTable, adminLedger, adminAudit,
} from "../api/adminApi";
import "../css/AuthModal.css";
import "../css/AdminPage.css";

const PAGE = 50;
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

// ─────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────

const Dialog = ({ title, hint, children, onClose, onOk, okLabel = "OK", okDisabled, busy, danger }) => (
    <div className="auth-modal__backdrop" onClick={onClose}>
        <div className="auth-modal admin-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="auth-modal__title">{title}</div>
            {hint && <div className="auth-modal__hint">{hint}</div>}
            {children}
            <div className="auth-modal__actions">
                <button className="game-btn" onClick={onClose} disabled={busy}>Cancel</button>
                {onOk && (
                    <button
                        className={`game-btn ${danger ? "admin-btn--danger" : "auth-modal__ok"}`}
                        onClick={onOk}
                        disabled={busy || okDisabled}
                    >
                        {busy ? "…" : okLabel}
                    </button>
                )}
            </div>
        </div>
    </div>
);

const Field = ({ label, children }) => (
    <label className="admin-field"><span>{label}</span>{children}</label>
);

// Runs an admin call: toasts every error `detail`; on 401/403 re-checks the
// admin session (a lapsed admin token is cleared by refreshMe).
function useAdminCall() {
    const toast = useToast();
    const { refreshMe } = useAuth();
    return useCallback(async (fn, successMsg) => {
        try {
            const r = await fn();
            if (successMsg) toast.success(successMsg);
            return { ok: true, data: r };
        } catch (e) {
            toast.error(e);
            if (e.status === 401 || e.status === 403) refreshMe();
            return { ok: false, error: e };
        }
    }, [toast, refreshMe]);
}

// ─────────────────────────────────────────────
// Admin login
// ─────────────────────────────────────────────

const AdminLogin = () => {
    const { adminLogin } = useAuth();
    const toast = useToast();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (!password || busy) return;
        setBusy(true); setError(null);
        try {
            await adminLogin(password);
            setPassword("");
        } catch (err) {
            setError(err.detail ?? err.message);   // 401 wrong, 503 disabled
            toast.error(err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="admin-login" onSubmit={submit}>
            <div className="admin-page__title">🛠 Admin</div>
            <input
                className="auth-modal__input"
                style={{ letterSpacing: "normal" }}
                type="password"
                autoComplete="current-password"
                placeholder="Admin password"
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
            />
            {error && <div className="auth-modal__error">{error}</div>}
            <button className="admin-btn admin-btn--primary" type="submit" disabled={busy || !password}>
                {busy ? "…" : "Log in"}
            </button>
        </form>
    );
};

// ─────────────────────────────────────────────
// Players tab
// ─────────────────────────────────────────────

const PlayersTab = () => {
    const call = useAdminCall();
    const [players, setPlayers] = useState([]);
    const [includeBots, setIncludeBots] = useState(true);
    const [loading, setLoading] = useState(true);
    const [dlg, setDlg] = useState(null);   // {type, player}
    const [busy, setBusy] = useState(false);
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        const r = await call(() => adminListPlayers({ includeBots }));
        if (r.ok) setPlayers(r.data ?? []);
        setLoading(false);
    }, [call, includeBots]);
    useEffect(() => { load(); }, [load]);

    const close = () => { setDlg(null); setAmount(""); setNote(""); };
    const run = async (fn, msg, then) => {
        setBusy(true);
        const r = await call(fn, msg);
        setBusy(false);
        if (r.ok) { close(); await load(); }
        then?.(r);
    };

    const doDelete = (p, force) =>
        run(() => adminDeletePlayer(p.player_id, { force }), `Deleted ${p.name}.`, (r) => {
            // 409 when seated -> confirm, then retry with ?force=true
            if (!r.ok && r.error?.status === 409 && !force) {
                setDlg({ type: "force-delete", player: p });
            }
        });

    return (
        <div className="admin-section">
            <div className="admin-toolbar">
                <label className="admin-check">
                    <input type="checkbox" checked={includeBots} onChange={e => setIncludeBots(e.target.checked)} />
                    Include bots
                </label>
                <button className="admin-btn" onClick={load} disabled={loading}>↻ Refresh</button>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th><th>Name</th><th>Bankroll</th><th>PIN</th>
                            <th>Bot</th><th>Seated</th><th>Created</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.map(p => (
                            <tr key={p.player_id}>
                                <td>{p.player_id}</td>
                                <td>{p.avatar ? `${p.avatar} ` : ""}{p.name}</td>
                                <td className="admin-num">{fmt(p.bankroll)}</td>
                                <td>{p.has_pin ? "🔒" : "—"}</td>
                                <td>{p.is_bot ? "BOT" : ""}</td>
                                <td>{p.seated_table_id != null ? `#${p.seated_table_id}` : "—"}</td>
                                <td>{when(p.created_at)}</td>
                                <td className="admin-actions">
                                    <button className="admin-btn" onClick={() => setDlg({ type: "adjust", player: p })}>± Bankroll</button>
                                    <button className="admin-btn" disabled={!p.has_pin}
                                            onClick={() => setDlg({ type: "reset-pin", player: p })}>Reset PIN</button>
                                    <button className="admin-btn"
                                            onClick={() => run(() => adminSetBot(p.player_id, !p.is_bot),
                                                `${p.name} is ${p.is_bot ? "no longer" : "now"} a bot.`)}>
                                        {p.is_bot ? "Unbot" : "Make bot"}
                                    </button>
                                    <button className="admin-btn admin-btn--danger"
                                            onClick={() => setDlg({ type: "delete", player: p })}>Delete</button>
                                </td>
                            </tr>
                        ))}
                        {!loading && players.length === 0 && (
                            <tr><td colSpan={8} className="admin-empty">No players.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {dlg?.type === "adjust" && (
                <Dialog
                    title={`Adjust bankroll — ${dlg.player.name}`}
                    hint={`Current: ${fmt(dlg.player.bankroll)}. Use a negative number to remove chips (can't go below 0).`}
                    onClose={close} busy={busy} okLabel="Apply"
                    okDisabled={!amount || !Number.isFinite(Number(amount)) || Number(amount) === 0}
                    onOk={() => run(
                        () => adminAdjustBankroll(dlg.player.player_id, amount, note),
                        "Bankroll adjusted."
                    )}
                >
                    <Field label="Amount (signed)">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }} type="number"
                               value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
                    </Field>
                    <Field label="Note">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                               value={note} onChange={e => setNote(e.target.value)} />
                    </Field>
                </Dialog>
            )}

            {dlg?.type === "reset-pin" && (
                <Dialog
                    title="Reset PIN" busy={busy} okLabel="Reset PIN" danger onClose={close}
                    hint={`Remove ${dlg.player.name}'s PIN? They'll be able to log in without one until they set a new PIN.`}
                    onOk={() => run(() => adminResetPin(dlg.player.player_id), "PIN reset.")}
                />
            )}

            {dlg?.type === "delete" && (
                <Dialog
                    title="Delete player" busy={busy} okLabel="Delete" danger onClose={close}
                    hint={`Delete ${dlg.player.name}? The account is tombstoned (history is kept) and sessions are revoked.`}
                    onOk={() => doDelete(dlg.player, false)}
                />
            )}

            {dlg?.type === "force-delete" && (
                <Dialog
                    title="Player is seated" busy={busy} okLabel="Force delete" danger onClose={close}
                    hint={`${dlg.player.name} is seated at table #${dlg.player.seated_table_id ?? "?"}. Force delete anyway?`}
                    onOk={() => doDelete(dlg.player, true)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Tables tab
// ─────────────────────────────────────────────

const POLICY_HINT = '{"type":"single","variant":"holdem"}';

const TablesTab = () => {
    const call = useAdminCall();
    const toast = useToast();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);
    const [detail, setDetail] = useState(null);   // getTable() state for openId
    const [dlg, setDlg] = useState(null);
    const [busy, setBusy] = useState(false);

    // dialog form state
    const [stack, setStack] = useState("");
    const [note, setNote] = useState("");
    const [form, setForm] = useState({});

    const load = useCallback(async () => {
        const r = await call(() => listTables());
        if (r.ok) setTables(r.data ?? []);
        setLoading(false);
    }, [call]);

    const loadDetail = useCallback(async (id) => {
        const r = await call(() => getTable(id));
        if (r.ok) setDetail(r.data);
    }, [call]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (openId == null) { setDetail(null); return; }
        loadDetail(openId);
    }, [openId, loadDetail]);

    const refreshAll = async () => { await load(); if (openId != null) await loadDetail(openId); };
    const close = () => { setDlg(null); setStack(""); setNote(""); setForm({}); };

    const run = async (fn, msg) => {
        setBusy(true);
        const r = await call(fn, msg);
        setBusy(false);
        if (r.ok) { close(); await refreshAll(); }
        return r;
    };

    // ── Edit settings: send ONLY changed fields ──────────────
    const openEdit = (t) => {
        const tb = detail?.table?.id === t.id ? detail.table : {};
        setForm({
            _orig: {
                name: t.name ?? "",
                max_seats: t.max_seats ?? "",
                small_blind: t.stakes?.small_blind ?? "",
                big_blind: t.stakes?.big_blind ?? "",
                ante: t.stakes?.ante ?? 0,
                min_buyin: t.min_buyin ?? "",
                max_buyin: t.max_buyin ?? "",
                owner_player_id: tb.owner_player_id ?? "",
                variant_allowlist: (tb.variant_allowlist ?? []).join(", "),
                variant_policy: tb.variant_policy ? JSON.stringify(tb.variant_policy) : "",
            },
        });
        setForm(f => ({ ...f, ...f._orig }));
        setDlg({ type: "edit", table: t });
    };

    const buildChanges = () => {
        const o = form._orig ?? {};
        const ch = {};
        const num = (k) => { if (String(form[k]) !== String(o[k])) ch[k] = Number(form[k]); };
        if (form.name !== o.name) ch.name = String(form.name).trim();
        ["max_seats", "small_blind", "big_blind", "ante", "min_buyin", "max_buyin"].forEach(num);
        if (String(form.owner_player_id) !== String(o.owner_player_id)) {
            ch.owner_player_id = form.owner_player_id === "" ? null : Number(form.owner_player_id);
        }
        if (form.variant_allowlist !== o.variant_allowlist) {
            const list = String(form.variant_allowlist).split(",").map(s => s.trim()).filter(Boolean);
            ch.variant_allowlist = list.length ? list : null;
        }
        if (form.variant_policy !== o.variant_policy) {
            try { ch.variant_policy = JSON.parse(form.variant_policy); }
            catch { return { error: "variant_policy must be valid JSON." }; }
        }
        return { changes: ch };
    };

    const submitEdit = async () => {
        const { changes, error } = buildChanges();
        if (error) { toast.error(error); return; }
        if (Object.keys(changes).length === 0) { close(); return; }
        await run(() => adminPatchTable(dlg.table.id, changes), "Table updated.");
    };

    const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    const inHand = (t) => t.status === "IN_HAND";
    const seats = detail?.seats ?? [];

    return (
        <div className="admin-section">
            <div className="admin-toolbar">
                <button className="admin-btn" onClick={refreshAll} disabled={loading}>↻ Refresh</button>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr><th>ID</th><th>Name</th><th>Status</th><th>Seats</th><th>Stakes</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {tables.map(t => (
                            <React.Fragment key={t.id}>
                                <tr className={openId === t.id ? "admin-row--open" : ""}>
                                    <td>{t.id}</td>
                                    <td>{t.name}</td>
                                    <td>{t.status}</td>
                                    <td>{t.seated}/{t.max_seats}</td>
                                    <td>{fmt(t.stakes?.small_blind)}/{fmt(t.stakes?.big_blind)}</td>
                                    <td className="admin-actions">
                                        <button className="admin-btn"
                                                onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                                            {openId === t.id ? "Hide seats" : "Seats"}
                                        </button>
                                        <button className="admin-btn" disabled={inHand(t) || t.status === "CLOSED"}
                                                title={inHand(t) ? "Not allowed while a hand is in progress" : undefined}
                                                onClick={() => openEdit(t)}>Edit</button>
                                        <button className="admin-btn admin-btn--danger"
                                                disabled={t.status === "CLOSED"}
                                                onClick={() => setDlg({ type: "force-close", table: t })}>Force close</button>
                                        <button className="admin-btn admin-btn--danger"
                                                disabled={t.status !== "CLOSED"}
                                                title={t.status !== "CLOSED" ? "Closed tables only" : undefined}
                                                onClick={() => setDlg({ type: "delete", table: t })}>Delete</button>
                                    </td>
                                </tr>
                                {openId === t.id && (
                                    <tr className="admin-row--detail">
                                        <td colSpan={6}>
                                            {seats.filter(s => s.player_id != null).length === 0 ? (
                                                <div className="admin-empty">No one seated.</div>
                                            ) : (
                                                <table className="admin-table admin-table--inner">
                                                    <thead><tr><th>Seat</th><th>Player</th><th>Stack</th><th>Actions</th></tr></thead>
                                                    <tbody>
                                                        {seats.filter(s => s.player_id != null).map(s => (
                                                            <tr key={s.seat}>
                                                                <td>{s.seat}</td>
                                                                <td>{s.name} <span className="admin-muted">#{s.player_id}</span></td>
                                                                <td className="admin-num">{fmt(s.stack)}</td>
                                                                <td className="admin-actions">
                                                                    <button className="admin-btn"
                                                                            onClick={() => setDlg({ type: "kick", table: t, seat: s })}>Kick</button>
                                                                    <button className="admin-btn"
                                                                            disabled={inHand(t)}
                                                                            title={inHand(t) ? "Not allowed while a hand is in progress" : undefined}
                                                                            onClick={() => { setStack(String(s.stack ?? 0)); setDlg({ type: "set-stack", table: t, seat: s }); }}>
                                                        Set stack</button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                        {!loading && tables.length === 0 && (
                            <tr><td colSpan={6} className="admin-empty">No tables.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {dlg?.type === "kick" && (
                <Dialog
                    title="Kick player" busy={busy} okLabel="Kick" danger onClose={close}
                    hint={`Remove ${dlg.seat.name} from "${dlg.table.name}"?${inHand(dlg.table) ? " A hand is in progress: they'll be auto-folded and leave after the hand." : ""}`}
                    onOk={() => run(() => adminKick(dlg.table.id, dlg.seat.player_id), "Player kicked.")}
                />
            )}

            {dlg?.type === "set-stack" && (
                <Dialog
                    title={`Set stack — ${dlg.seat.name}`} busy={busy} okLabel="Set stack" onClose={close}
                    hint={`Current stack ${fmt(dlg.seat.stack)}. Raising is funded from the player's bankroll (fails if insufficient); lowering refunds it. Stack 0 busts the player.`}
                    okDisabled={stack === "" || !(Number(stack) >= 0)}
                    onOk={() => run(
                        () => adminSetStack(dlg.table.id, dlg.seat.player_id, stack, note),
                        "Stack updated."
                    )}
                >
                    <Field label="New stack">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }} type="number" min={0}
                               value={stack} onChange={e => setStack(e.target.value)} autoFocus />
                    </Field>
                    <Field label="Note">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                               value={note} onChange={e => setNote(e.target.value)} />
                    </Field>
                </Dialog>
            )}

            {dlg?.type === "force-close" && (
                <Dialog
                    title="Force close table" busy={busy} okLabel="Force close" danger onClose={close}
                    hint={inHand(dlg.table)
                        ? `"${dlg.table.name}" has a hand in progress. Closing VOIDS the hand: stacks are refunded to their pre-hand values and no result is recorded.`
                        : `Close "${dlg.table.name}" and cash everyone out?`}
                    onOk={() => run(() => adminForceClose(dlg.table.id), "Table closed.")}
                />
            )}

            {dlg?.type === "delete" && (
                <Dialog
                    title="Delete table" busy={busy} okLabel="Delete" danger onClose={close}
                    hint={`Delete closed table "${dlg.table.name}"? Hand and ledger history are kept.`}
                    onOk={async () => {
                        const r = await run(() => adminDeleteTable(dlg.table.id), "Table deleted.");
                        if (r.ok && openId === dlg.table.id) setOpenId(null);
                    }}
                />
            )}

            {dlg?.type === "edit" && (
                <Dialog
                    title={`Edit table — ${dlg.table.name}`} busy={busy} okLabel="Save" onClose={close}
                    hint="Only changed fields are sent. Empty owner / allowlist clears them. Changing variant policy or allowlist clears any queued variant and open pick."
                    onOk={submitEdit}
                >
                    <Field label="Name">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                               value={form.name ?? ""} maxLength={40} onChange={setF("name")} />
                    </Field>
                    <div className="admin-grid">
                        {[
                            ["max_seats", "Seats"], ["small_blind", "Small blind"], ["big_blind", "Big blind"],
                            ["ante", "Ante"], ["min_buyin", "Min buy-in"], ["max_buyin", "Max buy-in"],
                        ].map(([k, l]) => (
                            <Field key={k} label={l}>
                                <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                                       type="number" min={0} value={form[k] ?? ""} onChange={setF(k)} />
                            </Field>
                        ))}
                    </div>
                    <Field label="Owner player ID (empty = none)">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                               type="number" value={form.owner_player_id ?? ""} onChange={setF("owner_player_id")} />
                    </Field>
                    <Field label="Variant allowlist (comma-separated, empty = all)">
                        <input className="auth-modal__input" style={{ letterSpacing: "normal" }}
                               value={form.variant_allowlist ?? ""} onChange={setF("variant_allowlist")} />
                    </Field>
                    <Field label="Variant policy (JSON)">
                        <textarea className="auth-modal__input admin-textarea" rows={3}
                                  placeholder={POLICY_HINT}
                                  value={form.variant_policy ?? ""} onChange={setF("variant_policy")} />
                    </Field>
                </Dialog>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Ledger tab
// ─────────────────────────────────────────────

const LedgerTab = () => {
    const call = useAdminCall();
    const [rows, setRows] = useState([]);
    const [playerId, setPlayerId] = useState("");
    const [tableId, setTableId] = useState("");
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (off = 0) => {
        setLoading(true);
        const r = await call(() => adminLedger({
            playerId: playerId || undefined,
            tableId: tableId || undefined,
            limit: PAGE, offset: off,
        }));
        if (r.ok) { setRows(r.data ?? []); setOffset(off); }
        setLoading(false);
    }, [call, playerId, tableId]);
    useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="admin-section">
            <div className="admin-toolbar">
                <input className="admin-input" type="number" placeholder="Player ID"
                       value={playerId} onChange={e => setPlayerId(e.target.value)} />
                <input className="admin-input" type="number" placeholder="Table ID"
                       value={tableId} onChange={e => setTableId(e.target.value)} />
                <button className="admin-btn admin-btn--primary" onClick={() => load(0)} disabled={loading}>Filter</button>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr><th>Time</th><th>Type</th><th>Player</th><th>Table</th><th>Amount</th><th>Note</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={r.id ?? i}>
                                <td>{when(r.ts ?? r.created_at)}</td>
                                <td>{r.type ?? r.entry_type}</td>
                                <td>{r.player_id ?? "—"}</td>
                                <td>{r.table_id ?? "—"}</td>
                                <td className={`admin-num ${Number(r.amount) < 0 ? "admin-neg" : "admin-pos"}`}>{fmt(r.amount)}</td>
                                <td>{r.note ?? ""}</td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={6} className="admin-empty">No ledger entries.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Pager offset={offset} count={rows.length} loading={loading} onPage={load} />
        </div>
    );
};

// ─────────────────────────────────────────────
// Audit tab
// ─────────────────────────────────────────────

const AuditTab = () => {
    const call = useAdminCall();
    const [rows, setRows] = useState([]);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (off = 0) => {
        setLoading(true);
        const r = await call(() => adminAudit({ limit: PAGE, offset: off }));
        if (r.ok) { setRows(r.data ?? []); setOffset(off); }
        setLoading(false);
    }, [call]);
    useEffect(() => { load(0); }, [load]);

    return (
        <div className="admin-section">
            <div className="admin-toolbar">
                <button className="admin-btn" onClick={() => load(offset)} disabled={loading}>↻ Refresh</button>
            </div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Payload</th></tr></thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={r.id ?? i}>
                                <td>{when(r.ts)}</td>
                                <td>{r.action}</td>
                                <td>{r.target_type}{r.target_id != null ? ` #${r.target_id}` : ""}</td>
                                <td><code className="admin-payload">
                                    {typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload)}
                                </code></td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={4} className="admin-empty">No audit entries.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            <Pager offset={offset} count={rows.length} loading={loading} onPage={load} />
        </div>
    );
};

const Pager = ({ offset, count, loading, onPage }) => (
    <div className="admin-pager">
        <button className="admin-btn" disabled={offset === 0 || loading}
                onClick={() => onPage(Math.max(0, offset - PAGE))}>← Newer</button>
        <span className="admin-muted">{count ? `${offset + 1}–${offset + count}` : "0"}</span>
        <button className="admin-btn" disabled={count < PAGE || loading}
                onClick={() => onPage(offset + PAGE)}>Older →</button>
    </div>
);

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

const TABS = [
    { id: "players", label: "Players", C: PlayersTab },
    { id: "tables",  label: "Tables",  C: TablesTab },
    { id: "ledger",  label: "Ledger",  C: LedgerTab },
    { id: "audit",   label: "Audit",   C: AuditTab },
];

const AdminPage = () => {
    const { isAdmin, ready, logout } = useAuth();
    const [tab, setTab] = useState("players");

    if (!ready) return <div className="admin-page">Loading…</div>;
    if (!isAdmin) return <div className="admin-page"><AdminLogin /></div>;

    const Active = TABS.find(t => t.id === tab).C;

    return (
        <div className="admin-page">
            <div className="admin-header">
                <div className="admin-page__title">🛠 Admin console</div>
                <button className="admin-btn" onClick={logout}>Log out</button>
            </div>
            <div className="admin-tabs">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`admin-tab ${tab === t.id ? "admin-tab--active" : ""}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <Active />
        </div>
    );
};

export default AdminPage;