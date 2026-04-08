import { useState, useCallback } from 'react';

export function useGPS() {
  const [status, setStatus] = useState('idle'); // idle | requesting | granted | denied | unavailable | timeout

  const requestGPS = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return false;
    }

    // Check Permissions API first to avoid unnecessary prompts
    if ('permissions' in navigator) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'denied') {
          setStatus('denied');
          return false;
        }
      } catch {}
    }

    setStatus('requesting');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => { setStatus('granted'); resolve(true); },
        (err) => {
          if (err.code === err.PERMISSION_DENIED)    setStatus('denied');
          else if (err.code === err.POSITION_UNAVAILABLE) setStatus('unavailable');
          else                                        setStatus('timeout');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }, []);

  return { status, requestGPS };
}
