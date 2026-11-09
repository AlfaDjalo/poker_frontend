import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useAuth } from "../hooks/useAuth";
import "../css/Navbar.css";

// NOTE: Equity Calculator used to have its own disabled "coming soon"
// nav entry pointing at a placeholder page. That was left over from
// before equity moved to being an in-context panel — it's fully live
// today via the "📊 Equity" toggle in Game Simulator and the Equity
// panel in Hand Replayer's sidebar (EquityPanel + useEquity.jsx +
// POST /equity/calculate), it just never had — and doesn't need — a
// standalone page of its own. Removing the dead nav item (and its
// PlaceholderPage route in App.jsx) so it stops implying the feature
// doesn't exist.
 const NAV_ITEMS = [
     { path: "/",          label: "Game Simulator",  icon: "♠" },
     { path: "/lobby",     label: "Tables",          icon: "🎲" },
     { path: "/replay",    label: "Hand Replayer",    icon: "⏪" },
     { path: "/tutorial",  label: "Tutorial",      icon: "📖" },
     { path: "/trainer",   label: "Trainer",       icon: "🎯" },
     { path: "/settings",  label: "Settings",      icon: "⚙" },
 ];

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);

    const { player } = useSession();
    const { isAdmin, isLoggedIn, logout } = useAuth();

    const items = [
        ...NAV_ITEMS,
        ...(isAdmin ? [{ path: "/admin", icon: "🛠", label: "Admin" }] : []),
        {
            path: "/players",
            path: player ? "/profile" : "/players",
            icon: "🙂",
            label: player
                ? `${player.name} · ${Number(player.bankroll ?? 0).toLocaleString()}`
                : "Choose player",
        },
    ];

    return (
        <nav className="navbar">
            <div className="navbar__inner">

                {/* ── Logo ── */}
                <NavLink to="/" className="navbar__logo">
                    <span className="navbar__logo-icon">🃏</span>
                    <span className="navbar__logo-text">CAP</span>
                </NavLink>

                {/* ── Desktop nav ── */}
                <div className="navbar__links">
                    {items.map(({ path, label, icon, disabled }) =>
                        disabled ? (
                            <span key={path} className="navbar__link navbar__link--disabled" title="Coming soon">
                                <span className="navbar__link-icon">{icon}</span>
                                {label}
                                <span className="navbar__soon">soon</span>
                            </span>
                        ) : (
                            <NavLink
                                key={path}
                                to={path}
                                end={path === "/"}
                                className={({ isActive }) =>
                                    `navbar__link ${isActive ? "navbar__link--active" : ""}`
                                }
                            >
                                <span className="navbar__link-icon">{icon}</span>
                                {label}
                            </NavLink>
                        )
                    )}
                    {(isLoggedIn || isAdmin) && (
                        <button className="navbar__link" onClick={logout} title="Log out">
                            ⎋ Log out
                        </button>
                    )}
                </div>

                {/* ── Mobile hamburger ── */}
                <button
                    className={`navbar__hamburger ${menuOpen ? "open" : ""}`}
                    onClick={() => setMenuOpen(v => !v)}
                    aria-label="Toggle menu"
                >
                    <span /><span /><span />
                </button>
            </div>

            {/* ── Mobile drawer ── */}
            {menuOpen && (
                <div className="navbar__mobile-menu" onClick={() => setMenuOpen(false)}>
                    {items.map(({ path, label, icon, disabled }) =>
                        disabled ? (
                            <span key={path} className="navbar__mobile-link navbar__mobile-link--disabled">
                                {icon} {label} <em>(coming soon)</em>
                            </span>
                        ) : (
                            <NavLink
                                key={path}
                                to={path}
                                end={path === "/"}
                                className={({ isActive }) =>
                                    `navbar__mobile-link ${isActive ? "navbar__mobile-link--active" : ""}`
                                }
                            >
                                {icon} {label}
                            </NavLink>
                        )
                    )}
                    {(isLoggedIn || isAdmin) && (
                        <a className="navbar__mobile-link" onClick={logout}>⎋ Log out</a>
                    )}
                </div>
            )}
        </nav>
    );
};

export default Navbar;