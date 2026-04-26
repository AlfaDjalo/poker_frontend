import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import React from 'react';

import GameSimulator from './components/GameSimulator';
// import './App.css';

function App() {

  return (
    <Router>
      {/* Always visible */}
      {/* <Navbar /> */}

        <div className="pt-16">
        <h1>Crazy Asian Poker</h1>

        {/* <button onClick={handleStartGame}>Start New Hand</button> */}
          <Routes>
            {/* Game Simulator */}
            <Route
              path="/"
              // path="/game_simulator"
              element={
                <div>
                  <GameSimulator />
                </div>
              }
            />
          </Routes>
        </div >
    </Router>
  );
}

export default App;