// Downscales/re-encodes an image in the browser before it's uploaded, so
// what actually gets stored in Drive (and re-downloaded on every future
// preview) is already small — instead of only kicking in once a file is
// too big to upload at all. Non-image files pass through untouched.
const MAX_DIMENSION = 2400; // px, longest side — plenty for how wide a page block ever renders
const TARGET_BYTES = 2 * 1024 * 1024; // 2MB — typical phone photos are 5-15MB uncompressed

export async function compressImageForUpload(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const targetBytes = Math.min(TARGET_BYTES, maxBytes);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // Unsupported/corrupt image data — let the normal size check reject it.
  }

  const longestSide = Math.max(bitmap.width, bitmap.height);
  const alreadySmallEnough = file.size <= targetBytes && longestSide <= MAX_DIMENSION;
  if (alreadySmallEnough) {
    bitmap.close();
    return file;
  }

  let width = bitmap.width;
  let height = bitmap.height;
  if (longestSide > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longestSide;
    width *= scale;
    height *= scale;
  }

  let quality = 0.86;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    // Flatten transparency onto white before the JPEG re-encode — canvas
    // otherwise composites transparent pixels to black in most browsers.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size <= targetBytes) break;
    // Still too big for this pass: cut quality first, then fall back to
    // shrinking dimensions once quality is already low.
    if (quality > 0.5) {
      quality -= 0.15;
    } else {
      width *= 0.75;
      height *= 0.75;
    }
  }

  bitmap.close();
  // Don't swap in a "compressed" file that's actually bigger, and still
  // respect the hard upload ceiling as a last resort.
  if (!blob || blob.size >= file.size || blob.size > maxBytes) return file;

  const newName = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
}
