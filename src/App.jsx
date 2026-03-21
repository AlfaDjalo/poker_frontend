import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import React from 'react';

import { useState } from 'react'
import { startNewHand } from "./api/pokerApi";
import PokerTable from "./components/PokerTable";

// import PokerHandAnalyzer from './PokerHandAnalyzer';
// import PushFoldGrid from './components/PushFoldGrid';
// import EquityCalculator from './components/EquityCalculator';
// import CardSelector from './components/CardSelector';
// import ViewEmbeddings from './components/ViewEmbeddings';
// import GameSimulator from './components/GameSimulator';
// import { Navbar } from "./components/Navbar";
// import './App.css';

function App() {
  const [gameState, setGameState] = useState(null);

  const handleStartGame = async () => {
    try {
      const data = await startNewHand();
      
      const playersBySeat = {};
      data.players.forEach(p => {
        playersBySeat[p.seat] = p;
      });

      setGameState({
        ...data,
        players: playersBySeat
      });
    } catch (error) {
      console.error("Failed to start game:", error)
    }
  };

  return (
    <Router>
      {/* Always visible */}
      {/* <Navbar /> */}

        <div className="pt-16">
          {/* <Routes> */}

            <h1>Crazy Asian Poker</h1>
            <button onClick={handleStartGame}>Start New Hand</button>

            {gameState && (
              <PokerTable
                players={gameState.players}
                boardCards={gameState.board}
                dealerSeat={1}
                onSeatClick={() => {}}
                onPlayerCardClick={() => {}}
                onPlayerSlotClick={() => {}}
                onBoardCardClick={() => {}}
                onBoardSlotClick={() => {}}
                onBoardAreaClick={() => {}}
                loading={false}
              />
            )}

            {/* Equity Calculator */}
            {/* <Route
              path="/"
              element={
                <div>
                  <CardSelector />
                </div>
              }
            /> */}

            {/* Rank Chart */}
            {/* <Route
              path="/rank_chart"
              element={
                <div>
                  <PokerHandAnalyzer />
                </div>
              }
            /> */}

            {/* Push-Fold Grid */}
            {/* <Route
              path="/pushfold_grid"
              element={
                <div>
                  <PushFoldGrid />
                </div>
              }
            /> */}

            {/* View Embeddings */}
            {/* <Route
              path="/view_embeddings"
              element={
                <div>
                  <ViewEmbeddings />
                </div>
              }
            /> */}

            {/* Equity Calculator */}
            {/* <Route
              path="/equity_calculator"
              element={
                <div>
                  <EquityCalculator />
                </div>
              }
            /> */}

            {/* Game Simulator */}
            {/* <Route
              path="/game_simulator"
              element={
                <div>
                  <GameSimulator />
                </div>
              }
            /> */}
          {/* </Routes> */}
        </div >
    </Router>
  );
}

export default App;