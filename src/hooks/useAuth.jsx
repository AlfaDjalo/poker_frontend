// src/hooks/useAuth.jsx
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
    fetchMe, login as apiLogin, logout as apiLogout, adminLogin as apiAdminLogin,
    getToken, getStoredIsAdmin, clearStoredAuth, subscribeAuth,
} from "../api/authApi";
import { useSession } from "./useSession";

const AuthContext = createContext(null);

/**
 * useAuth() -> {
 *   token, isLoggedIn, isAdmin, ready,
 *   authPlayer,                       // player from /auth/me (or last login) | null
 *   login(playerId, pin?)             // -> player; throws ApiError (401/429)
 *   logout()
 *   adminLogin(password)              // throws ApiError (401/503)
 *   refreshMe()
 *   requestLogin(playerId)            // -> Promise<boolean>; opens PIN modal
 *   pendingLogin, resolveLogin(ok)    // consumed by PinLoginModal
 * }
 */
export function AuthProvider({ children }) {
    const { selectPlayer, player } = useSession();

    const [token, setToken] = useState(getToken());
    const [isAdmin, setIsAdmin] = useState(getStoredIsAdmin());
    const [authPlayer, setAuthPlayer] = useState(null);
    const [ready, setReady] = useState(false);
    const [pendingLogin, setPendingLogin] = useState(null); // { playerId }
    const resolverRef = useRef(null);

    // Mirror localStorage changes (login/logout/clear) into state.
    useEffect(() => subscribeAuth(() => {
        setToken(getToken());
        setIsAdmin(getStoredIsAdmin());
    }), []);

    // GET /auth/me. Stale token => clear silently (server treats it as anonymous).
    const refreshMe = useCallback(async () => {
        const hadToken = !!getToken();
        try {
            const me = await fetchMe();
            if (hadToken && !me.player && !me.is_admin) {
                clearStoredAuth();
                setAuthPlayer(null);
                setIsAdmin(false);
            } else {
                setAuthPlayer(me.player);
                setIsAdmin(me.is_admin);
                if (me.player) selectPlayer(me.player);
            }
            return me;
        } catch {
            return null; // network error: keep current state
        }
    }, [selectPlayer]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (getToken()) await refreshMe();
            if (!cancelled) setReady(true);
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Detect mid-session token expiry: re-check when the tab regains focus.
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "visible" && getToken()) refreshMe();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [refreshMe]);

    const login = useCallback(async (playerId, pin) => {
        const res = await apiLogin(playerId, pin);
        setAuthPlayer(res.player ?? null);
        if (res.player) selectPlayer(res.player);
        return res.player;
    }, [selectPlayer]);

    const logout = useCallback(async () => {
        await apiLogout();
        setAuthPlayer(null);
        setIsAdmin(false);
    }, []);

    const adminLogin = useCallback(async (password) => {
        const res = await apiAdminLogin(password);
        setIsAdmin(true);
        return res;
    }, []);

    // ── PIN modal plumbing ──────────────────────────────────
    const requestLogin = useCallback((playerId) => new Promise((resolve) => {
        // Supersede any dangling request.
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setPendingLogin({ playerId });
    }), []);

    const resolveLogin = useCallback((ok) => {
        resolverRef.current?.(!!ok);
        resolverRef.current = null;
        setPendingLogin(null);
    }, []);

    const value = useMemo(() => ({
        token,
        isLoggedIn: !!token && !isAdmin,
        isAdmin,
        ready,
        authPlayer: authPlayer ?? (token ? player : null),
        login, logout, adminLogin, refreshMe,
        requestLogin, pendingLogin, resolveLogin,
    }), [token, isAdmin, ready, authPlayer, player, login, logout, adminLogin,
         refreshMe, requestLogin, pendingLogin, resolveLogin]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}