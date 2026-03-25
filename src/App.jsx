import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import React from 'react';

// import { useState } from 'react'
// import { dealNextStreet, startNewHand } from "./api/pokerApi";
// import PokerTable from "./components/PokerTable";
// import { sendAction } from "./api/pokerApi";

import GameSimulator from './components/GameSimulator';
// import './App.css';

function App() {
  // const [gameState, setGameState] = useState(null);

  // const handleStartGame = async () => {
  //   try {
  //     const data = await startNewHand();
      
      // const playersBySeat = {};
      // data.players.forEach(p => {
      //   playersBySeat[p.seat] = p;
      // });

  //     setGameState({
  //       data
  //       // ...data,
  //       // players: playersBySeat
  //       // players: playersBySeat
  //     });
  //   } catch (error) {
  //     console.error("Failed to start game:", error)
  //   }
  // };

  // const handleDealNextStreet = async () => {
  //   try {
  //     const updatedHand = await dealNextStreet();
  //     setGameState({
  //       ...uppdatedHand,
  //       players: updatedHand.players.reduce((acc, p) => {
  //         acc[p.seat] = p;
  //         return acc;
  //       }, {})
  //     });
  //   } catch (err) {
  //     console.error("Failed to deal board:", err);
  //   }
  // };

  // const handleAction = async (type, amount = null) => {
  //   try {
  //     const updated = await sendAction(type, amount);

  //     const playersBySeat = {};
  //     updated.players.forEach(p => {
  //       playersBySeat[p.seat] = p;
  //     });

  //     setGameState({
  //       ...updated,
  //       players: playersBySeat
  //     });
  //   } catch (err) {
  //     console.error("Action failed:", err);
  //   }
  // };

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