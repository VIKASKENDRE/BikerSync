import { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useRideContext } from '../../context/RideContext';
import { webrtcMesh } from '../../services/webrtcMesh';

const ROLE_COLORS = { lead: 'text-neon-yellow', sweep: 'text-neon-orange', rider: 'text-gray-300' };

export default function GroupChat({ onClose }) {
  const { socket } = useSocket();
  const { state, dispatch } = useRideContext();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (socket.connected) {
      socket.emit('chat:send', {
        text: trimmed,
        displayName: state.selfRider?.displayName,
        role: state.selfRider?.role,
      });
    } else {
      // P2P mode — build message locally, show in own chat, broadcast to peers
      const message = {
        id: `${state.selfRider?.riderId}-${Date.now()}`,
        riderId:     state.selfRider?.riderId,
        displayName: state.selfRider?.displayName,
        role:        state.selfRider?.role,
        text:        trimmed.slice(0, 300),
        timestamp:   Date.now(),
      };
      dispatch({ type: 'CHAT_MESSAGE', message });
      webrtcMesh.broadcastChat(message);
    }
    setText('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl overflow-hidden flex flex-col h-64">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-3">
        <span className="text-sm font-bold text-white">Group Chat</span>
        <button onClick={onClose} className="text-gray-400 text-lg leading-none min-w-0 min-h-0 w-8 h-8">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {state.messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-4">No messages yet</p>
        )}
        {state.messages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <span className={`text-xs font-bold ${ROLE_COLORS[msg.role] ?? 'text-gray-300'}`}>
              {msg.displayName}
            </span>
            <span className="text-sm text-white">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 px-3 py-2 border-t border-surface-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message..."
          maxLength={300}
          className="flex-1 bg-surface-3 text-white text-sm rounded-xl px-3 py-2
                     border border-transparent focus:border-neon-yellow/40 outline-none
                     placeholder:text-gray-600"
        />
        <button
          onClick={send}
          className="px-4 py-2 bg-neon-yellow text-black font-bold text-sm rounded-xl
                     active:scale-95 transition-transform min-w-0 min-h-0 h-10"
        >
          Send
        </button>
      </div>
    </div>
  );
}
