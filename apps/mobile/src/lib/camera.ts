import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
}

// Messages Capacitor's web camera fallback (a hidden <input type=file capture>, since
// @ionic/pwa-elements is deliberately not registered — see main.tsx) throws when the
// user backs out without picking a photo. Anything else is a real failure and must
// reach the caller instead of being swallowed silently.
const CANCELLED_MESSAGES = new Set([
  "User cancelled photos app",
  "No image picked",
  "No image data found",
]);

/** Opens the device camera and resolves with the captured photo, or null if the user
 *  cancelled. Throws for any other failure — callers must not treat every rejection as
 *  a cancel, or a real error (e.g. a permissions problem) disappears with no feedback. */
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  let photo;
  try {
    photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 85,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (CANCELLED_MESSAGES.has(message)) return null;
    throw err instanceof Error ? err : new Error(message);
  }
  if (!photo.webPath) return null;
  const blob = await fetch(photo.webPath).then((r) => r.blob());
  return { blob, previewUrl: photo.webPath };
}
