# Storage

The migration creates a private `media-assets` bucket. Paths are backend-generated:

```text
{sessionId}/{assetId}/original.ext
{sessionId}/{assetId}/mask.png
{sessionId}/{assetId}/background.ext
{sessionId}/{assetId}/result.ext
{sessionId}/{assetId}/thumbnail.ext
```

Clients first reserve an asset, then upload directly with the signed URL, then call complete-upload. The application records a configurable 15-minute authorization window and rejects late completion. Supabase's signed-upload token may have a platform-defined cryptographic lifetime; an uncompleted object remains private and is later removed by cleanup. Completion checks the storage row, exact size, declared MIME metadata, and file signature. Image dimensions are extracted when available.

Downloads require ownership and use configurable five-minute signed URLs. URLs are never stored or logged. Results receive fresh asset IDs/paths; `upsert` is disabled.

The committed `tests/fixtures/sample.png` is used by the live smoke test. The test verifies exact SHA-256 equality after signed original download and confirms that the corresponding public Storage URL does not return HTTP 200.
