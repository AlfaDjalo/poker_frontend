import React from "react";
import { Link } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import heroImg from "../assets/CAP.jpg";
import "../css/Landing.css";

const MENU = [
    { path: "/lobby",     icon: "🎲", title: "Tables",
      desc: "Sit down with friends. Dealer's choice, rotations, bots and bankrolls." },
    { path: "/simulator", icon: "♠",  title: "Game Simulator",
      desc: "Deal any variant solo and test your wild ideas instantly." },
    { path: "/replay",    icon: "⏪", title: "Hand Replayer",
      desc: "Step through past hands, annotate them and check your equity." },
    { path: "/tutorial",  icon: "📖", title: "Tutorial",
      desc: "Build hypothetical hands to learn and teach new variants." },
    { path: "/trainer",   icon: "🎯", title: "Trainer",
      desc: "Drill spots against AI and see what the model would do." },
    { path: "/settings",  icon: "⚙",  title: "Settings",
      desc: "Recording defaults and preferences." },
];

const PILLARS = [
    { icon: "🃏", title: "Invent variants", desc: "Weird boards, pass-the-trash, Grinch, bomb pots and more." },
    { icon: "📱", title: "Play anywhere",   desc: "Built for laptop, iPad and iPhone." },
    { icon: "🤖", title: "Train with AI",   desc: "Reinforcement-learning opponents and instant grading." },
];

const Landing = () => {
    const { player } = useSession();

    return (
        <div className="landing">
            {/* ── Hero ── */}
            <section className="landing__hero">
                <div className="landing__hero-text">
                    <span className="landing__eyebrow">Dealer's choice, reimagined</span>
                    <h1 className="landing__title">
                        Crazy Asian <span>Poker</span>
                    </h1>
                    <p className="landing__tagline">
                        Invent weird and wonderful poker variants, then play, replay
                        and train on them, all in your browser.
                    </p>
                    <div className="landing__cta">
                        <Link to="/lobby" className="landing__btn landing__btn--primary">
                            Play at a table
                        </Link>
                        <Link to="/simulator" className="landing__btn">
                            Try the simulator
                        </Link>
                    </div>
                    <div className="landing__player">
                        {player ? (
                            <>Playing as <strong>{player.name}</strong> ·{" "}
                                {Number(player.bankroll ?? 0).toLocaleString()} chips</>
                        ) : (
                            <Link to="/players">🙂 Choose a player to get started</Link>
                        )}
                    </div>
                </div>

                <div className="landing__hero-media">
                    <img src={heroImg} alt="Crazy Asian Poker" className="landing__img"
                         fetchPriority="high" decoding="async" />
                </div>
            </section>

            {/* ── Menu ── */}
            <section className="landing__section" aria-labelledby="landing-menu">
                <h2 id="landing-menu" className="landing__heading">Where to?</h2>
                <div className="landing__grid">
                    {MENU.map(({ path, icon, title, desc }) => (
                        <Link key={path} to={path} className="landing__card">
                            <span className="landing__card-icon">{icon}</span>
                            <span className="landing__card-title">{title}</span>
                            <span className="landing__card-desc">{desc}</span>
                            <span className="landing__card-arrow" aria-hidden="true">→</span>
                        </Link>
                    ))}
                </div>
            </section>

            {/* ── Pillars ── */}
            <section className="landing__section landing__pillars">
                {PILLARS.map(({ icon, title, desc }) => (
                    <div key={title} className="landing__pillar">
                        <span className="landing__pillar-icon">{icon}</span>
                        <div>
                            <div className="landing__pillar-title">{title}</div>
                            <div className="landing__pillar-desc">{desc}</div>
                        </div>
                    </div>
                ))}
            </section>

            <footer className="landing__footer">Crazy Asian Poker</footer>
        </div>
    );
};

export default Landing;