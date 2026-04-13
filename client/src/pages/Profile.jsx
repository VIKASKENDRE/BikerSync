import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../hooks/useSocial';
import PostCard from '../components/social/PostCard';
import PostComposer from '../components/social/PostComposer';
import FollowButton from '../components/social/FollowButton';

function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}${url}`;
}

export default function Profile() {
  const { uid: paramUid } = useParams();
  const { user }          = useAuth();
  const navigate          = useNavigate();
  const social            = useSocial();

  const uid          = paramUid ?? user?.uid;
  const isOwnProfile = uid === user?.uid;

  const [profile,    setProfile]    = useState(null);
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [composing,  setComposing]  = useState(false);
  const [isFollowing,setIsFollowing]= useState(false);
  const [flash,      setFlash]      = useState('');

  // Edit form
  const [bio,  setBio]  = useState('');
  const [bike, setBike] = useState('');
  const [city, setCity] = useState('');
  const [saving,setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    Promise.all([
      social.getProfile(uid).catch(() => null),
      social.getUserPosts(uid).catch(() => []),
    ]).then(([p, ps]) => {
      if (p) {
        setProfile(p);
        setBio(p.bio ?? '');
        setBike(p.bike ?? '');
        setCity(p.city ?? '');
        setIsFollowing(p.followers?.includes(user?.uid) ?? false);
      }
      setPosts(ps);
    }).finally(() => setLoading(false));
  }, [uid]);

  // Auto-upsert own profile on first visit
  useEffect(() => {
    if (!isOwnProfile || !user) return;
    social.upsertProfile({
      displayName: user.displayName,
      avatarUrl:   user.photoURL ?? '',
    }).then(setProfile).catch(() => {});
  }, [isOwnProfile]);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3500); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await social.upsertProfile({ bio, bike, city });
      setProfile(updated);
      setEditing(false);
    } catch (e) { showFlash(e.message); }
    setSaving(false);
  };

  const handleFollow   = async () => {
    await social.follow(uid);
    setIsFollowing(true);
    setProfile((p) => p ? { ...p, followers: [...(p.followers ?? []), user.uid] } : p);
  };
  const handleUnfollow = async () => {
    await social.unfollow(uid);
    setIsFollowing(false);
    setProfile((p) => p ? { ...p, followers: (p.followers ?? []).filter((f) => f !== user.uid) } : p);
  };
  const handlePosted  = (post) => setPosts((ps) => [post, ...ps]);
  const handleDeleted = (id)   => setPosts((ps) => ps.filter((x) => x._id !== id));

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0F0F0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#FFE500] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0F0F0F] pb-[max(1.5rem,env(safe-area-inset-bottom))]">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0F0F0F]/95 backdrop-blur-sm border-b border-[#2A2A2A]
                      flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={() => navigate(-1)}
          className="text-gray-400 w-9 h-9 flex items-center justify-center rounded-full bg-[#1A1A1A]">
          ←
        </button>
        <h1 className="text-white font-black text-lg flex-1 truncate">
          {profile?.displayName ?? 'Profile'}
        </h1>
        {isOwnProfile && (
          <button onClick={() => setEditing(true)}
            className="text-gray-400 text-sm px-3 py-1.5 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]">
            Edit
          </button>
        )}
      </div>

      {flash && (
        <div className="mx-4 mt-3 px-4 py-2 bg-[#1A1A1A] border border-[#FFE500]/30 rounded-xl text-[#FFE500] text-sm text-center">
          {flash}
        </div>
      )}

      {/* Profile header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start gap-4">
          {profile?.avatarUrl
            ? <img src={resolveUrl(profile.avatarUrl)} alt=""
                className="w-20 h-20 rounded-full object-cover border-2 border-[#2A2A2A] flex-shrink-0" />
            : <div className="w-20 h-20 rounded-full bg-[#1A1A1A] border-2 border-[#2A2A2A] flex-shrink-0
                              flex items-center justify-center text-3xl text-[#FFE500] font-black">
                {(profile?.displayName ?? user?.displayName ?? '?')[0]?.toUpperCase()}
              </div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-xl leading-tight truncate">
              {profile?.displayName ?? user?.displayName}
            </p>
            {profile?.city && <p className="text-gray-400 text-sm mt-0.5">{profile.city}</p>}
            <div className="flex gap-5 mt-3">
              <StatPill label="Posts"     value={posts.length} />
              <StatPill label="Followers" value={profile?.followers?.length ?? 0} />
              <StatPill label="Following" value={profile?.following?.length ?? 0} />
            </div>
          </div>
        </div>

        {profile?.bike && (
          <p className="mt-3 text-sm text-[#FFE500] font-bold">🏍 {profile.bike}</p>
        )}
        {profile?.bio && (
          <p className="mt-1 text-sm text-gray-300 leading-relaxed">{profile.bio}</p>
        )}

        <div className="mt-4 flex gap-2">
          {isOwnProfile ? (
            <>
              <button onClick={() => setComposing(true)}
                className="flex-1 py-2.5 bg-[#FFE500] text-black font-black text-sm rounded-full active:scale-95 transition-transform">
                + New Post
              </button>
              <button onClick={() => navigate('/feed')}
                className="flex-1 py-2.5 bg-[#1A1A1A] border border-[#2A2A2A] text-white font-bold text-sm rounded-full active:scale-95 transition-transform">
                Feed
              </button>
            </>
          ) : (
            <FollowButton isFollowing={isFollowing} onFollow={handleFollow} onUnfollow={handleUnfollow} />
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="border-t border-[#2A2A2A] px-4 py-4 space-y-4 max-w-lg mx-auto">
        {posts.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-12">No posts yet</p>
        )}
        {posts.map((post) => (
          <PostCard key={post._id} post={post} social={social} onDeleted={handleDeleted} />
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-4">
          <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
              <span className="text-white font-bold">Edit Profile</span>
              <button onClick={() => setEditing(false)}
                className="text-gray-400 w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2A]">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <Field label="Bike"  value={bike} onChange={setBike} placeholder="Royal Enfield Himalayan 2023" />
              <Field label="City"  value={city} onChange={setCity} placeholder="Pune, Maharashtra" />
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell other riders about yourself…"
                  rows={3}
                  maxLength={300}
                  style={{ fontSize: 16 }}
                  className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                             border border-transparent focus:border-[#FFE500]/50 outline-none resize-none text-sm"
                />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3.5 bg-[#FFE500] text-black font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {composing && (
        <PostComposer social={social} onPosted={handlePosted} onClose={() => setComposing(false)} />
      )}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-white font-black text-lg leading-none">{value}</p>
      <p className="text-gray-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-xs text-gray-400 uppercase tracking-wider">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ fontSize: 16 }}
        className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                   border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
      />
    </div>
  );
}
