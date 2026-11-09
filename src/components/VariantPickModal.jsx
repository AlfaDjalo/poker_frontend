import React, { useEffect, useMemo, useState } from "react";
import { listVariantNames, getVariantOptions, pickVariant, secondsLeft } from "../api/tableApi";
import { useNow } from "../hooks/useTable";
import { useToast } from "./ToastProvider";
import "../css/VariantPickModal.css";

const label = (v) => String(v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/**
 * Props:
 *   tableId, playerId
 *   table       - state.table
 *   run         - async (fn) => state|null
 *   busy        - bool
 *   onClose     - () => void  (dismiss without picking)
 */
const VariantPickModal = ({ tableId, playerId, table, run, busy, onClose }) => {
    const toast = useToast();
    const now = useNow(!!table?.pick_deadline);
    const left = secondsLeft(table?.pick_deadline, now);

    const [names, setNames] = useState([]);
    const [variant, setVariant] = useState("");
    const [schema, setSchema] = useState(null);      // {options:[...]}
    const [values, setValues] = useState({});        // key -> value (user edits only)
    const [loadingOpts, setLoadingOpts] = useState(false);

    const allowlist = table?.variant_allowlist;
    const choices = useMemo(
        () => (allowlist?.length ? names.filter(n => allowlist.includes(n)) : names),
        [names, allowlist]
    );

    useEffect(() => {
        listVariantNames().then(setNames).catch(e => toast.error(e));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!variant && choices.length) setVariant(choices[0]);
    }, [choices, variant]);

    useEffect(() => {
        if (!variant) return undefined;
        let cancelled = false;
        setLoadingOpts(true);
        setValues({});
        getVariantOptions(variant)
            .then(s => { if (!cancelled) setSchema(s); })
            .catch(e => { if (!cancelled) { setSchema(null); toast.error(e); } })
            .finally(() => { if (!cancelled) setLoadingOpts(false); });
        return () => { cancelled = true; };
    }, [variant]); // eslint-disable-line react-hooks/exhaustive-deps

    const options = schema?.options ?? [];

    const valueOf = (o) => (o.key in values ? values[o.key] : o.default);

    const setVal = (o, v) => setValues(prev => {
        const next = { ...prev };
        // Only keep keys that differ from the default.
        if (v === o.default) delete next[o.key];
        else next[o.key] = v;
        return next;
    });

    const submit = async () => {
        if (!variant) return;
        const config = {};
        options.forEach(o => {
            if (o.key in values) {
                config[o.key] = o.type === "int" ? Number(values[o.key]) : !!values[o.key];
            }
        });
        const s = await run(() => pickVariant(tableId, playerId, variant, config));
        if (s) onClose();
    };

    return (
        <div className="variant-modal__backdrop">
            <div className="variant-modal" role="dialog" aria-modal="true">
                <div className="variant-modal__header">
                    <span className="variant-modal__title">Choose the variant</span>
                    {left != null && (
                        <span className={`variant-modal__timer ${left <= 10 ? "variant-modal__timer--low" : ""}`}>
                            {left}s
                        </span>
                    )}
                </div>

                <label className="variant-modal__field">
                    <span>Variant</span>
                    <select
                        className="variant-modal__input"
                        value={variant}
                        onChange={e => setVariant(e.target.value)}
                    >
                        {choices.map(v => <option key={v} value={v}>{label(v)}</option>)}
                    </select>
                </label>

                {loadingOpts && <div className="variant-modal__muted">Loading options…</div>}

                {!loadingOpts && options.length > 0 && (
                    <div className="variant-modal__options">
                        {options.map(o => (
                            o.type === "bool" ? (
                                <label key={o.key} className="variant-modal__check">
                                    <input
                                        type="checkbox"
                                        checked={!!valueOf(o)}
                                        onChange={e => setVal(o, e.target.checked)}
                                    />
                                    {o.label ?? label(o.key)}
                                </label>
                            ) : (
                                <label key={o.key} className="variant-modal__field">
                                    <span>{o.label ?? label(o.key)}</span>
                                    <input
                                        className="variant-modal__input"
                                        type="number"
                                        min={o.min ?? 0}
                                        value={valueOf(o)}
                                        onChange={e => setVal(o, e.target.value === "" ? o.default : Number(e.target.value))}
                                    />
                                </label>
                            )
                        ))}
                    </div>
                )}

                <div className="variant-modal__note">
                    Blinds and per-hand options are recorded but may not yet be applied by the engine.
                </div>

                <div className="variant-modal__actions">
                    <button type="button" className="game-btn" onClick={onClose} disabled={busy}>
                        Later
                    </button>
                    <button
                        type="button"
                        className="game-btn variant-modal__ok"
                        onClick={submit}
                        disabled={busy || !variant}
                    >
                        {busy ? "…" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VariantPickModal;