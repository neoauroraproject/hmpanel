/** Compress a receipt photo so JSON base64 stays under Nest/nginx body limits. */
export async function compressReceiptImage(
  file: File,
  options?: { maxDim?: number; quality?: number; maxBytes?: number },
): Promise<string> {
  // Keep well under Nest BODY_LIMIT (15mb) and typical reverse-proxy caps.
  const maxDim = options?.maxDim ?? 1280;
  const quality = options?.quality ?? 0.65;
  const maxBytes = options?.maxBytes ?? 900_000;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Image is too large (max 20MB)");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let width = Math.max(1, Math.round(bitmap.width * Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))));
    let height = Math.max(1, Math.round(bitmap.height * Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");

    let q = quality;
    let dataUrl = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", q);
      if (dataUrl.length <= maxBytes) return dataUrl;
      if (q > 0.35) {
        q -= 0.1;
      } else {
        width = Math.max(480, Math.round(width * 0.75));
        height = Math.max(480, Math.round(height * 0.75));
        q = Math.max(0.35, q);
      }
    }
    throw new Error("Image is still too large after compression — try a smaller photo");
  } finally {
    bitmap.close();
  }
}
