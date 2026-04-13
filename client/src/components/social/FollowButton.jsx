import { useState } from 'react';

export default function FollowButton({ isFollowing, onFollow, onUnfollow, disabled }) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      if (isFollowing) await onUnfollow();
      else             await onFollow();
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={handle}
      disabled={disabled || loading}
      className={`px-5 py-2 rounded-full text-sm font-bold border transition-colors disabled:opacity-40
        ${isFollowing
          ? 'bg-transparent border-[#2A2A2A] text-gray-300 hover:border-red-500/50 hover:text-red-400'
          : 'bg-[#FFE500] border-[#FFE500] text-black hover:bg-[#FFE500]/90'}`}
    >
      {loading ? '…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
