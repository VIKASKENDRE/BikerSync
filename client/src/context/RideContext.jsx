import { createContext, useContext, useReducer } from 'react';

const RideContext = createContext(null);

const SESSION_KEY = 'bs_ride';

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

const persisted = loadSession();

const initialState = {
  rideId:      persisted?.rideId    ?? null,
  selfRider:   persisted?.selfRider ?? null,
  riders:      [],
  messages:    [],
  unreadCount: 0,
  sosAlert:    null,
  sharedRoute: null,   // route shared by lead, visible to all riders
  trails:      {},     // { riderId: [[lat,lng], ...] } — last 50 positions
};

function reducer(state, action) {
  switch (action.type) {
    case 'JOIN_RIDE': {
      const next = { ...state, rideId: action.rideId, selfRider: action.selfRider };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ rideId: action.rideId, selfRider: action.selfRider }));
      return next;
    }

    case 'RIDE_SNAPSHOT':
      return { ...state, riders: action.riders };

    case 'RIDER_JOINED': {
      const exists = state.riders.some((r) => r.riderId === action.rider.riderId);
      if (exists) return state;
      return { ...state, riders: [...state.riders, action.rider] };
    }

    // Upsert from RTDB: add rider if not known, update presence fields if known
    case 'RIDER_UPSERT': {
      const exists = state.riders.some((r) => r.riderId === action.rider.riderId);
      if (exists) {
        return { ...state, riders: state.riders.map((r) =>
          r.riderId === action.rider.riderId ? { ...r, ...action.rider } : r
        )};
      }
      return { ...state, riders: [...state.riders, action.rider] };
    }

    case 'RIDER_MOVED': {
      const { riderId, lat, lng } = action.update;
      const updated = state.riders.map((r) =>
        r.riderId === riderId ? { ...r, ...action.update } : r
      );
      const selfUpdated =
        state.selfRider?.riderId === riderId
          ? { ...state.selfRider, ...action.update }
          : state.selfRider;
      const trails = lat != null
        ? { ...state.trails, [riderId]: [...(state.trails[riderId] ?? []), [lat, lng]].slice(-50) }
        : state.trails;
      return { ...state, riders: updated, selfRider: selfUpdated, trails };
    }

    case 'RIDER_OFFLINE':
      return {
        ...state,
        riders: state.riders.map((r) =>
          r.riderId === action.riderId ? { ...r, online: false } : r
        ),
      };

    case 'SELF_MOVED': {
      const selfId = state.selfRider?.riderId;
      const { lat, lng } = action.update;
      const updatedSelf = { ...state.selfRider, ...action.update };
      const trails = selfId && lat != null
        ? { ...state.trails, [selfId]: [...(state.trails[selfId] ?? []), [lat, lng]].slice(-50) }
        : state.trails;
      // Upsert self into riders — riders starts empty until socket snapshot arrives,
      // so we must add self here on first GPS tick (especially when server is offline).
      const selfInRiders = state.riders.some((r) => r.riderId === selfId);
      const riders = selfInRiders
        ? state.riders.map((r) => r.riderId === selfId ? { ...r, ...action.update } : r)
        : [...state.riders, updatedSelf];
      return { ...state, selfRider: updatedSelf, riders, trails };
    }

    case 'CHAT_MESSAGE': {
      if (state.messages.some((m) => m.id === action.message.id)) return state;
      // Only count messages from other riders as unread
      const isOwn = action.message.riderId === state.selfRider?.riderId;
      return {
        ...state,
        messages: [...state.messages.slice(-99), action.message],
        unreadCount: isOwn ? state.unreadCount : state.unreadCount + 1,
      };
    }

    case 'CHAT_READ':
      return { ...state, unreadCount: 0 };

    case 'SOS_RECEIVED':
      return { ...state, sosAlert: action.payload };

    case 'SOS_DISMISS':
    case 'SOS_RESOLVED':
      return { ...state, sosAlert: null };

    case 'ROLE_CHANGED': {
      const { riderId, role } = action;
      const updatedSelf =
        state.selfRider?.riderId === riderId
          ? { ...state.selfRider, role }
          : state.selfRider;
      // Persist new self role so page refresh keeps the correct role
      if (state.selfRider?.riderId === riderId) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)) ?? {};
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...saved, selfRider: updatedSelf }));
        } catch {}
      }
      return {
        ...state,
        selfRider: updatedSelf,
        riders: state.riders.map((r) => r.riderId === riderId ? { ...r, role } : r),
      };
    }

    case 'SET_SHARED_ROUTE':
      return { ...state, sharedRoute: action.route };

    case 'LEAVE_RIDE':
      sessionStorage.removeItem(SESSION_KEY);
      return { rideId: null, selfRider: null, riders: [], messages: [], unreadCount: 0, sosAlert: null, sharedRoute: null, trails: {} };

    default:
      return state;
  }
}

export function RideProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <RideContext.Provider value={{ state, dispatch }}>
      {children}
    </RideContext.Provider>
  );
}

export function useRideContext() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRideContext must be used inside RideProvider');
  return ctx;
}
