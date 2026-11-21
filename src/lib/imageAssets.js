export const PUBLIC_IMAGE_PATHS = [
  'images/app-background.jpg',
  'images/initial-loading.jpeg',
  'images/menu-home.png',
  'images/menu-arisan.png',
  'images/menu-kocokan.png',
  'images/menu-chat.png',
  'images/menu-admin.png',
  'images/menu-akun.png',
  'images/admin-registration.png',
  'images/admin-payment.png',
  'images/admin-group.png',
  'images/admin-people.png',
  'icons/arisanku-mark.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'arisanku-wordmark.png',
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
