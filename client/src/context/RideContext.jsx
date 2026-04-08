import { createContext, useContext, useReducer } from 'react';

const RideContext = createContext(null);

const SESSION_KEY = 'bs_ride';

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

const persisted = loadSession();

const initialState = {
  rideId:     persisted?.rideId    ?? null,
  selfRider:  persisted?.selfRider ?? null,
  riders: [],
  messages: [],
  unreadCount: 0,
  sosAlert: null,
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

    case 'RIDER_MOVED': {
      const updated = state.riders.map((r) =>
        r.riderId === action.update.riderId ? { ...r, ...action.update } : r
      );
      const selfUpdated =
        state.selfRider?.riderId === action.update.riderId
          ? { ...state.selfRider, ...action.update }
          : state.selfRider;
      return { ...state, riders: updated, selfRider: selfUpdated };
    }

    case 'RIDER_OFFLINE':
      return {
        ...state,
        riders: state.riders.map((r) =>
          r.riderId === action.riderId ? { ...r, online: false } : r
        ),
      };

    case 'SELF_MOVED':
      return {
        ...state,
        selfRider: { ...state.selfRider, ...action.update },
        riders: state.riders.map((r) =>
          r.riderId === state.selfRider?.riderId ? { ...r, ...action.update } : r
        ),
      };

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

    case 'LEAVE_RIDE':
      sessionStorage.removeItem(SESSION_KEY);
      return { rideId: null, selfRider: null, riders: [], messages: [], unreadCount: 0, sosAlert: null };

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
