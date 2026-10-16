import { MAX_RECEIPT_IMAGE_CHARS } from "./receipt";

/**
 * Sizes tried in turn, longest side in px. A phone photo is 4000 px and
 * several MB; a receipt stays legible to a vision model at 1600, and the
 * smaller steps catch the photos that still don't fit.
 */
const ATTEMPTS: { maxSide: number; quality: number }[] = [
  { maxSide: 1600, quality: 0.82 },
  { maxSide: 1400, quality: 0.72 },
  { maxSide: 1100, quality: 0.65 },
];

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Turns a photo from the camera or the gallery into a JPEG `data:` URL small
 * enough for a Server Action (see MAX_RECEIPT_IMAGE_CHARS), or `null` when
 * the browser can't decode it. `createImageBitmap` applies the photo's EXIF
 * rotation, so a receipt shot in portrait doesn't arrive on its side.
 */
export async function prepareReceiptImage(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    for (const { maxSide, quality } of ATTEMPTS) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) return null;
      const dataUrl = await readAsDataUrl(blob);
      if (dataUrl.length <= MAX_RECEIPT_IMAGE_CHARS) return dataUrl;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
