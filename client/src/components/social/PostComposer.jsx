import { useRef, useState } from 'react';

export default function PostComposer({ social, onPosted, onClose }) {
  const [caption,    setCaption]    = useState('');
  const [imageFile,  setImageFile]  = useState(null);
  const [preview,    setPreview]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!caption.trim() && !imageFile) return setError('Add a caption or photo');
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      if (imageFile) fd.append('image', imageFile);
      fd.append('caption', caption.trim());
      const post = await social.createPost(fd);
      onPosted?.(post);
      onClose?.();
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-4">
      <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <span className="text-white font-bold">New Post</span>
          <button onClick={onClose} className="text-gray-400 w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2A]">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Image picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`w-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center
                        justify-center cursor-pointer transition-colors
                        ${preview ? 'border-transparent p-0 overflow-hidden' : 'border-[#2A2A2A] hover:border-[#FFE500]/40'}`}
          >
            {preview
              ? <img src={preview} alt="" className="w-full h-full object-cover" />
              : <>
                  <span className="text-4xl mb-2">📷</span>
                  <p className="text-gray-400 text-sm">Tap to add a photo</p>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What's the story behind this ride?"
            rows={3}
            maxLength={1000}
            style={{ fontSize: 16 }}
            className="w-full bg-[#2A2A2A] text-white rounded-2xl px-4 py-3
                       border border-transparent focus:border-[#FFE500]/40 outline-none resize-none"
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-[#FFE500] text-black font-black text-base rounded-2xl
                       active:scale-95 transition-transform disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Share Post'}
          </button>
        </form>
      </div>
    </div>
  );
}
