import { useAuth } from '../context/AuthContext';
import { socialApi } from '../services/api';

// Returns a bound socialApi instance that auto-fetches the Firebase ID token.
// Usage: const social = useSocial(); await social.getFeed();
export function useSocial() {
  const { user } = useAuth();
  const getToken = () => {
    if (!user) return Promise.reject(new Error('Not authenticated'));
    return user.getIdToken();
  };
  return socialApi(getToken);
}
