import React from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Navbar from './components/Navbar';
import GameSimulator from './components/GameSimulator';
import HandReplayer from './components/HandReplayer';
import CreationFlow from './components/CreationFlow';
import TutorialPage from './components/TutorialPage';
import Trainer from './components/Trainer';

function App() {
  return (
    <Router>
      {/* Always visible */}
      <Navbar />

      {/* Page content - offset by navbar height (56px) */}
      <div style={{ paddingTop: 56 }}>
          <Routes>
            <Route path="/"                   element={<GameSimulator />} />
            <Route path="/replay"             element={<HandReplayer />} />
            <Route path="/tutorial"           element={<TutorialPage />} />
            <Route path="/tutorial/create"    element={<CreationFlow />} />
            <Route path="/trainer"            element={<Trainer />} />
            {/* /equity and /editor removed: equity is a live in-context
                panel (Game Simulator's "📊 Equity" toggle / Hand
                Replayer's sidebar EquityPanel), not a standalone page —
                see Navbar.jsx's note. The Hand Editor equivalent is
                CreationFlow (/tutorial/create) plus the in-place live/
                replayer editors, not a separate placeholder route either. */}
          </Routes>
        </div >
    </Router>
  );
}

export default App;