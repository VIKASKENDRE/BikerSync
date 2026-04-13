import { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useRideContext } from '../../context/RideContext';
import { webrtcMesh } from '../../services/webrtcMesh';

const ROLE_COLORS = {
  lead:  'text-[#FFE500]',
  sweep: 'text-[#FF6B00]',
  rider: 'text-gray-400',
};

export default function GroupChat({ onClose }) {
  const { socket } = useSocket();
  const { state, dispatch } = useRideContext();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const selfId = state.selfRider?.riderId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Focus input when drawer opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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
      const message = {
        id: `${selfId}-${Date.now()}`,
        riderId:     selfId,
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

  return (
    <div className="flex flex-col bg-[#111111] rounded-t-3xl border-t border-x border-[#2A2A2A] overflow-hidden"
         style={{ maxHeight: '72dvh' }}>

      {/* Handle + header */}
      <div className="flex-shrink-0">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-[#3A3A3A] rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#2A2A2A]">
          <span className="text-white font-bold text-sm">Group Chat</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 rounded-full
                       bg-[#2A2A2A] active:scale-90 transition-transform"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {state.messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8">
            No messages yet — say hi! 👋
          </p>
        )}
        {state.messages.map((msg) => {
          const isSelf = msg.riderId === selfId;
          return (
            <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
              <span className={`text-[11px] font-semibold mb-0.5 px-1
                ${isSelf ? 'text-[#FFE500]' : (ROLE_COLORS[msg.role] ?? 'text-gray-400')}`}>
                {isSelf ? 'You' : msg.displayName}
              </span>
              <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-snug
                ${isSelf
                  ? 'bg-[#FFE500] text-black rounded-br-md font-medium'
                  : 'bg-[#2A2A2A] text-white rounded-bl-md'}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2 px-3 py-3 border-t border-[#2A2A2A]">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the group…"
          maxLength={300}
          className="flex-1 bg-[#2A2A2A] text-white rounded-2xl px-4 py-2.5
                     border border-transparent focus:border-[#FFE500]/40 outline-none
                     placeholder:text-gray-600"
          style={{ fontSize: 16 }} // prevent iOS zoom
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="w-11 h-11 flex items-center justify-center rounded-full
                     bg-[#FFE500] text-black font-black text-lg shrink-0
                     active:scale-90 transition-transform disabled:opacity-30"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
