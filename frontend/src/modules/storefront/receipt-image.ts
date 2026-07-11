/** Compress a receipt photo so JSON base64 stays under Nest/nginx body limits. */
export async function compressReceiptImage(
  file: File,
  options?: { maxDim?: number; quality?: number; maxBytes?: number },
): Promise<string> {
  const maxDim = options?.maxDim ?? 1600;
  const quality = options?.quality ?? 0.72;
  const maxBytes = options?.maxBytes ?? 2_500_000;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Image is too large (max 25MB)");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let q = quality;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length > maxBytes && q > 0.4) {
      q -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    if (dataUrl.length > maxBytes) {
      throw new Error("Image is still too large after compression");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
