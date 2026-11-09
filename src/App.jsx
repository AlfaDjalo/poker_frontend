import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";

import Navbar from './components/Navbar';
import GameSimulator from './components/GameSimulator';
import HandReplayer from './components/HandReplayer';
import CreationFlow from './components/CreationFlow';
import TutorialPage from './components/TutorialPage';
import Trainer from './components/Trainer';
import Lobby from './components/Lobby';
import TableView from './components/TableView';
import SettingsPage from './components/SettingsPage';
import PlayerPicker from './components/PlayerPicker';
import ProfilePage from './components/ProfilePage';
import AdminPage from './components/AdminPage';
import PinLoginModal from './components/PinLoginModal';
import { ToastProvider } from './components/ToastProvider';
import { SessionProvider, useSession } from './hooks/useSession';
import { AuthProvider } from './hooks/useAuth';

// Scrollable, centred page for simple forms/pickers.
const Page = ({ children }) => (
  <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: 16 }}>
    {children}
  </div>
);

// Pages that need an active player.
const RequirePlayer = ({ children }) => {
  const { player, ready } = useSession();
  const navigate = useNavigate();
  if (!ready) return <Page>Loading…</Page>;
  if (!player) return <Page><PlayerPicker onPicked={() => navigate("/lobby")} /></Page>;
  return children;
};

const PlayerPickerRoute = () => {
  const navigate = useNavigate();
  return <Page><PlayerPicker onPicked={() => navigate("/lobby")} /></Page>;
};

function App() {
  return (
    <Router>
      <ToastProvider>
        <SessionProvider>
          <AuthProvider>
            <Navbar />
            <div className="app-shell">
              <Routes>
                <Route path="/"                element={<GameSimulator />} />
                <Route path="/replay"          element={<HandReplayer />} />
                <Route path="/tutorial"        element={<TutorialPage />} />
                <Route path="/tutorial/create" element={<CreationFlow />} />
                <Route path="/trainer"         element={<Trainer />} />

                <Route path="/lobby"     element={<RequirePlayer><Lobby /></RequirePlayer>} />
                <Route path="/table/:id" element={<RequirePlayer><TableView /></RequirePlayer>} />
                <Route path="/settings"  element={<Page><SettingsPage /></Page>} />
                <Route path="/players"   element={<PlayerPickerRoute />} />
                <Route path="/profile"   element={<Page><ProfilePage /></Page>} />
                <Route path="/admin"     element={<AdminPage />} />
              </Routes>
            </div>
            <PinLoginModal />
          </AuthProvider>
        </SessionProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;