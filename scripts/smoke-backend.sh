#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:54321/functions/v1/api-v1}"
SUPABASE_URL="${SUPABASE_URL:-${API_URL%%/functions/v1/*}}"
FUNCTIONS_URL="${API_URL%/api-v1}"
FIXTURE="tests/fixtures/sample.png"
SMOKE_ORIGIN="${SMOKE_ORIGIN:-http://localhost:5173}"
SMOKE_TMP="$(mktemp -d)"
trap 'rm -rf "${SMOKE_TMP}"' EXIT

require() { command -v "$1" >/dev/null || { echo "Missing required command: $1" >&2; exit 1; }; }
require curl
require jq
require shasum
require file
test -f "${FIXTURE}" || { echo "Missing fixture: ${FIXTURE}" >&2; exit 1; }

expect_error() {
  local expected_status="$1" expected_code="$2" method="$3" url="$4"
  shift 4
  local status
  status="$(curl -sS -o "${SMOKE_TMP}/error.json" -w '%{http_code}' -X "${method}" "${url}" "$@")"
  test "${status}" = "${expected_status}"
  jq -e --arg code "${expected_code}" '.data == null and .requestId and .error.code == $code and (.error | has("retryable"))' "${SMOKE_TMP}/error.json" >/dev/null
}

SIZE_BYTES="$(wc -c < "${FIXTURE}" | tr -d ' ')"
SOURCE_SHA="$(shasum -a 256 "${FIXTURE}" | awk '{print $1}')"
IMAGE_MAX_BYTES="$(curl -fsS "${API_URL}/capabilities" | jq -er '.data.limits.imageMaxBytes')"
TOO_LARGE_BYTES="$((IMAGE_MAX_BYTES + 1))"

# Browser preflight: explicit allowlist and required custom headers.
CORS_HEADERS="${SMOKE_TMP}/cors.headers"
curl -fsS -D "${CORS_HEADERS}" -o /dev/null -X OPTIONS "${API_URL}/sessions" \
  -H "Origin: ${SMOKE_ORIGIN}" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-session-id,x-session-token,idempotency-key,x-request-id,authorization,apikey'
grep -i -q "access-control-allow-origin: ${SMOKE_ORIGIN}" "${CORS_HEADERS}"
grep -i -q 'x-session-id' "${CORS_HEADERS}"
expect_error 401 UNAUTHORIZED OPTIONS "${API_URL}/sessions" -H 'Origin: https://denied.invalid'

SESSION_JSON="$(curl -fsS -X POST "${API_URL}/sessions")"
jq -e '.data.sessionId and .data.sessionToken and .requestId and .error == null' <<<"${SESSION_JSON}" >/dev/null
SESSION_ID="$(jq -er '.data.sessionId' <<<"${SESSION_JSON}")"
SESSION_TOKEN="$(jq -er '.data.sessionToken' <<<"${SESSION_JSON}")"
AUTH=(-H "X-Session-Id: ${SESSION_ID}" -H "X-Session-Token: ${SESSION_TOKEN}")

expect_error 401 INVALID_SESSION POST "${API_URL}/uploads/presign" -H 'Content-Type: application/json' --data '{}'
expect_error 401 INVALID_SESSION POST "${API_URL}/uploads/presign" -H "X-Session-Id: ${SESSION_ID}" -H 'X-Session-Token: wrong' -H 'Content-Type: application/json' --data '{}'
expect_error 415 UNSUPPORTED_FORMAT POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data '{"filename":"bad.exe","mimeType":"application/octet-stream","sizeBytes":1,"mediaType":"image","role":"original"}'
expect_error 413 FILE_TOO_LARGE POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"filename\":\"large.png\",\"mimeType\":\"image/png\",\"sizeBytes\":${TOO_LARGE_BYTES},\"mediaType\":\"image\",\"role\":\"original\"}"
expect_error 400 INVALID_REQUEST POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data '{"filename":"empty.png","mimeType":"image/png","sizeBytes":0,"mediaType":"image","role":"original"}'

