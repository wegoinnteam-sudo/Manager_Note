// Downscales/re-encodes an oversized image in the browser so it fits under
// the upload size limit, instead of the user hitting a hard rejection.
// Non-image files, and images already under the limit, pass through as-is.
export async function compressImageForUpload(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= maxBytes) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // Unsupported/corrupt image data — let the normal size check reject it.
  }

  let width = bitmap.width;
  let height = bitmap.height;
  let quality = 0.9;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size <= maxBytes) break;
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
  if (!blob || blob.size > maxBytes) return file; // Couldn't get under the limit — caller's size check handles it.

  const newName = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
}
