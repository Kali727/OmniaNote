import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { syncQueue } from "../lib/syncQueue";
import { useDictation } from "../lib/dictation";
import { itemsApi } from "../lib/items";
import { locationsApi, type Folder, type Location, type Spot } from "../lib/locations";
import { capturePhoto } from "../lib/camera";
import { createThumbnail } from "../lib/thumbnail";
import { uploadToPresignedUrl } from "../lib/apiClient";
import { useOnlineStatus } from "../lib/network";

function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];
}

interface PendingPhoto {
  blob: Blob;
  previewUrl: string;
}

export default function NotePage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything below is optional — a user in a hurry can save with just a title, and
  // fill the rest in later from the note's own detail page.
  const [tagsText, setTagsText] = useState("");
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [folderId, setFolderId] = useState("");
  const [spotId, setSpotId] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  useEffect(() => {
    itemsApi.listTags().then(setExistingTags).catch(() => {});
    locationsApi.list().then(setLocations).catch(() => {});
  }, []);

  useEffect(() => {
    if (!locationId) {
      setFolders([]);
      setSpots([]);
      return;
    }
    setFolderId("");
    setSpotId("");
    Promise.all([locationsApi.listFolders(locationId), locationsApi.listSpots(locationId)]).then(([f, s]) => {
      setFolders(f);
      setSpots(s);
    });
  }, [locationId]);

  const appendDictatedText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBody((prev) => (prev && !prev.endsWith("\n") ? `${prev} ${trimmed}` : `${prev}${trimmed}`));
  }, []);
  const dictation = useDictation(appendDictatedText);

  function toggleTagChip(tag: string) {
    const current = parseTags(tagsText);
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    setTagsText(next.join(", "));
  }

  async function addPhoto() {
    setError(null);
    try {
      const photo = await capturePhoto();
      if (!photo) return; // user backed out of the camera
      setPendingPhotos((prev) => [...prev, photo]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the camera.");
    }
  }

  function removePendingPhoto(index: number) {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (!title.trim()) {
      setError("Give the note a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const tagNames = parseTags(tagsText);
    try {
      if (pendingPhotos.length > 0) {
        // Attaching a photo needs two real server ids up front (see /items/attach) —
        // the offline outbox only knows how to sync one not-yet-created item at a time,
        // so photos can only be attached while online. The "Add photo" button below is
        // disabled offline for the same reason, but re-check here in case connectivity
        // dropped between opening the camera and tapping Save.
        if (!navigator.onLine) {
          setError("You're offline — remove the attached photos, or reconnect, to save with them.");
          setSaving(false);
          return;
        }
        const { item: note } = await itemsApi.create({
          type: "NOTE",
          title: title.trim(),
          body: body.trim() || undefined,
          locationId: locationId || undefined,
          folderId: folderId || undefined,
          spotId: spotId || undefined,
          tagNames: tagNames.length ? tagNames : undefined,
          clientCreatedAt: new Date().toISOString(),
        });
        for (const photo of pendingPhotos) {
          const thumbnailBlob = await createThumbnail(photo.blob).catch(() => undefined);
          const {
            item: photoItem,
            uploadUrl,
            thumbnailUploadUrl,
          } = await itemsApi.create({
            type: "PHOTO",
            title: title.trim(),
            fileExtension: "jpg",
            locationId: locationId || undefined,
            folderId: folderId || undefined,
            spotId: spotId || undefined,
            clientCreatedAt: new Date().toISOString(),
          });
          if (uploadUrl) {
            await uploadToPresignedUrl(uploadUrl, photo.blob, "image/jpeg");
            await itemsApi.confirmUpload(photoItem.id, photo.blob.size, "image/jpeg");
          }
          if (thumbnailUploadUrl && thumbnailBlob) {
            await uploadToPresignedUrl(thumbnailUploadUrl, thumbnailBlob, "image/jpeg").catch(() => {});
          }
          await itemsApi.attach({ noteItemId: note.id, attachmentItemId: photoItem.id });
        }
      } else {
        await syncQueue.enqueue({
          type: "NOTE",
          title: title.trim(),
          body: body.trim() || undefined,
          locationId: locationId || undefined,
          folderId: folderId || undefined,
          spotId: spotId || undefined,
          tagNames: tagNames.length ? tagNames : undefined,
          clientCreatedAt: new Date().toISOString(),
        });
      }
      navigate(locationId ? `/locations/${locationId}` : "/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← New note
        </button>
      </div>
      <div className="screen__content">
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }} autoFocus />
        <div style={{ position: "relative", marginBottom: "0.75rem" }}>
          <textarea
            placeholder="Details… (optional)"
            value={dictation.listening ? `${body}${dictation.interimText ? (body ? " " : "") + dictation.interimText : ""}` : body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={dictation.listening}
            rows={8}
            style={{ width: "100%" }}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? "Stop dictation" : "Start dictation"}
              className={dictation.listening ? "mic-btn mic-btn--active" : "mic-btn"}
            >
              {dictation.listening ? "⏹" : "🎤"}
            </button>
          )}
        </div>
        {dictation.listening && <p className="empty-state" style={{ marginTop: "-0.5rem" }}>Listening…</p>}
        {dictation.error && <p className="error">{dictation.error}</p>}

        <div className="section-title">Photos (optional)</div>
        {pendingPhotos.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
            {pendingPhotos.map((photo, index) => (
              <div key={photo.previewUrl} style={{ position: "relative" }}>
                <img src={photo.previewUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => removePendingPhoto(index)}
                  aria-label="Remove photo"
                  style={{ position: "absolute", top: -6, right: -6, borderRadius: "50%", width: 20, height: 20, padding: 0, lineHeight: "20px" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="annotate-btn" style={{ marginBottom: "0.75rem" }} onClick={addPhoto} disabled={!online}>
          📷 {online ? "Add photo" : "Add photo (needs a connection)"}
        </button>

        <div className="section-title">Tags (optional)</div>
        {existingTags.length > 0 && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {existingTags.map((tag) => {
              const active = parseTags(tagsText).includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  className={`stamp-chip${active ? " stamp-chip--active" : ""}`}
                  onClick={() => toggleTagChip(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
        <input
          placeholder="e.g. leak, urgent"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />

        <div className="section-title">Location (optional)</div>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }}>
          <option value="">— Leave in Inbox —</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        {locationId && (
          <>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }}>
              <option value="">— No folder —</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  📁 {folder.name}
                </option>
              ))}
            </select>
            <select value={spotId} onChange={(e) => setSpotId(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }}>
              <option value="">— No spot —</option>
              {spots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  📍 {spot.name}
                </option>
              ))}
            </select>
          </>
        )}

        {error && <p className="error">{error}</p>}
        <button
          className="btn-note"
          style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }}
          onClick={save}
          disabled={saving || dictation.listening}
        >
          {saving ? "Saving…" : dictation.listening ? "Stop dictation to save" : "✓ Save"}
        </button>
      </div>
    </div>
  );
}