MISMATCH_UPLOAD="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"filename\":\"mismatch.jpg\",\"mimeType\":\"image/jpeg\",\"sizeBytes\":${SIZE_BYTES},\"mediaType\":\"image\",\"role\":\"original\"}")"
curl -fsS -X PUT "$(jq -er '.data.uploadUrl' <<<"${MISMATCH_UPLOAD}")" -H 'Content-Type: image/jpeg' --data-binary "@${FIXTURE}" >/dev/null
expect_error 422 INVALID_MEDIA POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"assetId\":\"$(jq -er '.data.assetId' <<<"${MISMATCH_UPLOAD}")\"}"

EMPTY_UPLOAD="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data '{"filename":"empty-object.png","mimeType":"image/png","sizeBytes":1,"mediaType":"image","role":"original"}')"
curl -fsS -X PUT "$(jq -er '.data.uploadUrl' <<<"${EMPTY_UPLOAD}")" -H 'Content-Type: image/png' --data-binary '' >/dev/null
expect_error 422 INVALID_MEDIA POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"assetId\":\"$(jq -er '.data.assetId' <<<"${EMPTY_UPLOAD}")\"}"

UPLOAD_JSON="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${AUTH[@]}" -H 'Content-Type: application/json' \
  --data "{\"filename\":\"../../sample.png\",\"mimeType\":\"image/png\",\"sizeBytes\":${SIZE_BYTES},\"mediaType\":\"image\",\"role\":\"original\"}")"
ASSET_ID="$(jq -er '.data.assetId' <<<"${UPLOAD_JSON}")"
UPLOAD_URL="$(jq -er '.data.uploadUrl' <<<"${UPLOAD_JSON}")"
STORAGE_PATH="$(jq -er '.data.storagePath' <<<"${UPLOAD_JSON}")"
test "${STORAGE_PATH}" = "${SESSION_ID}/${ASSET_ID}/original.png"
curl -fsS -X PUT "${UPLOAD_URL}" -H 'Content-Type: image/png' --data-binary "@${FIXTURE}" >/dev/null

COMPLETE_JSON="$(curl -fsS -X POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' --data "{\"assetId\":\"${ASSET_ID}\"}")"
jq -e '.data.status == "ready" and .requestId' <<<"${COMPLETE_JSON}" >/dev/null
curl -fsS -X POST "${API_URL}/assets/complete-upload" "${AUTH[@]}" -H 'Content-Type: application/json' --data "{\"assetId\":\"${ASSET_ID}\"}" | jq -e '.data.status == "ready"' >/dev/null

PUBLIC_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${SUPABASE_URL}/storage/v1/object/public/media-assets/${STORAGE_PATH}")"
test "${PUBLIC_STATUS}" != "200"

ORIGINAL_URL="$(curl -fsS "${API_URL}/assets/${ASSET_ID}/download" "${AUTH[@]}" | jq -er '.data.downloadUrl')"
curl -fsS "${ORIGINAL_URL}" -o "${SMOKE_TMP}/original.png"
test "$(shasum -a 256 "${SMOKE_TMP}/original.png" | awk '{print $1}')" = "${SOURCE_SHA}"

SECOND_SESSION="$(curl -fsS -X POST "${API_URL}/sessions")"
SECOND_AUTH=(-H "X-Session-Id: $(jq -er '.data.sessionId' <<<"${SECOND_SESSION}")" -H "X-Session-Token: $(jq -er '.data.sessionToken' <<<"${SECOND_SESSION}")")
expect_error 404 ASSET_NOT_FOUND GET "${API_URL}/assets/${ASSET_ID}/download" "${SECOND_AUTH[@]}"

