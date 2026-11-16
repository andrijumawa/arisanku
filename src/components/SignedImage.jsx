import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const cache = new Map();

export async function signedUrl(bucket, path) {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

// Gambar dari bucket privat (link bertanda tangan), klik untuk memperbesar
export default function SignedImage({ bucket, path, alt = '', className = '' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    signedUrl(bucket, path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [bucket, path]);

  if (failed) return <div className={`img-ph ${className}`}>Gambar tidak bisa dimuat</div>;
  if (!url) return <div className={`img-ph ${className}`}>…</div>;

  return (
    <>
      <img src={url} alt={alt} className={className} loading="lazy" onClick={() => setOpen(true)} />
      {open && (
        <div className="lightbox" onClick={() => setOpen(false)}>
          <img src={url} alt={alt} />
          <button className="icon-btn light" aria-label="Tutup">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
