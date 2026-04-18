import { Component } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RideProvider } from './context/RideContext';
import { AuthProvider } from './context/AuthContext';
import { SocketManager } from './components/SocketManager';
import { useVoicePlayback } from './hooks/useVoicePlayback';
import Home from './pages/Home';
import Ride from './pages/Ride';
import Settings from './pages/Settings';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background:'#0F0F0F', color:'#FF4444', padding:'2rem', fontFamily:'monospace', minHeight:'100dvh' }}>
          <h2 style={{ color:'#FFE500' }}>BikerSync — Startup Error</h2>
          <pre style={{ whiteSpace:'pre-wrap', fontSize:'0.75rem' }}>{String(this.state.error)}</pre>
          <pre style={{ whiteSpace:'pre-wrap', fontSize:'0.65rem', color:'#888' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppServices() {
  useVoicePlayback();
  return <SocketManager />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RideProvider>
          <AppServices />
          <BrowserRouter>
            <Routes>
              <Route path="/"              element={<Home />} />
              <Route path="/ride/:rideId"  element={<Ride />} />
              <Route path="/settings"      element={<Settings />} />
            </Routes>
          </BrowserRouter>
        </RideProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
