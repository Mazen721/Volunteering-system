/**
 * Helpers for turning a user-picked image file into the compact data URL the
 * API accepts as an opportunity's custom cover. The server stores the data
 * URL on the document (Railway's filesystem is ephemeral, so no file
 * uploads), which means the image must be small: it is downscaled on a
 * canvas to at most 1600px on its long side and re-encoded as JPEG.
 */

export const MAX_CUSTOM_COVER_LENGTH = 1_400_000;

const MAX_COVER_DIMENSION = 1600;
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image-load-failed'));
    image.src = url;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('file-read-failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales an image file to a JPEG data URL that fits the API's custom
 * cover limit. Throws when the file is not a readable image or stays too
 * large even at the lowest quality step.
 */
export async function downscaleImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not-an-image');
  }
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceUrl);

  const scale = Math.min(
    1,
    MAX_COVER_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas-unavailable');
  }
  context.drawImage(image, 0, 0, width, height);

  for (const quality of JPEG_QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_CUSTOM_COVER_LENGTH) {
      return dataUrl;
    }
  }
  throw new Error('image-too-large');
}
