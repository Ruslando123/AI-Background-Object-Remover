# AI provider interface

`AIProvider` exposes capabilities, async submission, polling, optional cancellation, and optional webhook verification/parsing. Backend operations are mapped through `PROVIDER_OPERATION_MAP`; API/database contracts do not depend on vendor request shapes.

`MockAIProvider` supports every operation for local orchestration tests, configurable delay, success, temporary failure, permanent failure, polling, a signed mock webhook, and deterministic fixture output. Configure it with `AI_PROVIDER=mock`. In local smoke tests `parameters.mockFailureMode` can exercise retry behavior.

`FalAIProvider` is the sole real adapter. Configure it with `AI_PROVIDER=fal` and server-only `FAL_KEY`. Its deliberately narrow capability list contains `IMAGE_REMOVE_BACKGROUND` and reference-image `IMAGE_REPLACE_BACKGROUND`; unverified operations return `OPERATION_NOT_SUPPORTED`.

The verified remove-background contract is:

- model ID: `fal-ai/birefnet/v2`;
- model preset: `Matting` at `2048x2048`, PNG output;
- `parameters.refineForeground` controls fal.ai `refine_foreground` and defaults to `true`;
- input: `{ "image_url": "<temporary signed source URL>", "sync_mode": false }`;
- output: `{ "image": { "url": string, "content_type"?: string, "file_name"?: string, "file_size"?: number, "width"?: number, "height"?: number } }`;
- execution: official `@fal-ai/client` queue `submit`, `status`, then `result`;
- statuses: `IN_QUEUE` → `preparing_media`, `IN_PROGRESS` → `removing_background`, `COMPLETED` → result retrieval/postprocessing. No percentage is synthesized.

The schema was verified against the official [fal.ai BiRefNet V2 API page](https://fal.ai/models/fal-ai/birefnet/v2/api). The result must be PNG; the backend downloads it server-side and stores a new private output asset.

The verified reference-image replace-background contract is:

- model ID: `fal-ai/bria/background/replace`;
- input: source `image_url`, required `ref_image_url`, `negative_prompt: ""`, `refine_prompt: true`, `fast: true`, `num_images: 1`, and `sync_mode: false`;
- output: `{ "images": Image[], "seed": number }`; the first documented image is downloaded server-side and stored as a new private output asset;
- execution: the same official queue submit/status/result flow.

The replace schema was verified against the official [fal.ai replace-background API page](https://fal.ai/models/fal-ai/bria/background/replace/api). The current backend slice intentionally requires an uploaded `backgroundAssetId`; prompt-only replacement is not advertised yet.

Any future fal operation must:

1. declare truthful capability/limit values;
2. accept signed private input URLs without persisting them in logs;
3. return an async provider job ID;
4. normalize status/output/errors into shared types;
5. verify signatures against the raw webhook body;
6. never expose its API key to clients.

No non-fal provider adapter is supported. The former Bria, Replicate, and custom placeholder directories were removed; Bria here is a model hosted and invoked through fal.ai, not a separate provider integration.
