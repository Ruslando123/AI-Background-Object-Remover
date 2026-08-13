#!/usr/bin/env bash
set -euo pipefail

: "${API_URL:?Set API_URL to https://<project-ref>.supabase.co/functions/v1/api-v1}"

if [[ "${API_URL}" == *"<"* || "${API_URL}" == *">"* || ! "${API_URL}" =~ ^https?://[^/]+/functions/v1/api-v1/?$ ]]; then
  echo "Invalid API_URL. Expected: https://YOUR_PROJECT_REF.supabase.co/functions/v1/api-v1" >&2
  exit 1
fi
API_URL="${API_URL%/}"

FIXTURE="${INPUT_FILE:-tests/fixtures/sample.png}"
OUTPUT_FILE="${OUTPUT_FILE:-}"
SMOKE_TMP="$(mktemp -d)"
trap 'rm -rf "${SMOKE_TMP}"' EXIT

for command in curl jq file od; do
  command -v "${command}" >/dev/null || { echo "Missing required command: ${command}" >&2; exit 1; }
done
test -f "${FIXTURE}"

if [[ "$(file --brief --mime-type "${FIXTURE}")" != "image/png" ]]; then
  echo "INPUT_FILE must be a PNG image" >&2
  exit 1
fi

SIZE_BYTES="$(wc -c < "${FIXTURE}" | tr -d ' ')"
echo "[1/7] Creating session..."
SESSION="$(curl -fsS -X POST "${API_URL}/sessions")"
SESSION_ID="$(jq -er '.data.sessionId' <<<"${SESSION}")"
SESSION_TOKEN="$(jq -er '.data.sessionToken' <<<"${SESSION}")"
AUTH=(-H "X-Session-Id: ${SESSION_ID}" -H "X-Session-Token: ${SESSION_TOKEN}")

echo "[2/7] Creating signed upload..."
UPLOAD="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"filename\":\"sample.png\",\"mimeType\":\"image/png\",\"sizeBytes\":${SIZE_BYTES},\"mediaType\":\"image\",\"role\":\"original\"}")"
INPUT_ID="$(jq -er '.data.assetId' <<<"${UPLOAD}")"
echo "[3/7] Uploading fixture..."
curl -fsS -X PUT "$(jq -er '.data.uploadUrl' <<<"${UPLOAD}")" -H 'Content-Type: image/png' --data-binary "@${FIXTURE}" >/dev/null
echo "[4/7] Validating uploaded asset..."
curl -fsS -X POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"assetId\":\"${INPUT_ID}\"}" | jq -e '.data.status == "ready"' >/dev/null

echo "[5/7] Creating exactly one fal.ai job..."
JOB="$(curl -fsS -X POST "${API_URL}/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"operation\":\"IMAGE_REMOVE_BACKGROUND\",\"inputAssetId\":\"${INPUT_ID}\",\"parameters\":{},\"idempotencyKey\":\"fal-live-$(date +%s)\"}")"
JOB_ID="$(jq -er '.data.id' <<<"${JOB}")"

echo "[6/7] Polling job ${JOB_ID}..."
for _ in $(seq 1 120); do
  JOB_STATE="$(curl -fsS "${API_URL}/jobs/${JOB_ID}" "${AUTH[@]}")"
  STATUS="$(jq -er '.data.status' <<<"${JOB_STATE}")"
  if [[ "${STATUS}" == "completed" ]]; then break; fi
  if [[ "${STATUS}" == "failed" || "${STATUS}" == "cancelled" ]]; then
    jq '{requestId, error: .data.error, status: .data.status}' <<<"${JOB_STATE}" >&2
    exit 1
  fi
  sleep 1
done
test "${STATUS}" = "completed"
OUTPUT_ID="$(jq -er '.data.resultAssetId' <<<"${JOB_STATE}")"
test "${OUTPUT_ID}" != "${INPUT_ID}"

DOWNLOAD="$(curl -fsS "${API_URL}/assets/${OUTPUT_ID}/download" "${AUTH[@]}" | jq -er '.data.downloadUrl')"
curl -fsS "${DOWNLOAD}" -o "${SMOKE_TMP}/fal-result.png"
file "${SMOKE_TMP}/fal-result.png" | grep -q 'PNG image data'
COLOR_TYPE="$(od -An -tu1 -j25 -N1 "${SMOKE_TMP}/fal-result.png" | tr -d ' ')"
if [[ "${COLOR_TYPE}" != "4" && "${COLOR_TYPE}" != "6" ]]; then
  echo "fal result PNG has no alpha channel (PNG color type ${COLOR_TYPE})" >&2
  exit 1
fi

if [[ -n "${OUTPUT_FILE}" ]]; then
  mkdir -p "$(dirname "${OUTPUT_FILE}")"
  cp "${SMOKE_TMP}/fal-result.png" "${OUTPUT_FILE}"
fi

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  command -v psql >/dev/null || { echo "Missing required command: psql" >&2; exit 1; }
  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 \
    -v session_id="${SESSION_ID}" -v input_id="${INPUT_ID}" -v job_id="${JOB_ID}" \
    -f scripts/verify-fal-smoke.sql
else
  echo "SUPABASE_DB_URL not set; skipped direct SQL assertions. API result and PNG alpha were verified."
fi

echo "[7/7] Verifying downloaded PNG alpha and database records..."
echo "fal.ai live smoke passed for IMAGE_REMOVE_BACKGROUND; request/job=${JOB_ID}, output=${OUTPUT_ID}."
if [[ -n "${OUTPUT_FILE}" ]]; then echo "Saved result to ${OUTPUT_FILE}."; fi
