// Perkecil foto sebelum upload (hemat kuota & storage). Hasil: JPEG maks 1280px.
export async function compressImage(file, max = 1280, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) throw new Error('File harus berupa gambar');
  let bmp = null;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // format tidak didukung browser -> kirim apa adanya
  }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return blob || file;
}
