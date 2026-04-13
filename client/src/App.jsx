import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RideProvider } from './context/RideContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketManager } from './components/SocketManager';
import { useVoicePlayback } from './hooks/useVoicePlayback';
import Home from './pages/Home';
import Ride from './pages/Ride';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Feed from './pages/Feed';
import Profile from './pages/Profile';

// Boots global socket listeners and voice playback — exactly once
function AppServices() {
  useVoicePlayback();
  return <SocketManager />;
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    // Still loading auth state
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#FFE500] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <RideProvider>
        <AppServices />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/ride/:rideId" element={<ProtectedRoute><Ride /></ProtectedRoute>} />
            <Route path="/settings"       element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin"          element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/feed"           element={<ProtectedRoute><Feed /></ProtectedRoute>} />
            <Route path="/profile"        element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/profile/:uid"   element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </RideProvider>
    </AuthProvider>
  );
}
