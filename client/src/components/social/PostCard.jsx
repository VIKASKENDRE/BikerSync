import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BASE } from '../../services/api';

// Resolves relative upload paths to absolute server URLs
function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}${url}`;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PostCard({ post, social, onDeleted }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked,       setLiked]       = useState(post.likes?.includes(user?.uid));
  const [likeCount,   setLikeCount]   = useState(post.likes?.length ?? 0);
  const [commentText, setCommentText] = useState('');
  const [comments,    setComments]    = useState(post.comments ?? []);
  const [showComments,setShowComments]= useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  const handleLike = async () => {
    try {
      const res = await social.toggleLike(post._id);
      setLiked(res.liked);
      setLikeCount(res.count);
    } catch {}
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const comment = await social.addComment(post._id, commentText.trim());
      setComments((c) => [...c, comment]);
      setCommentText('');
    } catch {}
    setSubmitting(false);
  };

  const handleDeleteComment = async (cId) => {
    try {
      await social.deleteComment(post._id, cId);
      setComments((c) => c.filter((x) => x._id !== cId));
    } catch {}
  };

  const handleDeletePost = async () => {
    if (!confirm('Delete this post?')) return;
    try {
      await social.deletePost(post._id);
      onDeleted?.(post._id);
    } catch {}
  };

  const isOwn = post.authorUid === user?.uid;

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          className="flex items-center gap-3"
          onClick={() => navigate(`/profile/${post.authorUid}`)}
        >
          {post.authorAvatar
            ? <img src={resolveUrl(post.authorAvatar)} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <div className="w-9 h-9 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[#FFE500] font-black text-sm">
                {post.authorName?.[0]?.toUpperCase() ?? '?'}
              </div>
          }
          <div className="text-left">
            <p className="text-white font-bold text-sm leading-tight">{post.authorName}</p>
            <p className="text-gray-500 text-xs">{timeAgo(post.createdAt)}</p>
          </div>
        </button>
        {isOwn && (
          <button onClick={handleDeletePost} className="text-gray-600 text-xs px-2 py-1 rounded-lg hover:text-red-400">
            Delete
          </button>
        )}
      </div>

      {/* Ride tag */}
      {post.rideName && (
        <div className="px-4 pb-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#FFE500]/10 border border-[#FFE500]/20 text-[#FFE500]">
            🏍 {post.rideName}
          </span>
        </div>
      )}

      {/* Image */}
      {post.imageUrl && (
        <img
          src={resolveUrl(post.imageUrl)}
          alt=""
          className="w-full object-cover max-h-80 mt-2"
          loading="lazy"
        />
      )}

      {/* Caption */}
      {post.caption && (
        <p className="px-4 pt-3 text-gray-200 text-sm leading-relaxed">{post.caption}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 text-sm font-bold transition-colors
            ${liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
        >
          {liked ? '♥' : '♡'} {likeCount > 0 && likeCount}
        </button>
        <button
          onClick={() => setShowComments((o) => !o)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
        >
          💬 {comments.length > 0 && comments.length}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="border-t border-[#2A2A2A] px-4 pt-3 pb-4 space-y-3">
          {comments.map((c) => (
            <div key={c._id} className="flex items-start gap-2">
              {c.avatarUrl
                ? <img src={resolveUrl(c.avatarUrl)} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                : <div className="w-6 h-6 rounded-full bg-[#2A2A2A] flex-shrink-0 flex items-center justify-center text-xs text-gray-400">
                    {c.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
              }
              <div className="flex-1 min-w-0">
                <span className="text-white text-xs font-bold">{c.name} </span>
                <span className="text-gray-300 text-xs">{c.text}</span>
              </div>
              {c.uid === user?.uid && (
                <button onClick={() => handleDeleteComment(c._id)} className="text-gray-600 text-xs shrink-0">✕</button>
              )}
            </div>
          ))}
          <form onSubmit={handleComment} className="flex gap-2 mt-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              style={{ fontSize: 16 }}
              className="flex-1 bg-[#2A2A2A] text-white text-xs rounded-xl px-3 py-2 outline-none
                         border border-transparent focus:border-[#FFE500]/40"
            />
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              className="px-3 py-2 bg-[#FFE500] text-black text-xs font-black rounded-xl disabled:opacity-40"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