JOB_KEY="smoke-success-$(date +%s)"
create_job() {
  local key="$1" mode="$2"
  curl -fsS -X POST "${API_URL}/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' \
    --data "{\"operation\":\"IMAGE_REMOVE_BACKGROUND\",\"inputAssetId\":\"${ASSET_ID}\",\"parameters\":{\"mockFailureMode\":\"${mode}\"},\"idempotencyKey\":\"${key}\"}"
}

poll_until() {
  local job_id="$1" wanted="$2"
  for _ in $(seq 1 60); do
    local body status
    body="$(curl -fsS "${API_URL}/jobs/${job_id}" "${AUTH[@]}")"
    status="$(jq -er '.data.status' <<<"${body}")"
    if [[ "${status}" == "${wanted}" ]]; then printf '%s' "${body}"; return 0; fi
    if [[ "${status}" == "cancelled" || ( "${status}" == "failed" && "${wanted}" != "failed" ) ]]; then printf '%s\n' "${body}" >&2; return 1; fi
    sleep 0.25
  done
  echo "Timed out waiting for job ${job_id}" >&2
  return 1
}

SUCCESS_JOB="$(create_job "${JOB_KEY}" none)"
SUCCESS_ID="$(jq -er '.data.id' <<<"${SUCCESS_JOB}")"
DUPLICATE_ID="$(create_job "${JOB_KEY}" none | jq -er '.data.id')"
test "${SUCCESS_ID}" = "${DUPLICATE_ID}"

# Internal endpoints reject missing secrets. With a supplied secret, exercise the worker too.
expect_error 401 UNAUTHORIZED POST "${FUNCTIONS_URL}/process-jobs"
expect_error 401 UNAUTHORIZED POST "${FUNCTIONS_URL}/cleanup-expired"
if [[ -n "${INTERNAL_CRON_SECRET:-}" ]]; then
  curl -fsS -X POST "${FUNCTIONS_URL}/process-jobs" -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}" | jq -e '.error == null' >/dev/null
fi

COMPLETED="$(poll_until "${SUCCESS_ID}" completed)"
OUTPUT_ID="$(jq -er '.data.resultAssetId' <<<"${COMPLETED}")"
test "${OUTPUT_ID}" != "${ASSET_ID}"
expect_error 409 JOB_ALREADY_COMPLETED POST "${API_URL}/jobs/${SUCCESS_ID}/cancel" "${AUTH[@]}"
expect_error 404 JOB_NOT_FOUND GET "${API_URL}/jobs/${SUCCESS_ID}" "${SECOND_AUTH[@]}"
RESULT_URL="$(curl -fsS "${API_URL}/assets/${OUTPUT_ID}/download" "${AUTH[@]}" | jq -er '.data.downloadUrl')"
curl -fsS "${RESULT_URL}" -o "${SMOKE_TMP}/result.png"
file "${SMOKE_TMP}/result.png" | grep -q 'PNG image data'

FAILED_JOB="$(create_job "smoke-failure-$(date +%s)" temporary)"
FAILED_ID="$(jq -er '.data.id' <<<"${FAILED_JOB}")"
FAILED_STATUS="$(poll_until "${FAILED_ID}" failed)"
jq -e '.data.error.code == "PROVIDER_TEMPORARY_FAILURE"' <<<"${FAILED_STATUS}" >/dev/null
RETRY_JSON="$(curl -fsS -X POST "${API_URL}/jobs/${FAILED_ID}/retry" "${AUTH[@]}")"
RETRY_ID="$(jq -er '.data.id' <<<"${RETRY_JSON}")"
test "${RETRY_ID}" != "${FAILED_ID}"
poll_until "${RETRY_ID}" completed >/dev/null

PERMANENT_JOB="$(create_job "smoke-permanent-$(date +%s)" permanent)"
PERMANENT_ID="$(jq -er '.data.id' <<<"${PERMANENT_JOB}")"
poll_until "${PERMANENT_ID}" failed >/dev/null
expect_error 422 PROVIDER_PERMANENT_FAILURE POST "${API_URL}/jobs/${PERMANENT_ID}/retry" "${AUTH[@]}"

expect_error 401 WEBHOOK_SIGNATURE_INVALID POST "${API_URL}/webhooks/mock" -H 'Content-Type: application/json' -H 'X-Mock-Signature: invalid' --data '{}'

