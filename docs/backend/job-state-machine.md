# Job state machine

Allowed application transitions:

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> validating
  validating --> queued
  validating --> failed
  queued --> submitting
  queued --> cancelled
  submitting --> processing
  submitting --> failed
  processing --> postprocessing
  processing --> completed
  processing --> failed
  processing --> cancelled
  postprocessing --> completed
  postprocessing --> failed
  failed --> queued: retry semantics
```

`completed`, `cancelled`, and `expired` are terminal. Retention cleanup is the sole administrative path that marks unfinished/failed jobs `expired`. Normal transitions use the `transition_job_status` RPC with an expected current state; a concurrent or invalid transition changes nothing and returns a controlled error. Retry creates a new job and leaves the failed parent unchanged.

Provider-reported percentages are stored only when supplied. The API returns `null` rather than inventing precision.
