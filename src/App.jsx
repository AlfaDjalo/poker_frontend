import React from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Navbar from './components/Navbar';
import GameSimulator from './components/GameSimulator';
import HandReplayer from './components/HandReplayer';
// import './App.css';

function App() {
  return (
    <Router>
      {/* Always visible */}
      <Navbar />

      {/* Page content - offset by navbar height (56px) */}
      <div style={{ paddingTop: 56 }}>
          <Routes>
            {/* Game Simulator */}
            <Route
              path="/"
              element={<GameSimulator />}
            />

            {/* Hand Replayer */}
            <Route
              path="/replay"
              element={<HandReplayer />}
            />

            {/* Placeholders for future pages */}
            <Route
                path="/equity"
                element={<PlaceholderPage title="Equity Calculator" />}
            />
            <Route
                path="/editor"
                element={<PlaceholderPage title="Hand Editor" />}
            />
          </Routes>
        </div >
    </Router>
  );
}

const PlaceholderPage = ({ title }) => (
    <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "calc(100vh - 56px)",
        gap: 12,
        fontFamily: "'Courier New', monospace",
        color: "#3d4a60",
        background: "#060709",
    }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>🚧</div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em" }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Coming soon</div>
    </div>
);

export default App;