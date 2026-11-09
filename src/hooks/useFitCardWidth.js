import { createContext, useContext, useLayoutEffect, useState } from "react";

export const DEFAULT_CARD_W = 50;

// Provided by PokerTable; read by Hand. Outside a table, falls back to defaults.
const TableMetricsContext = createContext({ cardW: DEFAULT_CARD_W, holeScale: 1, seatW: () => 160 });
export const TableMetricsProvider = TableMetricsContext.Provider;
export const useTableMetrics = () => useContext(TableMetricsContext);

/**
 * Measures `ref`, computes the largest card width that fits, writes it to
 * `--card-w` on that element (so every descendant Card sizes from it) and
 * returns { cardW, width, height }.
 *
 * Fit rule: min(boxW*W / cols, boxH*H / (rows * aspect)), clamped to [min, max].
 * `fit(boxPxW, boxPxH)` overrides cols/rows (used for irregular board layouts).
 * Pass a memoised `fit`, or it re-subscribes every render.
 */
export function useFitCardWidth(
  ref,
  { cols = 1, rows = 1, aspect = 1.4, min = 16, max = 96, fit } = {}
) {
  const [size, setSize] = useState({ cardW: DEFAULT_CARD_W, width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (!width || !height) return;
      const raw = fit ? fit(width, height) : Math.min(width / cols, height / (rows * aspect));
      const cardW = Math.floor(Math.max(min, Math.min(max, raw)));
      el.style.setProperty("--card-w", `${cardW}px`);
      setSize(prev =>
        prev.cardW === cardW && prev.width === width && prev.height === height
          ? prev
          : { cardW, width, height }
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, cols, rows, aspect, min, max, fit]);

  return size;
}