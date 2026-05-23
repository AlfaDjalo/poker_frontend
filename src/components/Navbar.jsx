import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import "../css/Navbar.css";

const NAV_ITEMS = [
    { path: "/",          label: "Game Simulator",  icon: "♠" },
    { path: "/replay",    label: "Hand Replayer",    icon: "⏪" },
    { path: "/equity",    label: "Equity Calculator", icon: "⚖", disabled: true },
    { path: "/editor",    label: "Hand Editor",      icon: "✏", disabled: true },
];

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);

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
                    {NAV_ITEMS.map(({ path, label, icon, disabled }) =>
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
                    {NAV_ITEMS.map(({ path, label, icon, disabled }) =>
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
                </div>
            )}
        </nav>
    );
};

export default Navbar;