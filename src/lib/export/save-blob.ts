/**
 * Saves a file the browser built itself. A blob download never navigates the
 * tab — on a phone, especially as an installed standalone PWA, navigating to
 * a file strands the user there with no browser chrome and no way back.
 */
export function saveBlob(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
