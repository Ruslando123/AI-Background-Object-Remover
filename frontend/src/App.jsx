import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  Eyedropper,
  GearSix,
  ImageSquare,
  Lightning,
  MagicWand,
  PaintBrush,
  Scissors,
  Shapes,
  ShieldCheck,
  Sparkle,
  Target,
  Trash,
  UploadSimple,
  VideoCamera,
} from "@phosphor-icons/react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://rwskgtzslhnhicmcfjas.supabase.co/functions/v1/api-v1";

const modes = [
  {
    id: "remove",
    title: "Remove background",
    description: "Get a transparent PNG",
    icon: Scissors,
  },
  {
    id: "image",
    title: "Image",
    description: "Replace with another image",
    icon: ImageSquare,
  },
  {
    id: "color",
    title: "Color",
    description: "Choose a solid background",
    icon: Eyedropper,
  },
  {
    id: "prompt",
    title: "AI background",
    description: "Generate from a prompt",
    icon: Sparkle,
  },
  {
    id: "erase",
    title: "Erase object",
    description: "Brush over what you want gone",
    icon: PaintBrush,
  },
];

const showcaseExamples = [
  { title: "Portrait", asset: "/showcase/woman-before-after.png" },
  { title: "Fine edges", asset: "/showcase/dog-before-after.png" },
  { title: "Product", asset: "/showcase/shoe-before-after.png" },
  { title: "People", asset: "/showcase/people-before-after.png" },
  { title: "New background", asset: "/showcase/new-background-before-after.png" },
  { title: "Color background", asset: "/showcase/color-background-before-after.png" },
];

function ShowcaseComparison({ example, index }) {
  const [position, setPosition] = useState(50);

  function update(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  }

  return (
    <article className="showcase-card">
      <div
        className="showcase-frame checkerboard"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
        }}
      >
        {example.asset ? (
          <img className="paired-image paired-after" src={example.asset} alt={`${example.title}: after`} />
        ) : (
          <img className="showcase-image" src={example.after} alt={`${example.title}: after`} />
        )}
        <div className="showcase-before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          {example.asset ? (
            <img className="paired-image paired-before" src={example.asset} alt={`${example.title}: before`} />
          ) : (
            <img className="showcase-image" src={example.before} alt={`${example.title}: before`} />
          )}
        </div>
        <span className="showcase-tag tag-before">Before</span>
        <span className="showcase-tag tag-after">After</span>
        <div className="showcase-divider" style={{ left: `${position}%` }}>
          <button
            type="button"
            role="slider"
            aria-label={`Before and after comparison: ${example.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(position)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setPosition((value) => Math.max(0, value - 5));
              if (event.key === "ArrowRight") setPosition((value) => Math.min(100, value + 5));
            }}
          >‹ ›</button>
        </div>
      </div>
      <div className="showcase-card-copy">
        <span>0{index + 1}</span>
        <strong>{example.title}</strong>
      </div>
    </article>
  );
}

function VideoShowcaseComparison({ index }) {
  const [position, setPosition] = useState(50);
  const originalRef = useRef(null);
  const resultRef = useRef(null);

  function update(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  }

  function syncResult() {
    const original = originalRef.current;
    const result = resultRef.current;
    if (!original?.duration || !result?.duration) return;
    const ratio = result.duration / original.duration;
    result.playbackRate = Math.max(0.25, Math.min(4, ratio));
    const expectedTime = original.currentTime * ratio;
    if (Math.abs(result.currentTime - expectedTime) > 0.045) {
      result.currentTime = Math.min(expectedTime, result.duration - 0.01);
    }
    if (original.paused && !result.paused) result.pause();
    if (!original.paused && result.paused) result.play().catch(() => {});
  }

  return (
    <article className="video-showcase-card">
      <div
        className="showcase-frame video-showcase-frame checkerboard"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
        }}
      >
        <video
          ref={resultRef}
          src={`/video-showcase/result-${index}.webm`}
          autoPlay muted playsInline preload="auto"
          onLoadedMetadata={syncResult}
        />
        <div className="showcase-before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <video
            ref={originalRef}
            src={`/video-showcase/original-${index}.mp4`}
            autoPlay loop muted playsInline preload="auto"
            onLoadedMetadata={syncResult}
            onTimeUpdate={syncResult}
            onPlay={syncResult}
            onPause={() => resultRef.current?.pause()}
          />
        </div>
        <span className="showcase-tag tag-before">Before</span>
        <span className="showcase-tag tag-after">After</span>
        <div className="showcase-divider" style={{ left: `${position}%` }}>
          <button
            type="button"
            role="slider"
            aria-label={`Video comparison ${index}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(position)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setPosition((value) => Math.max(0, value - 5));
              if (event.key === "ArrowRight") setPosition((value) => Math.min(100, value + 5));
            }}
          >‹ ›</button>
        </div>
      </div>
    </article>
  );
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "The request could not be completed.");
  }
  return body.data;
}

