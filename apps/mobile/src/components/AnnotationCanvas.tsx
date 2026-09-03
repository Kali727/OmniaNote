import { useEffect, useRef, useState } from "react";

interface Props {
  imageUrl: string;
  onDone: (annotated: Blob) => void;
  onCancel: () => void;
}

const COLORS = ["#ff3b30", "#ffd60a", "#34c759", "#ffffff"];

/**
 * Freehand markup over a photo. The drawing canvas's internal pixel size is set to the
 * image's *natural* resolution (not its on-screen display size), and pointer coordinates
 * are scaled up to match — so strokes drawn at a small on-screen size still flatten onto
 * the full-resolution photo without blurring or misalignment.
 */
export function AnnotationCanvas({ imageUrl, onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const maxWidth = Math.min(window.innerWidth - 32, 600);
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      setDisplaySize({ width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setReady(true);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function strokeTo(pos: { x: number; y: number }) {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, canvas.width / 150);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const from = lastPoint.current ?? pos;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    lastPoint.current = null;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    strokeTo(getPos(e));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    strokeTo(getPos(e));
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }

  function done() {
    const img = imgRef.current;
    const drawCanvas = canvasRef.current;
    if (!img || !drawCanvas) return;
    const out = document.createElement("canvas");
    out.width = img.naturalWidth;
    out.height = img.naturalHeight;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);
    out.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.9);
  }

  return (
    <div className="annotate-overlay">
      <div className="annotate-toolbar">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${color === c ? " swatch--active" : ""}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Draw in ${c}`}
          />
        ))}
        <button className="annotate-btn" onClick={clear}>
          Clear
        </button>
        <div style={{ flex: 1 }} />
        <button className="annotate-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="annotate-btn annotate-btn--primary" onClick={done} disabled={!ready}>
          Done
        </button>
      </div>
      <div className="annotate-canvas-wrap" style={{ width: displaySize.width, height: displaySize.height }}>
        {ready && (
          <img src={imageUrl} alt="" className="annotate-image" style={{ width: displaySize.width, height: displaySize.height }} />
        )}
        <canvas
          ref={canvasRef}
          className="annotate-canvas"
          style={{ width: displaySize.width, height: displaySize.height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}
