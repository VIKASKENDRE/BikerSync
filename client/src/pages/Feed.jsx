import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocial } from '../hooks/useSocial';
import PostCard from '../components/social/PostCard';
import PostComposer from '../components/social/PostComposer';

export default function Feed() {
  const navigate = useNavigate();
  const social   = useSocial();

  const [posts,    setPosts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [composing,setComposing]= useState(false);

  useEffect(() => {
    social.getFeed()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePosted = (post) => setPosts((p) => [post, ...p]);
  const handleDeleted = (id)  => setPosts((p) => p.filter((x) => x._id !== id));

  return (
    <div className="min-h-dvh bg-[#0F0F0F]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0F0F0F]/95 backdrop-blur-sm
                      border-b border-[#2A2A2A] px-4 py-3 flex items-center justify-between
                      pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 text-lg w-9 h-9 flex items-center justify-center rounded-full bg-[#1A1A1A]">
            ←
          </button>
          <h1 className="text-white font-black text-lg">Feed</h1>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="px-4 py-2 bg-[#FFE500] text-black font-black text-sm rounded-full active:scale-95 transition-transform"
        >
          + Post
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#FFE500] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-20 px-6">
            <p className="text-5xl mb-4">🏍</p>
            <p className="text-white font-bold mb-2">Nothing in your feed yet</p>
            <p className="text-gray-500 text-sm">Follow other riders to see their posts, or share your first ride!</p>
            <button
              onClick={() => setComposing(true)}
              className="mt-6 px-6 py-3 bg-[#FFE500] text-black font-black rounded-2xl active:scale-95 transition-transform"
            >
              Share a Post
            </button>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post._id} post={post} social={social} onDeleted={handleDeleted} />
        ))}
      </div>

      {composing && (
        <PostComposer
          social={social}
          onPosted={handlePosted}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
