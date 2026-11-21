import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import Icon from './Icon.jsx';

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

export async function signedUrls(bucket, paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const urls = new Map();
  const missingPaths = [];
  const expiresAt = Date.now() + 50 * 60 * 1000;

  uniquePaths.forEach((path) => {
    const hit = cache.get(`${bucket}/${path}`);
    if (hit && hit.exp > Date.now()) urls.set(path, hit.url);
    else missingPaths.push(path);
  });

  if (!missingPaths.length) return { urls, errors: [] };

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missingPaths, 3600);
  if (error) throw error;

  const resultsByPath = new Map((data || []).map((result) => [result.path, result]));
  const errors = [];
  missingPaths.forEach((path) => {
    const result = resultsByPath.get(path);
    if (!result?.signedUrl) {
      errors.push({ path, message: result?.error || 'URL foto tidak tersedia.' });
      return;
    }

    cache.set(`${bucket}/${path}`, { url: result.signedUrl, exp: expiresAt });
    urls.set(path, result.signedUrl);
  });

  return { urls, errors };
}

// Gambar dari bucket privat (link bertanda tangan), klik untuk memperbesar
export default function SignedImage({ bucket, path, alt = '', className = '', signedUrlOverride }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const requested = useRef(null);

  useEffect(() => {
    let alive = true;
    let observer;
    const key = `${bucket}/${path}`;
    if (signedUrlOverride) {
      requested.current = key;
      setUrl(signedUrlOverride);
      setFailed(false);
      return () => {
        alive = false;
      };
    }
    if (requested.current !== key) {
      requested.current = null;
      setUrl(null);
      setFailed(false);
    }
    const load = () => {
      if (requested.current === key) return;
      requested.current = key;
      signedUrl(bucket, path)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setFailed(true));
    };
    if (!target) return undefined;
    if ('IntersectionObserver' in window && requested.current !== key) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          load();
        },
        { rootMargin: '200px' }
      );
      observer.observe(target);
    } else if (requested.current !== key) {
      load();
    }
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [bucket, path, target, signedUrlOverride]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const imageUrl = signedUrlOverride || url;
  if (failed) return <div ref={setTarget} className={`img-ph ${className}`}>Gambar tidak bisa dimuat</div>;
  if (!imageUrl) return <div ref={setTarget} className={`img-ph ${className}`}>…</div>;

  return (
    <>
      <img
        ref={setTarget}
        src={imageUrl}
        alt={alt}
        className={className}
        loading="lazy"
        role="button"
        tabIndex={0}
        aria-label={`Perbesar ${alt || 'gambar'}`}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open && (
        createPortal(
          <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt || 'Foto'} onClick={() => setOpen(false)}>
            <img src={imageUrl} alt={alt} />
            <button className="icon-btn light" aria-label="Tutup" onClick={() => setOpen(false)}>
              <Icon name="close" size={24} />
            </button>
          </div>,
          document.body
        )
      )}
    </>
  );
}
