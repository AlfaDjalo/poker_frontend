import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTables, createTable, listVariantNames } from "../api/tableApi";
import { useAuthRetry } from "../hooks/useAuthRetry";
import { useSession } from "../hooks/useSession";
import { useToast } from "./ToastProvider";
import "../css/Lobby.css";

const POLICY_TYPES = [
    { value: "single",               label: "Single variant" },
    { value: "dealers_choice_hand",  label: "Dealer's choice (each hand)" },
    { value: "dealers_choice_orbit", label: "Dealer's choice (each orbit)" },
    { value: "rotation",             label: "Rotation" },
    { value: "mixed",                label: "Mixed (HORSE-style)" },
    { value: "random",               label: "Random" },
];

const FALLBACKS = ["previous", "default", "random"];

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const label = (v) => String(v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const policyText = (p) => {
    if (!p) return "—";
    const t = POLICY_TYPES.find(x => x.value === p.type)?.label ?? p.type;
    return p.type === "single" && p.variant ? `${t}: ${label(p.variant)}` : t;
};

const num = (v) => (v === "" || v == null ? null : Number(v));

// ─────────────────────────────────────────────
// Create-table form
// ─────────────────────────────────────────────

const CreateTableForm = ({ variants, onCreated, onCancel }) => {
    const { playerId, recording } = useSession();
    const withAuthRetry = useAuthRetry(playerId);
    const toast = useToast();

    const globalOn = !!recording.enabled;

    const [name, setName] = useState("");
    const [maxSeats, setMaxSeats] = useState(6);
    const [sb, setSb] = useState(1);
    const [bb, setBb] = useState(2);
    const [ante, setAnte] = useState(0);
    const [minBuy, setMinBuy] = useState(100);
    const [maxBuy, setMaxBuy] = useState(400);

    const [policyType, setPolicyType] = useState("single");
    const [singleVariant, setSingleVariant] = useState("");
    const [listVariants, setListVariants] = useState([]);   // rotation/mixed/random
    const [handsPer, setHandsPer] = useState(1);
    const [pickTimeout, setPickTimeout] = useState(30);
    const [fallback, setFallback] = useState("previous");
    const [defaultVariant, setDefaultVariant] = useState("");
    const [noRepeat, setNoRepeat] = useState(0);

    const [restrict, setRestrict] = useState(false);
    const [allowlist, setAllowlist] = useState([]);

    const [record, setRecord] = useState(globalOn);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { if (!globalOn) setRecord(false); else setRecord(true); }, [globalOn]);
    useEffect(() => {
        if (!singleVariant && variants.length) setSingleVariant(variants[0]);
    }, [variants, singleVariant]);

    const isDC = policyType === "dealers_choice_hand" || policyType === "dealers_choice_orbit";
    const isList = policyType === "rotation" || policyType === "mixed" || policyType === "random";

    const toggleIn = (arr, setArr, v) =>
        setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

    const buildPolicy = () => {
        switch (policyType) {
            case "single":
                return { type: "single", variant: singleVariant };
            case "dealers_choice_hand":
            case "dealers_choice_orbit": {
                const p = { type: policyType, pick_timeout: Number(pickTimeout) || 30, fallback };
                if (fallback === "default" && defaultVariant) p.default_variant = defaultVariant;
                if (Number(noRepeat) > 0) p.no_repeat_last_n = Number(noRepeat);
                return p;
            }
            case "rotation":
                return { type: "rotation", variants: listVariants, hands_per_variant: Number(handsPer) || 1 };
            case "mixed":
                return { type: "mixed", variants: listVariants, hands_per_game: Number(handsPer) || 1 };
            case "random": {
                const p = { type: "random" };
                if (listVariants.length) p.variants = listVariants;
                if (Number(noRepeat) > 0) p.no_repeat_last_n = Number(noRepeat);
                return p;
            }
            default:
                return { type: policyType };
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return toast.error("Table needs a name.");
        if (isList && policyType !== "random" && listVariants.length === 0) {
            return toast.error("Choose at least one variant for this policy.");
        }
        const spec = {
            name: name.trim(),
            owner_player_id: playerId,
            max_seats: Number(maxSeats),
            small_blind: Number(sb),
            big_blind: Number(bb),
            ante: Number(ante),
            min_buyin: Number(minBuy),
            max_buyin: Number(maxBuy),
            variant_policy: buildPolicy(),
            variant_allowlist: restrict && allowlist.length ? allowlist : null,
        };
        // Omit `recording` to follow global; send false to opt out.
        if (globalOn && !record) spec.recording = false;

        setSubmitting(true);
        try {
            const state = await withAuthRetry(() => createTable(spec));
            toast.success(`Table "${state.table.name}" created.`);
            onCreated(state.table.id);
        } catch (err) {
            toast.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const VariantChecks = ({ value, setValue }) => (
        <div className="lobby__checks">
            {variants.map(v => (
                <label key={v} className="lobby__check">
                    <input
                        type="checkbox"
                        checked={value.includes(v)}
                        onChange={() => toggleIn(value, setValue, v)}
                    />
                    {label(v)}
                </label>
            ))}
        </div>
    );

    return (
        <form className="lobby__form" onSubmit={handleSubmit}>
            <div className="lobby__subtitle">Create table</div>

            <label className="lobby__field">
                <span>Name</span>
                <input className="lobby__input" value={name} maxLength={40}
                       onChange={e => setName(e.target.value)} />
            </label>

            <div className="lobby__grid">
                <label className="lobby__field">
                    <span>Seats</span>
                    <input className="lobby__input" type="number" min={2} max={9}
                           value={maxSeats} onChange={e => setMaxSeats(e.target.value)} />
                </label>
                <label className="lobby__field">
                    <span>Small blind</span>
                    <input className="lobby__input" type="number" min={0}
                           value={sb} onChange={e => setSb(e.target.value)} />
                </label>
                <label className="lobby__field">
                    <span>Big blind</span>
                    <input className="lobby__input" type="number" min={0}
                           value={bb} onChange={e => setBb(e.target.value)} />
                </label>
                <label className="lobby__field">
                    <span>Ante</span>
                    <input className="lobby__input" type="number" min={0}
                           value={ante} onChange={e => setAnte(e.target.value)} />
                </label>
                <label className="lobby__field">
                    <span>Min buy-in</span>
                    <input className="lobby__input" type="number" min={1}
                           value={minBuy} onChange={e => setMinBuy(e.target.value)} />
                </label>
                <label className="lobby__field">
                    <span>Max buy-in</span>
                    <input className="lobby__input" type="number" min={1}
                           value={maxBuy} onChange={e => setMaxBuy(e.target.value)} />
                </label>
            </div>

            <label className="lobby__field">
                <span>Variant policy</span>
                <select className="lobby__input" value={policyType}
                        onChange={e => setPolicyType(e.target.value)}>
                    {POLICY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
            </label>

            {policyType === "single" && (
                <label className="lobby__field">
                    <span>Variant</span>
                    <select className="lobby__input" value={singleVariant}
                            onChange={e => setSingleVariant(e.target.value)}>
                        {variants.map(v => <option key={v} value={v}>{label(v)}</option>)}
                    </select>
                </label>
            )}

            {isDC && (
                <div className="lobby__grid">
                    <label className="lobby__field">
                        <span>Pick timeout (s)</span>
                        <input className="lobby__input" type="number" min={5}
                               value={pickTimeout} onChange={e => setPickTimeout(e.target.value)} />
                    </label>
                    <label className="lobby__field">
                        <span>If no pick</span>
                        <select className="lobby__input" value={fallback}
                                onChange={e => setFallback(e.target.value)}>
                            {FALLBACKS.map(f => <option key={f} value={f}>{label(f)}</option>)}
                        </select>
                    </label>
                    {fallback === "default" && (
                        <label className="lobby__field">
                            <span>Default variant</span>
                            <select className="lobby__input" value={defaultVariant}
                                    onChange={e => setDefaultVariant(e.target.value)}>
                                <option value="">—</option>
                                {variants.map(v => <option key={v} value={v}>{label(v)}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="lobby__field">
                        <span>No repeat (last N)</span>
                        <input className="lobby__input" type="number" min={0}
                               value={noRepeat} onChange={e => setNoRepeat(e.target.value)} />
                    </label>
                </div>
            )}

            {isList && (
                <>
                    <div className="lobby__hint">
                        {policyType === "random" ? "Variants to draw from (none = all)" : "Variants, in order of selection"}
                    </div>
                    <VariantChecks value={listVariants} setValue={setListVariants} />
                    <div className="lobby__grid">
                        {policyType !== "random" && (
                            <label className="lobby__field">
                                <span>{policyType === "rotation" ? "Hands per variant" : "Hands per game"}</span>
                                <input className="lobby__input" type="number" min={1}
                                       value={handsPer} onChange={e => setHandsPer(e.target.value)} />
                            </label>
                        )}
                        {policyType === "random" && (
                            <label className="lobby__field">
                                <span>No repeat (last N)</span>
                                <input className="lobby__input" type="number" min={0}
                                       value={noRepeat} onChange={e => setNoRepeat(e.target.value)} />
                            </label>
                        )}
                    </div>
                </>
            )}

            <label className="lobby__check">
                <input type="checkbox" checked={restrict}
                       onChange={e => setRestrict(e.target.checked)} />
                Restrict allowed variants
            </label>
            {restrict && <VariantChecks value={allowlist} setValue={setAllowlist} />}

            <label className="lobby__check">
                <input type="checkbox" checked={record} disabled={!globalOn}
                       onChange={e => setRecord(e.target.checked)} />
                Record this session
                {!globalOn && <span className="lobby__muted"> (recording is off in Settings)</span>}
            </label>

            <div className="lobby__actions">
                <button type="button" className="lobby__btn lobby__btn--ghost" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="lobby__btn" disabled={submitting}>
                    {submitting ? "Creating…" : "Create"}
                </button>
            </div>
        </form>
    );
};

// ─────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────

const Lobby = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const { player } = useSession();

    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [variants, setVariants] = useState([]);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        try { setTables(await listTables()); }
        catch (e) { toast.error(e); }
        finally { setLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        load();
        const id = setInterval(load, 3000);
        return () => clearInterval(id);
    }, [load]);

    useEffect(() => {
        listVariantNames().then(setVariants).catch(e => toast.error(e));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const open = useMemo(() => tables.filter(t => t.status !== "CLOSED"), [tables]);

    return (
        <div className="lobby">
            <div className="lobby__header">
                <div className="lobby__title">Lobby</div>
                {player && <span className="lobby__muted">{player.name}</span>}
                <button className="lobby__btn" onClick={() => setCreating(v => !v)}>
                    {creating ? "Close form" : "+ Create table"}
                </button>
            </div>

            {creating && (
                <CreateTableForm
                    variants={variants}
                    onCancel={() => setCreating(false)}
                    onCreated={(id) => navigate(`/table/${id}`)}
                />
            )}

            <div className="lobby__list">
                {loading && <div className="lobby__empty">Loading…</div>}
                {!loading && open.length === 0 && (
                    <div className="lobby__empty">No open tables. Create one.</div>
                )}
                {open.map(t => (
                    <button
                        key={t.id}
                        className="lobby__row"
                        onClick={() => navigate(`/table/${t.id}`)}
                    >
                        <span className="lobby__row-name">{t.name}</span>
                        {t.recording === false && (
                            <span className="lobby__badge">NOT RECORDING</span>
                        )}
                        <span className="lobby__row-meta">{policyText(t.policy)}</span>
                        <span className="lobby__row-meta">
                            {fmt(t.stakes?.small_blind)}/{fmt(t.stakes?.big_blind)}
                            {t.stakes?.ante ? ` · ante ${fmt(t.stakes.ante)}` : ""}
                        </span>
                        <span className="lobby__row-meta">
                            buy-in {fmt(t.min_buyin)}–{fmt(t.max_buyin)}
                        </span>
                        <span className="lobby__row-seats">{t.seated}/{t.max_seats}</span>
                        <span className="lobby__row-status">{t.status}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Lobby;