async function uploadAsset(file, role, auth, mediaType = "image") {
  const presigned = await api("/uploads/presign", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      mediaType,
      role,
    }),
  });
  const upload = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!upload.ok) throw new Error("The file could not be uploaded.");
  await api("/assets/complete-upload", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: presigned.assetId }),
  });
  return presigned.assetId;
}

export function App() {
  const [mediaMode, setMediaMode] = useState("photo");
  const [mode, setMode] = useState("remove");
  const [mainFile, setMainFile] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [color, setColor] = useState("#E8F0FF");
  const [prompt, setPrompt] = useState("");
  const [brushSize, setBrushSize] = useState(42);
  const [refineEdges, setRefineEdges] = useState(true);
  const [maskRevision, setMaskRevision] = useState(0);
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [comparisonRatio, setComparisonRatio] = useState(4 / 3);
  const [resultUrl, setResultUrl] = useState("/demo/result.png");
  const [status, setStatus] = useState("demo");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [downloadName, setDownloadName] = useState("ai-background-result.png");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const backgroundRef = useRef(null);
  const editorImageRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const comparisonDraggingRef = useRef(false);
  const processingContextRef = useRef(null);
  const originalVideoRef = useRef(null);
  const resultVideoRef = useRef(null);

  const mainPreview = useMemo(
    () => (mainFile ? URL.createObjectURL(mainFile) : "/demo/original.png"),
    [mainFile],
  );
  const backgroundPreview = useMemo(
    () => (backgroundFile ? URL.createObjectURL(backgroundFile) : ""),
    [backgroundFile],
  );

  useEffect(() => {
    return () => {
      if (mainFile) URL.revokeObjectURL(mainPreview);
      if (backgroundFile) URL.revokeObjectURL(backgroundPreview);
    };
  }, [mainFile, backgroundFile, mainPreview, backgroundPreview]);

  useEffect(() => {
    if (mode !== "erase" || !mainFile) return;
    const frame = requestAnimationFrame(sizeMaskCanvas);
    window.addEventListener("resize", sizeMaskCanvas);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sizeMaskCanvas);
    };
  }, [mode, mainFile]);

  function selectMain(file) {
    if (!file) return;
    setMainFile(file);
    setResultUrl("");
    setStatus("ready");
    setError("");
    setMaskRevision(0);
    processingContextRef.current = null;
  }

  function sizeMaskCanvas() {
    const image = editorImageRef.current;
    const canvas = maskCanvasRef.current;
    if (!image || !canvas || !image.naturalWidth) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const scale = Math.min(
      image.clientWidth / image.naturalWidth,
      image.clientHeight / image.naturalHeight,
    );
    canvas.style.width = `${image.naturalWidth * scale}px`;
    canvas.style.height = `${image.naturalHeight * scale}px`;
  }

  function paintMask(event) {
    if (!drawingRef.current) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ff4169";
    context.globalAlpha = 0.68;
    context.beginPath();
    context.arc(
      x,
      y,
      ((brushSize / rect.width) * canvas.width) / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 1;
    if (processingContextRef.current)
      processingContextRef.current.maskAssetId = undefined;
    setMaskRevision((value) => value + 1);
  }

  function clearMask() {
    const canvas = maskCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setMaskRevision(0);
    if (processingContextRef.current)
      processingContextRef.current.maskAssetId = undefined;
  }

  function updateComparison(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setComparisonPosition(Math.max(0, Math.min(100, next)));
  }

  function syncVideos(source) {
    const other =
      source === originalVideoRef.current
        ? resultVideoRef.current
        : originalVideoRef.current;
    if (!other || Math.abs(other.currentTime - source.currentTime) < 0.08)
      return;
    other.currentTime = source.currentTime;
  }

  async function toggleVideoPlayback() {
    const original = originalVideoRef.current;
    const result = resultVideoRef.current;
    if (!original || !result) return;
    if (original.paused) {
      result.currentTime = original.currentTime;
      await Promise.allSettled([original.play(), result.play()]);
    } else {
      original.pause();
      result.pause();
    }
  }

  async function maskFile() {
    const source = maskCanvasRef.current;
    if (!source || maskRevision === 0)
      throw new Error("Brush over the object you want to remove.");
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d");
    context.fillStyle = "black";
    context.fillRect(0, 0, output.width, output.height);
    const sourceContext = source.getContext("2d");
    const pixels = sourceContext.getImageData(
      0,
      0,
      source.width,
      source.height,
    );
    const binary = context.createImageData(source.width, source.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const selected = pixels.data[index + 3] > 0;
      binary.data[index] = selected ? 255 : 0;
      binary.data[index + 1] = selected ? 255 : 0;
      binary.data[index + 2] = selected ? 255 : 0;
      binary.data[index + 3] = 255;
    }
    if (refineEdges) {
      const binaryCanvas = document.createElement("canvas");
      binaryCanvas.width = source.width;
      binaryCanvas.height = source.height;
      binaryCanvas.getContext("2d").putImageData(binary, 0, 0);
      context.filter = "blur(2px)";
      context.drawImage(binaryCanvas, 0, 0);
      context.filter = "none";
    } else {
      context.putImageData(binary, 0, 0);
    }
    const blob = await new Promise((resolve) =>
      output.toBlob(resolve, "image/png"),
    );
    return new File([blob], "object-mask.png", { type: "image/png" });
  }

  async function processImage() {
    if (!mainFile) {
      inputRef.current?.click();
      return;
    }
    if (mode === "image" && !backgroundFile) {
      setError("Add an image for the new background.");
      backgroundRef.current?.click();
      return;
    }
    if (mode === "prompt" && prompt.trim().length < 3) {
      setError("Describe the new background using at least three characters.");
      return;
    }
    if (mode === "erase" && maskRevision === 0) {
      setError("Brush over the object you want to remove.");
      return;
    }

    setStatus("processing");
    setProgress(5);
    setStage("Creating a secure session…");
    setError("");
    try {
      let context = processingContextRef.current;
      if (!context) {
        const session = await api("/sessions", { method: "POST" });
        const auth = {
          "X-Session-Id": session.sessionId,
          "X-Session-Token": session.sessionToken,
        };
        setProgress(15);
        setStage(
          mediaMode === "video"
            ? "Uploading the source video…"
            : "Uploading the source image…",
        );
        const inputAssetId = await uploadAsset(
          mainFile,
          "original",
          auth,
          mediaMode === "video" ? "video" : "image",
        );
        context = { auth, inputAssetId };
        processingContextRef.current = context;
      }
      const { auth, inputAssetId } = context;
      let { backgroundAssetId, maskAssetId } = context;
      if (mode === "image" && !backgroundAssetId) {
        setProgress(25);
        setStage("Uploading the new background…");
        backgroundAssetId = await uploadAsset(
          backgroundFile,
          "uploaded_background",
          auth,
        );
        context.backgroundAssetId = backgroundAssetId;
      }
      if (mode === "erase" && !maskAssetId) {
        setProgress(25);
        setStage("Uploading the object mask…");
        maskAssetId = await uploadAsset(await maskFile(), "mask", auth);
        context.maskAssetId = maskAssetId;
      }
      setProgress(35);
      setStage("Sending the job to fal.ai…");
      const job = await api("/jobs", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          operation:
            mediaMode === "video"
              ? "VIDEO_REMOVE_BACKGROUND"
              : mode === "remove"
                ? "IMAGE_REMOVE_BACKGROUND"
                : mode === "erase"
                  ? "IMAGE_ERASE_OBJECT"
                  : "IMAGE_REPLACE_BACKGROUND",
          inputAssetId,
          ...(maskAssetId ? { maskAssetId } : {}),
          ...(backgroundAssetId ? { backgroundAssetId } : {}),
          parameters:
            mode === "color"
              ? { backgroundColor: color }
              : mode === "prompt"
                ? { backgroundPrompt: prompt.trim() }
                : {},
          idempotencyKey: `web-${crypto.randomUUID()}`,
        }),
      });

      let completed;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const current = await api(`/jobs/${job.id}`, { headers: auth });
        setStage(
          current.progress?.stage ||
            (mediaMode === "video"
              ? "Processing video…"
              : "Processing image…"),
        );
        setProgress(
          current.progress?.percent ?? Math.min(92, 40 + attempt * 2),
        );
        if (current.status === "completed") {
          completed = current;
          break;
        }
        if (["failed", "cancelled"].includes(current.status)) {
          throw new Error(
            current.error?.message || "Processing did not complete.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!completed) throw new Error("The result took too long to complete.");
      const download = await api(
        `/assets/${completed.resultAssetId}/download`,
        { headers: auth },
      );
      setResultUrl(download.downloadUrl);
      setDownloadName(
        download.filename ||
          (mediaMode === "video"
            ? "ai-background-video.webm"
            : "ai-background-result.png"),
      );
      setStatus("completed");
      setProgress(100);
      setStage("Done");
    } catch (processingError) {
      setStatus("error");
      setProgress(0);
      setError(processingError.message || "Something went wrong.");
    }
  }

  function reset() {
    setMainFile(null);
    setBackgroundFile(null);
    setMode("remove");
    setPrompt("");
    clearMask();
    setResultUrl("/demo/result.png");
    setStatus("demo");
    setError("");
    setStage("");
    setProgress(0);
    processingContextRef.current = null;
  }

  function switchMediaMode(nextMode) {
    setMediaMode(nextMode);
    setMainFile(null);
    setResultUrl(nextMode === "photo" ? "/demo/result.png" : "");
    setStatus(nextMode === "photo" ? "demo" : "ready");
    setError("");
    processingContextRef.current = null;
  }

  const actionLabel =
    mode === "remove"
      ? "Remove background"
      : mode === "erase"
        ? "Erase object"
        : mode === "prompt"
          ? "Generate AI background"
          : "Replace background";

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={reset}>
          <span className="brand-mark">
            <Scissors size={24} weight="bold" />
          </span>
          <span>AI Background &amp; Object Remover</span>
        </button>
        <div className="top-actions">
          <span className="privacy">
            <ShieldCheck size={18} /> Files protected
          </span>
          <button className="ghost-button" type="button" onClick={reset}>
            <ArrowCounterClockwise size={19} /> Reset
          </button>
          <button className="icon-button" type="button" aria-label="Settings">
            <GearSix size={21} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="canvas-column">
          <div className="media-switch" aria-label="Media type">
            <button
              type="button"
              className={mediaMode === "photo" ? "active" : ""}
              onClick={() => switchMediaMode("photo")}
            >
              <ImageSquare size={18} /> Photo
            </button>
            <button
              type="button"
              className={mediaMode === "video" ? "active" : ""}
              onClick={() => switchMediaMode("video")}
            >
              <VideoCamera size={18} /> Video
            </button>
          </div>
          <div
            className={`upload-canvas ${dragging ? "is-dragging" : ""} ${mainFile ? "has-image" : "is-empty"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectMain(event.dataTransfer.files?.[0]);
            }}
          >
            {mainFile && mediaMode === "photo" ? (
              <div className="editor-stage">
                <img
                  ref={editorImageRef}
                  src={mainPreview}
                  alt="Uploaded source image"
                  onLoad={sizeMaskCanvas}
                />
                {mode === "erase" && (
                  <>
                    <canvas
                      ref={maskCanvasRef}
                      className="mask-canvas"
                      onPointerDown={(event) => {
                        drawingRef.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        paintMask(event);
                      }}
                      onPointerMove={paintMask}
                      onPointerUp={() => (drawingRef.current = false)}
                      onPointerCancel={() => (drawingRef.current = false)}
                    />
                    {maskRevision === 0 && (
                      <div className="brush-onboarding">
                        <PaintBrush size={21} weight="fill" />
                        <span>
                          <strong>Brush over the unwanted object</strong>
                          <small>Click and drag to paint the mask</small>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : mainFile && mediaMode === "video" ? (
              <video
                className="video-preview"
                src={mainPreview}
                controls
                playsInline
              />
            ) : null}
            <button
              className={`upload-chip ${mainFile && mode === "erase" ? "compact" : ""}`}
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <UploadSimple size={20} />
              <span>
                <strong>
                  {mainFile
                    ? mediaMode === "video"
                      ? "Replace video"
                      : "Replace photo"
                    : mediaMode === "video"
                      ? "Upload video"
                      : "Upload your photo"}
                </strong>
                <small>
                  {mediaMode === "video"
                    ? "MP4, MOV or WebM · up to 500 MB · 60 sec"
                    : "JPG, PNG or WebP · up to 25 MB"}
                </small>
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={
                mediaMode === "video"
                  ? "video/mp4,video/quicktime,video/webm"
                  : "image/jpeg,image/png,image/webp"
              }
              hidden
              onChange={(event) => selectMain(event.target.files?.[0])}
            />
          </div>

          {mediaMode === "photo" && (
            <div className="comparison" aria-label="Before and after comparison">
              <div className="comparison-title">
                <span>Result preview</span>
                <div className="comparison-presets">
                  <button
                    type="button"
                    onClick={() => setComparisonPosition(100)}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparisonPosition(0)}
                  >
                    After
                  </button>
                </div>
              </div>
              <div
                className="comparison-slider checkerboard"
                style={{
                  aspectRatio: comparisonRatio,
                  maxWidth: `${Math.min(1000, comparisonRatio * 620)}px`,
                }}
                onPointerDown={(event) => {
                  comparisonDraggingRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateComparison(event);
                }}
                onPointerMove={(event) => {
                  if (comparisonDraggingRef.current) updateComparison(event);
                }}
                onPointerUp={() => (comparisonDraggingRef.current = false)}
                onPointerCancel={() => (comparisonDraggingRef.current = false)}
              >
                {resultUrl ? (
                  <img
                    className="comparison-after"
                    src={resultUrl}
                    alt="After processing"
                  />
                ) : (
                  <div className="empty-result">
                    <MagicWand size={28} />
                    <span>Your result will appear here</span>
                  </div>
                )}
                <div
                  className="comparison-before"
                  style={{
                    clipPath: `inset(0 ${100 - comparisonPosition}% 0 0)`,
                  }}
                >
                  <img
                    src={mainPreview}
                    alt="Before processing"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (image.naturalWidth && image.naturalHeight)
                        setComparisonRatio(
                          image.naturalWidth / image.naturalHeight,
                        );
                    }}
                  />
                </div>
                <span className="comparison-label before-label">Before</span>
                <span className="comparison-label after-label">After</span>
                <div
                  className="comparison-divider"
                  style={{ left: `${comparisonPosition}%` }}
                >
                  <button
                    type="button"
                    className="comparison-handle"
                    role="slider"
                    aria-label="Compare original and result"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={comparisonPosition}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft")
                        setComparisonPosition((value) =>
                          Math.max(0, value - 5),
                        );
                      if (event.key === "ArrowRight")
                        setComparisonPosition((value) =>
                          Math.min(100, value + 5),
                        );
                    }}
                  >
                    ‹ ›
                  </button>
                </div>
              </div>
            </div>
          )}

          {mediaMode === "video" && (
            <div className="video-info-card">
              <VideoCamera size={24} />
              <div>
                <strong>
                  {resultUrl
                    ? "Your result is ready to preview"
                    : "Your video is ready to process"}
                </strong>
                <p>
                  {resultUrl
                    ? "The transparent WebM keeps the original audio."
                    : "A transparent WebM with the original audio will appear here."}
                </p>
                {resultUrl && (
                  <div className="video-comparison-wrap">
                    <div
                      className="video-comparison checkerboard"
                      onPointerDown={(event) => {
                        comparisonDraggingRef.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        updateComparison(event);
                      }}
                      onPointerMove={(event) => {
                        if (comparisonDraggingRef.current)
                          updateComparison(event);
                      }}
                      onPointerUp={() =>
                        (comparisonDraggingRef.current = false)
                      }
                      onPointerCancel={() =>
                        (comparisonDraggingRef.current = false)
                      }
                    >
                      <video
                        ref={resultVideoRef}
                        src={resultUrl}
                        playsInline
                        muted
                        onTimeUpdate={(event) =>
                          syncVideos(event.currentTarget)
                        }
                      />
                      <div
                        className="video-before-layer"
                        style={{
                          clipPath: `inset(0 ${100 - comparisonPosition}% 0 0)`,
                        }}
                      >
                        <video
                          ref={originalVideoRef}
                          src={mainPreview}
                          playsInline
                          onTimeUpdate={(event) =>
                            syncVideos(event.currentTarget)
                          }
                          onPlay={() => resultVideoRef.current?.play()}
                          onPause={() => resultVideoRef.current?.pause()}
                        />
                      </div>
                      <span className="comparison-label before-label">Before</span>
                      <span className="comparison-label after-label">
                        After
                      </span>
                      <div
                        className="comparison-divider"
                        style={{ left: `${comparisonPosition}%` }}
                      >
                        <button
                          type="button"
                          className="comparison-handle"
                          aria-label="Compare video"
                        >
                          ‹ ›
                        </button>
                      </div>
                    </div>
                    <div className="video-compare-controls">
                      <button type="button" onClick={toggleVideoPlayback}>
                        Play / Pause
                      </button>
                      <input
                        type="range"
                        min="0"
                        max={originalVideoRef.current?.duration || 1}
                        step="0.01"
                        value={originalVideoRef.current?.currentTime || 0}
                        onChange={(event) => {
                          const time = Number(event.target.value);
                          if (originalVideoRef.current)
                            originalVideoRef.current.currentTime = time;
                          if (resultVideoRef.current)
                            resultVideoRef.current.currentTime = time;
                        }}
                        aria-label="Video position"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="tool-panel">
          {mediaMode === "video" ? (
            <div className="video-tool-state">
              <p className="eyebrow">Video mode</p>
              <h1>Remove video backgrounds</h1>
              <div className="format-list">
                <span>MP4</span>
                <span>MOV</span>
                <span>WebM</span>
              </div>
              <p>
                fal.ai Bria VRMBG 3.0 removes the background while preserving
                the audio track. Your result is delivered as a transparent WebM.
              </p>
              {error && (
                <div className="error-message">
                  <span>{error}</span>
                  <button type="button" onClick={processImage}>
                    Try again
                  </button>
                </div>
              )}
              {status === "processing" && (
                <div className="progress-card" aria-live="polite">
                  <div className="progress-copy">
                    <span>{stage}</span>
                    <strong>{Math.round(progress)}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {status === "completed" && (
                <div className="status-message success">
                  <CheckCircle size={18} weight="fill" /> Video processed
                </div>
              )}
              <button
                className="primary-button"
                type="button"
                onClick={processImage}
                disabled={status === "processing"}
              >
                <VideoCamera size={20} />
                {status === "processing"
                  ? "Processing…"
                  : "Remove video background"}
              </button>
              {status === "completed" && (
                <button
                  className="regenerate-button"
                  type="button"
                  onClick={processImage}
                >
                  <ArrowCounterClockwise size={19} /> Process again
                </button>
              )}
              <a
                className={`download-button ${!resultUrl ? "disabled" : ""}`}
                href={resultUrl || undefined}
                download={downloadName}
              >
                <DownloadSimple size={21} /> Download WebM
              </a>
            </div>
          ) : (
            <>
              <div>
                <p className="eyebrow">Edit mode</p>
                <h1>What should we do?</h1>
              </div>
              <div className="mode-list">
                {modes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={`mode-option ${mode === item.id ? "selected" : ""}`}
                      type="button"
                      onClick={() => {
                        setMode(item.id);
                        setError("");
                      }}
                    >
                      <span className="mode-icon">
                        <Icon size={24} />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="radio" />
                    </button>
                  );
                })}
              </div>

              {mode === "image" && (
                <div className="mode-detail">
                  <label>New background image</label>
                  <button
                    className="background-picker"
                    type="button"
                    onClick={() => backgroundRef.current?.click()}
                  >
                    {backgroundPreview ? (
                      <img src={backgroundPreview} alt="Selected background" />
                    ) : (
                      <ImageSquare size={26} />
                    )}
                    <span>
                      {backgroundFile
                        ? backgroundFile.name
                        : "Choose an image"}
                    </span>
                  </button>
                  <input
                    ref={backgroundRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(event) => {
                      setBackgroundFile(event.target.files?.[0] || null);
                      if (processingContextRef.current)
                        processingContextRef.current.backgroundAssetId =
                          undefined;
                    }}
                  />
                </div>
              )}

              {mode === "color" && (
                <div className="mode-detail color-detail">
                  <label htmlFor="background-color">New background color</label>
                  <div className="color-control">
                    <input
                      id="background-color"
                      type="color"
                      value={color}
                      onChange={(event) =>
                        setColor(event.target.value.toUpperCase())
                      }
                    />
                    <input
                      aria-label="Color HEX code"
                      value={color}
                      onChange={(event) =>
                        setColor(event.target.value.toUpperCase())
                      }
                      maxLength={7}
                    />
                  </div>
                </div>
              )}

              {mode === "prompt" && (
                <div className="mode-detail">
                  <label htmlFor="background-prompt">
                    Describe the new background
                  </label>
                  <textarea
                    id="background-prompt"
                    value={prompt}
                    maxLength={500}
                    placeholder="For example: a bright modern studio with soft daylight"
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                  <small className="field-hint">
                    AI keeps the subject and creates the environment you describe.
                  </small>
                </div>
              )}

              {mode === "erase" && (
                <div className="mode-detail brush-detail">
                  <div className="detail-row">
                    <label htmlFor="brush-size">Brush size</label>
                    <strong>{brushSize}px</strong>
                  </div>
                  <input
                    id="brush-size"
                    type="range"
                    min="8"
                    max="140"
                    value={brushSize}
                    onChange={(event) =>
                      setBrushSize(Number(event.target.value))
                    }
                  />
                  <button
                    className="clear-mask-button"
                    type="button"
                    onClick={clearMask}
                  >
                    <Trash size={17} /> Clear selection
                  </button>
                  <label className="edge-toggle">
                    <input
                      type="checkbox"
                      checked={refineEdges}
                      onChange={(event) => setRefineEdges(event.target.checked)}
                    />
                    <span>Refine mask edges</span>
                  </label>
                  <small className="field-hint">
                    Paint only the unwanted object. The background will be
                    reconstructed automatically.
                  </small>
                </div>
              )}

              <div className="panel-footer">
                {error && (
                  <div className="error-message">
                    <span>{error}</span>
                    <button type="button" onClick={processImage}>
                      Try again
                    </button>
                  </div>
                )}
                {status === "processing" && (
                  <div className="progress-card" aria-live="polite">
                    <div className="progress-copy">
                      <span>{stage}</span>
                      <strong>{Math.round(progress)}%</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                {status === "completed" && (
                  <div className="status-message success">
                    <CheckCircle size={18} weight="fill" /> Processing complete
                  </div>
                )}
                <button
                  className="primary-button"
                  type="button"
                  onClick={processImage}
                  disabled={status === "processing"}
                >
                  <MagicWand size={21} weight="fill" />{" "}
                  {status === "processing" ? "Processing…" : actionLabel}
                </button>
                {status === "completed" && (
                  <button
                    className="regenerate-button"
                    type="button"
                    onClick={processImage}
                  >
                    <ArrowCounterClockwise size={19} /> Generate again
                  </button>
                )}
                <a
                  className={`download-button ${!resultUrl ? "disabled" : ""}`}
                  href={resultUrl || undefined}
                  download={downloadName}
                >
                  <DownloadSimple size={21} /> Download result
                </a>
                <p className="fine-print">
                  Files are stored privately and deleted automatically.
                </p>
              </div>
            </>
          )}
        </aside>
      </section>

      <section className="marketing-section steps-section">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>REMOVE BACKGROUNDS<br />IN 3 EASY STEPS</h2>
          <p>Go from your original file to a clean transparent result in under a minute — no manual tracing.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <div className="step-visual step-ui" aria-label="Upload source file">
              <span className="step-ui-icon"><UploadSimple size={34} weight="bold" /></span>
              <div className="step-ui-copy"><strong>Drop your file here</strong><small>JPG · PNG · WEBP</small></div>
              <span className="step-ui-status">READY</span>
            </div>
            <span className="step-number">01</span>
            <h3>Upload your file</h3>
            <p>Drop a JPG, PNG, WebP or supported video into the workspace.</p>
          </article>
          <article className="step-card featured">
            <div className="step-visual step-ui processing-ui" aria-label="Automatic subject detection">
              <span className="step-ui-icon"><Sparkle size={34} weight="fill" /></span>
              <div className="step-ui-copy"><strong>Detecting subject</strong><small>EDGES · HAIR · DETAILS</small></div>
              <div className="step-ui-progress"><span /></div>
              <span className="step-ui-status">98%</span>
            </div>
            <span className="step-number">02</span>
            <h3>Start processing</h3>
            <p>AI finds the main subject and precisely handles every edge.</p>
          </article>
          <article className="step-card">
            <div className="step-visual step-ui result-ui checkerboard" aria-label="Background-free result ready">
              <span className="step-ui-icon"><DownloadSimple size={34} weight="bold" /></span>
              <div className="step-ui-copy"><strong>Your result is ready</strong><small>PNG · 2048 × 2048</small></div>
              <span className="step-ui-status success-status">DONE</span>
            </div>
            <span className="step-number">03</span>
            <h3>Download the result</h3>
            <p>Save a transparent file or create a new background instantly.</p>
          </article>
        </div>
      </section>

      <section className="marketing-section showcase-section">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Results</p><h2>{mediaMode === "video" ? <>SEE EVERY FRAME<br /><span>STAY CONSISTENT.</span></> : <>COMPLEX BACKGROUND?<br /><span>NO PROBLEM.</span></>}</h2></div>
          <p>{mediaMode === "video" ? "Drag each slider to compare the original video with its background-free result." : "Drag the slider to inspect the result across portraits, products, animals and fine edges."}</p>
        </div>
        {mediaMode === "video" ? (
          <div className="video-showcase-grid">
            {[1, 2, 3].map((index) => <VideoShowcaseComparison key={index} index={index} />)}
          </div>
        ) : (
          <div className="showcase-grid">
            {showcaseExamples.map((example, index) => <ShowcaseComparison key={`${example.title}-${index}`} example={example} index={index} />)}
          </div>
        )}
      </section>

      <section className="marketing-section benefits-section">
        <div className="section-heading">
          <p className="eyebrow">Why it works</p>
          <h2>{mediaMode === "video" ? "BUILT FOR EVERY FRAME" : "PRECISION IN EVERY PIXEL"}</h2>
        </div>
        <div className="benefits-grid">
          {mediaMode === "video" ? (
            <>
              <article className="benefit-card"><span className="benefit-icon"><Target size={30} weight="bold" /></span><p className="eyebrow">01 / Tracking</p><h3>Frame-by-Frame Tracking</h3><p>The model follows your subject through every frame — handling motion, rotation and occlusion while keeping edges crisp and natural.</p></article>
              <article className="benefit-card"><span className="benefit-icon"><Shapes size={30} weight="bold" /></span><p className="eyebrow">02 / Stability</p><h3>Temporal Consistency</h3><p>No flickering, no jitter. AI keeps cutouts smooth and stable, with consistent edges from the first frame to the last.</p></article>
              <article className="benefit-card"><span className="benefit-icon"><Lightning size={30} weight="fill" /></span><p className="eyebrow">03 / Workflow</p><h3>One-Click Processing</h3><p>No rotoscoping and no manual masks. Upload your video, hit Generate and get a clean background removal without hours of manual work.</p></article>
            </>
          ) : (
            <>
              <article className="benefit-card"><span className="benefit-icon"><Target size={30} weight="bold" /></span><p className="eyebrow">01 / Accuracy</p><h3>Precise Subject Detection</h3><p>AI preserves hair, fur, transparent details and fine edges without rough cutout lines.</p></article>
              <article className="benefit-card"><span className="benefit-icon"><Shapes size={30} weight="bold" /></span><p className="eyebrow">02 / Universal</p><h3>Works with Any Subject</h3><p>People, products, animals, vehicles and complex objects — all handled in one tool.</p></article>
              <article className="benefit-card"><span className="benefit-icon"><Lightning size={30} weight="fill" /></span><p className="eyebrow">03 / Speed</p><h3>Fast Generation</h3><p>Get a polished result in seconds — no Photoshop, manual masks or lengthy retouching.</p></article>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