if [[ "${REQUIRE_DB_ASSERTIONS:-0}" = "1" ]]; then
  test -n "${SUPABASE_DB_URL:-}" || { echo 'SUPABASE_DB_URL is required for staging assertions.' >&2; exit 1; }
  test -n "${INTERNAL_CRON_SECRET:-}" || { echo 'INTERNAL_CRON_SECRET is required for staging assertions.' >&2; exit 1; }
  test -n "${MOCK_AI_WEBHOOK_SECRET:-}" || { echo 'MOCK_AI_WEBHOOK_SECRET is required for staging assertions.' >&2; exit 1; }
  require psql
  require openssl

  EXPIRED_SESSION_JSON="$(curl -fsS -X POST "${API_URL}/sessions")"
  EXPIRED_SESSION_ID="$(jq -er '.data.sessionId' <<<"${EXPIRED_SESSION_JSON}")"
  EXPIRED_SESSION_TOKEN="$(jq -er '.data.sessionToken' <<<"${EXPIRED_SESSION_JSON}")"
  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -v session_id="${EXPIRED_SESSION_ID}" -f scripts/expire-session.sql >/dev/null
  expect_error 401 SESSION_EXPIRED POST "${API_URL}/uploads/presign" \
    -H "X-Session-Id: ${EXPIRED_SESSION_ID}" -H "X-Session-Token: ${EXPIRED_SESSION_TOKEN}" \
    -H 'Content-Type: application/json' --data '{}'

  LIMIT_JOB="$(create_job "smoke-limit-$(date +%s)" temporary)"
  LIMIT_ID="$(jq -er '.data.id' <<<"${LIMIT_JOB}")"
  poll_until "${LIMIT_ID}" failed >/dev/null
  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -v job_id="${LIMIT_ID}" -f scripts/exhaust-retry.sql >/dev/null
  expect_error 409 RETRY_LIMIT_EXCEEDED POST "${API_URL}/jobs/${LIMIT_ID}/retry" "${AUTH[@]}"

  CONCURRENT_JOB_ID="$(psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -v session_id="${SESSION_ID}" -v asset_id="${ASSET_ID}" -At -f scripts/create-concurrency-job.sql | tail -1)"
  curl -fsS -X POST "${FUNCTIONS_URL}/process-jobs" -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}" -o "${SMOKE_TMP}/worker-a.json" &
  WORKER_A=$!
  curl -fsS -X POST "${FUNCTIONS_URL}/process-jobs" -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}" -o "${SMOKE_TMP}/worker-b.json" &
  WORKER_B=$!
  wait "${WORKER_A}"
  wait "${WORKER_B}"
  jq -e '.error == null' "${SMOKE_TMP}/worker-a.json" >/dev/null
  jq -e '.error == null' "${SMOKE_TMP}/worker-b.json" >/dev/null
  poll_until "${CONCURRENT_JOB_ID}" completed >/dev/null

  RACE_JOB="$(create_job "smoke-race-$(date +%s)" none)"
  RACE_ID="$(jq -er '.data.id' <<<"${RACE_JOB}")"
  PROVIDER_JOB_ID="$(psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -v job_id="${RACE_ID}" -At -f scripts/get-job-provider-id.sql | tail -1)"
  WEBHOOK_EVENT_ID="smoke-race-${RACE_ID}"
  WEBHOOK_BODY="$(jq -nc --arg event "${WEBHOOK_EVENT_ID}" --arg providerJob "${PROVIDER_JOB_ID}" --arg resultUrl "${RESULT_URL}" '{externalEventId:$event,providerJobId:$providerJob,result:{status:"completed",stage:"completed",percent:100,output:{downloadUrl:$resultUrl,mimeType:"image/png",extension:"png",filename:"result.png"},raw:{smoke:true}}}')"
  WEBHOOK_SIGNATURE="$(printf '%s' "${WEBHOOK_BODY}" | openssl dgst -sha256 -hmac "${MOCK_AI_WEBHOOK_SECRET}" | awk '{print $NF}')"
  sleep 0.6
  curl -fsS "${API_URL}/jobs/${RACE_ID}" "${AUTH[@]}" -o "${SMOKE_TMP}/race-poll.json" &
  POLL_PID=$!
  curl -fsS -X POST "${API_URL}/webhooks/mock" -H 'Content-Type: application/json' \
    -H "X-Mock-Signature: ${WEBHOOK_SIGNATURE}" --data "${WEBHOOK_BODY}" -o "${SMOKE_TMP}/race-webhook.json" &
  WEBHOOK_PID=$!
  wait "${POLL_PID}"
  wait "${WEBHOOK_PID}"
  poll_until "${RACE_ID}" completed >/dev/null
  curl -fsS -X POST "${API_URL}/webhooks/mock" -H 'Content-Type: application/json' \
    -H "X-Mock-Signature: ${WEBHOOK_SIGNATURE}" --data "${WEBHOOK_BODY}" | jq -e '.data.duplicate == true' >/dev/null

  CLEANUP_SESSION_JSON="$(curl -fsS -X POST "${API_URL}/sessions")"
  CLEANUP_SESSION_ID="$(jq -er '.data.sessionId' <<<"${CLEANUP_SESSION_JSON}")"
  CLEANUP_SESSION_TOKEN="$(jq -er '.data.sessionToken' <<<"${CLEANUP_SESSION_JSON}")"
  CLEANUP_AUTH=(-H "X-Session-Id: ${CLEANUP_SESSION_ID}" -H "X-Session-Token: ${CLEANUP_SESSION_TOKEN}")
  CLEANUP_UPLOAD="$(curl -fsS -X POST "${API_URL}/uploads/presign" "${CLEANUP_AUTH[@]}" -H 'Content-Type: application/json' \
    --data "{\"filename\":\"sample.png\",\"mimeType\":\"image/png\",\"sizeBytes\":${SIZE_BYTES},\"mediaType\":\"image\",\"role\":\"original\"}")"
  CLEANUP_ASSET_ID="$(jq -er '.data.assetId' <<<"${CLEANUP_UPLOAD}")"
  CLEANUP_STORAGE_PATH="$(jq -er '.data.storagePath' <<<"${CLEANUP_UPLOAD}")"
  curl -fsS -X PUT "$(jq -er '.data.uploadUrl' <<<"${CLEANUP_UPLOAD}")" -H 'Content-Type: image/png' --data-binary "@${FIXTURE}" >/dev/null
  curl -fsS -X POST "${API_URL}/assets/complete-upload" "${CLEANUP_AUTH[@]}" -H 'Content-Type: application/json' --data "{\"assetId\":\"${CLEANUP_ASSET_ID}\"}" | jq -e '.data.status == "ready"' >/dev/null
  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -v session_id="${CLEANUP_SESSION_ID}" -v asset_id="${CLEANUP_ASSET_ID}" -f scripts/prepare-cleanup-fixture.sql >/dev/null
  CLEANUP_FIRST="$(curl -fsS -X POST "${FUNCTIONS_URL}/cleanup-expired" -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}")"
  jq -e '.data.assetsDeleted >= 1 and .data.jobsExpired >= 1 and .data.failedCount >= 1' <<<"${CLEANUP_FIRST}" >/dev/null
  curl -fsS -X POST "${FUNCTIONS_URL}/cleanup-expired" -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}" | jq -e '.error == null' >/dev/null
  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 \
    -v expired_session_id="${CLEANUP_SESSION_ID}" -v expired_asset_id="${CLEANUP_ASSET_ID}" \
    -v expired_storage_path="${CLEANUP_STORAGE_PATH}" -v active_session_id="${SESSION_ID}" \
    -f scripts/verify-cleanup-state.sql

  psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 \
    -v session_id="${SESSION_ID}" -v original_id="${ASSET_ID}" \
    -v success_id="${SUCCESS_ID}" -v failed_id="${FAILED_ID}" \
    -v retry_id="${RETRY_ID}" -v concurrency_id="${CONCURRENT_JOB_ID}" -v race_id="${RACE_ID}" \
    -f scripts/verify-smoke-state.sql
fi

echo "Smoke test passed: CORS, auth negatives, private upload, byte checksum, idempotency, mock completion, download, retry, and internal endpoint guards."
