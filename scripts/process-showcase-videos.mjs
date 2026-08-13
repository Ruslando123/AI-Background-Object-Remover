import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiUrl = "https://rwskgtzslhnhicmcfjas.supabase.co/functions/v1/api-v1";
const inputs = process.argv.slice(2);

if (inputs.length !== 3) {
  throw new Error(
    "Usage: node scripts/process-showcase-videos.mjs <video-1.mp4> <video-2.mp4> <video-3.mp4>",
  );
}
const outputDir = fileURLToPath(new URL("../frontend/public/video-showcase/", import.meta.url));
await mkdir(outputDir, { recursive: true });

async function api(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${body?.error?.message || response.statusText}`);
  return body.data;
}

for (let index = 0; index < inputs.length; index += 1) {
  const input = inputs[index];
  const bytes = await readFile(input);
  const session = await api("/sessions", { method: "POST" });
  const auth = { "X-Session-Id": session.sessionId, "X-Session-Token": session.sessionToken };
  const presigned = await api("/uploads/presign", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ filename: basename(input), mimeType: "video/mp4", sizeBytes: bytes.length, mediaType: "video", role: "original" }),
  });
  const upload = await fetch(presigned.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes });
  if (!upload.ok) throw new Error(`Upload ${index + 1} failed: ${upload.statusText}`);
  await api("/assets/complete-upload", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presigned.assetId }) });
  const job = await api("/jobs", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "VIDEO_REMOVE_BACKGROUND", inputAssetId: presigned.assetId, parameters: {}, idempotencyKey: `showcase-${index + 1}-${Date.now()}` }),
  });
  let completed;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const current = await api(`/jobs/${job.id}`, { headers: auth });
    process.stdout.write(`Video ${index + 1}: ${current.status} ${current.progress?.percent ?? 0}%\n`);
    if (current.status === "completed") { completed = current; break; }
    if (["failed", "cancelled"].includes(current.status)) throw new Error(current.error?.message || `Video ${index + 1} failed`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!completed) throw new Error(`Video ${index + 1} timed out`);
  const download = await api(`/assets/${completed.resultAssetId}/download`, { headers: auth });
  const result = await fetch(download.downloadUrl);
  if (!result.ok) throw new Error(`Download ${index + 1} failed`);
  await writeFile(join(outputDir, `result-${index + 1}.webm`), Buffer.from(await result.arrayBuffer()));
  await writeFile(join(outputDir, `original-${index + 1}.mp4`), bytes);
}
