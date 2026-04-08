import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth();

  const [tab, setTab] = useState('login');         // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async () => {
    setError('');
    if (!email || !password) return setError('Enter email and password');
    if (tab === 'signup' && !displayName.trim()) return setError('Enter your name');
    setLoading(true);
    try {
      if (tab === 'signup') {
        await signUpWithEmail(email, password, displayName.trim());
      } else {
        await loginWithEmail(email, password);
      }
      navigate('/');
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-[#FFE500] tracking-tight">BikerSync</h1>
        <p className="text-gray-400 text-sm mt-1">Stay together. Ride safe.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-[#2A2A2A]">
          {['login', 'signup'].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-3 text-sm font-bold capitalize transition-colors
                ${tab === t ? 'text-[#FFE500] border-b-2 border-[#FFE500]' : 'text-gray-400'}`}
            >
              {t === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">

          {/* Google SSO */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3
                       bg-white text-gray-900 font-bold text-sm rounded-xl
                       hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#2A2A2A]" />
            <span className="text-gray-600 text-xs">or</span>
            <div className="flex-1 h-px bg-[#2A2A2A]" />
          </div>

          {/* Name — signup only */}
          {tab === 'signup' && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Your Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Raj Kumar"
                className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                           border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                         border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
              className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                         border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
            />
          </div>

          <button
            onClick={handleEmail}
            disabled={loading}
            className="w-full py-4 bg-[#FFE500] text-black font-black text-base rounded-xl
                       active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>

      <p className="mt-6 text-gray-600 text-xs text-center">
        Your account keeps your ride ID consistent across devices
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':      'No account with that email.',
    'auth/wrong-password':      'Incorrect password.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/invalid-email':       'Invalid email address.',
    'auth/popup-closed-by-user':'Sign-in cancelled.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] ?? 'Something went wrong. Try again.';
}
