#!/usr/bin/env bash
set -euo pipefail

: "${API_URL:?Set API_URL to https://<project-ref>.supabase.co/functions/v1/api-v1}"
: "${INPUT_FILE:?INPUT_FILE is required}"
: "${BACKGROUND_FILE:?BACKGROUND_FILE is required}"
: "${OUTPUT_FILE:?OUTPUT_FILE is required}"

API_URL="${API_URL%/}"
for command in curl jq file; do
  command -v "${command}" >/dev/null || { echo "Missing required command: ${command}" >&2; exit 1; }
done

upload_asset() {
  local source_file="$1" role="$2" filename size response
  test -f "${source_file}"
  if [[ "$(file --brief --mime-type "${source_file}")" != "image/png" ]]; then
    echo "${source_file} must be a PNG image" >&2
    exit 1
  fi
  filename="$(basename "${source_file}")"
  size="$(wc -c < "${source_file}" | tr -d ' ')"
  response="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
    --data "{\"filename\":\"${filename}\",\"mimeType\":\"image/png\",\"sizeBytes\":${size},\"mediaType\":\"image\",\"role\":\"${role}\"}")"
  local asset_id
  asset_id="$(jq -er '.data.assetId' <<<"${response}")"
  curl -fsS -X PUT "$(jq -er '.data.uploadUrl' <<<"${response}")" -H 'Content-Type: image/png' --data-binary "@${source_file}" >/dev/null
  curl -fsS -X POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' \
    --data "{\"assetId\":\"${asset_id}\"}" | jq -e '.data.status == "ready"' >/dev/null
  printf '%s' "${asset_id}"
}

echo "[1/5] Creating session..."
SESSION="$(curl -fsS -X POST "${API_URL}/sessions")"
SESSION_ID="$(jq -er '.data.sessionId' <<<"${SESSION}")"
SESSION_TOKEN="$(jq -er '.data.sessionToken' <<<"${SESSION}")"
AUTH=(-H "X-Session-Id: ${SESSION_ID}" -H "X-Session-Token: ${SESSION_TOKEN}")

echo "[2/5] Uploading and validating main image..."
INPUT_ID="$(upload_asset "${INPUT_FILE}" original)"
echo "[3/5] Uploading and validating replacement background..."
BACKGROUND_ID="$(upload_asset "${BACKGROUND_FILE}" uploaded_background)"

echo "[4/5] Creating exactly one fal.ai replace-background job..."
JOB="$(curl -fsS -X POST "${API_URL}/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"operation\":\"IMAGE_REPLACE_BACKGROUND\",\"inputAssetId\":\"${INPUT_ID}\",\"backgroundAssetId\":\"${BACKGROUND_ID}\",\"parameters\":{},\"idempotencyKey\":\"fal-replace-live-$(date +%s)\"}")"
JOB_ID="$(jq -er '.data.id' <<<"${JOB}")"

echo "[5/5] Polling job ${JOB_ID}..."
STATUS=""
for _ in $(seq 1 180); do
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
DOWNLOAD="$(curl -fsS "${API_URL}/assets/${OUTPUT_ID}/download" "${AUTH[@]}" | jq -er '.data.downloadUrl')"
mkdir -p "$(dirname "${OUTPUT_FILE}")"
curl -fsS "${DOWNLOAD}" -o "${OUTPUT_FILE}"
file --brief --mime-type "${OUTPUT_FILE}" | grep -q '^image/'

echo "fal.ai live smoke passed for IMAGE_REPLACE_BACKGROUND; job=${JOB_ID}, output=${OUTPUT_ID}."
echo "Saved result to ${OUTPUT_FILE}."
