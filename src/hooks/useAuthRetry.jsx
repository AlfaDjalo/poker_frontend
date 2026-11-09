// src/hooks/useAuthRetry.js
import { useCallback } from "react";
import { useAuth } from "./useAuth";

/**
 * const withAuthRetry = useAuthRetry(playerId);
 * const result = await withAuthRetry(() => sendTableAction(...));
 *
 * - Auth-required error -> PIN modal -> retry exactly once if login succeeded.
 * - Cancelled modal -> original error is rethrown.
 * - Any other error, or a failure on the retry, is rethrown unchanged.
 */
export function useAuthRetry(playerId) {
    const { requestLogin } = useAuth();

    return useCallback(async (fn) => {
        try {
            return await fn();
        } catch (e) {
            if (!e?.isAuthRequired || playerId == null) throw e;
            const ok = await requestLogin(playerId);
            if (!ok) throw e;
            return fn();
        }
    }, [playerId, requestLogin]);
}