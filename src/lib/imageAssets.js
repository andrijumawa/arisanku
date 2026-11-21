export const PUBLIC_IMAGE_PATHS = [
  'images/app-background.webp',
  'images/initial-loading.webp',
  'images/menu-home.webp',
  'images/menu-arisan.webp',
  'images/menu-kocokan.webp',
  'images/menu-chat.webp',
  'images/menu-admin.webp',
  'images/menu-akun.webp',
  'icons/arisanku-mark.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'arisanku-wordmark.webp',
];

export function preloadPublicImages() {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  return Promise.all(PUBLIC_IMAGE_PATHS.map((path) => new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) console.error(`Gagal menyiapkan gambar ${path}:`, error);
      resolve();
    };
    image.decoding = 'async';
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        finish();
        return;
      }
      image.decode().then(() => finish()).catch(finish);
    };
    image.onerror = () => finish(new Error('Gambar tidak dapat dimuat.'));
    image.src = new URL(path, baseUrl).href;
    if (image.complete) {
      if (image.naturalWidth > 0) image.onload();
      else finish(new Error('Gambar tidak dapat dimuat.'));
    }
  })));
}
