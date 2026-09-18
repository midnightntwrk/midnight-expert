# Proof Server Errors

> **Last verified:** anchor re-confirmed **2026-09-18** against `midnightntwrk/midnight-ledger@ledger-8` (still the repo's default branch), `proof-server/` crate (anchor `proof-server/src/worker_pool.rs` present). Content deep-verified 2026-05-04. Note: on the divergent `ledger-9` dev branch one worker-pool error message gained an interpolated field (`"bad input"` → `` "bad input: `{0}`" ``); otherwise unchanged — re-verify once `ledger-9` becomes the default branch.

## Source

The proof server is a standalone HTTP service that generates zero-knowledge proofs for transactions. It is part of the `midnight-ledger` repository, implemented in the `proof-server` crate. It typically runs on port 6300.

The proof server is the only crate in `midnight-ledger` that uses `thiserror` derives for error handling. Errors are mapped to HTTP status codes and returned as HTTP responses.

## Worker Pool Errors (WorkerPoolError)

These errors arise from the proof server's internal job queue and worker pool management. Display strings are verbatim from `#[error(...)]`:

| HTTP Status | Error | Display string | Fixes |
|-------------|-------|----------------|-------|
| 429 Too Many Requests | `JobQueueFull` | `"Job Queue full"` | Wait and retry. **Note:** unreachable at default config — see "Capacity gating" below. |
| 428 Precondition Required | `JobMissing(Uuid)` | `"Job Missing"` | The job ID is invalid or the job has expired |
| 400 Bad Request | `JobNotPending(Uuid)` | `"Tried to cancel job, but job wasn't pending"` | Job is already processing, completed, or cancelled |
| 500 Internal Server Error | `ChannelClosed` | `"Work channel closed"` | Restart the proof server |

## Work Errors (WorkError)

These errors occur during the actual proof generation process. Display strings are verbatim from `#[error(...)]`:

| HTTP Status | Error | Display string | Fixes |
|-------------|-------|----------------|-------|
| 400 Bad Request | `BadInput(String)` | `"bad input"` | Check the transaction data being sent for proving |
| 500 Internal Server Error | `InternalError(String)` | `"internal error"` | Check proof server logs; may need restart |
| 500 Internal Server Error | `CancelledUnexpectedly` | `"work cancelled unexpectedly"` | Internal error; retry the proof request |
| 500 Internal Server Error | `JoinError` | `"task join error"` | Internal threading error; retry or restart |

In addition to the WorkError 400s above, malformed request bodies on `/check`, `/prove`, `/prove-tx`, `/k`, and out-of-range `k` on `/fetch-params/{k}` (must be `0..=25`) return 400 from `tagged_deserialize` failures via `.map_err(ErrorBadRequest)` — independent of the worker pool.

## Job Status Enum

The proof server tracks jobs through these states:

| Status | Description |
|--------|-------------|
| `Pending` | Job queued, waiting for a worker |
| `Processing` | Proof generation in progress |
| `Cancelled` | Job was cancelled |
| `Error(WorkError)` | Job failed with an error |
| `Success(Vec<u8>)` | Proof generated successfully |

## Health Endpoints

The proof server exposes two distinct health probes:

| Endpoint | HTTP Status | Meaning |
|----------|-------------|---------|
| `GET /` and `GET /health` | 200 OK | **Liveness probe** — constant `{"status": "ok", "timestamp": ...}` JSON. Never fails while the process is running. |
| `GET /ready` | 200 OK | **Readiness probe** — pool has capacity to accept new work. |
| `GET /ready` | 503 Service Unavailable | Pool is full (`pool.requests.is_full().await`). |

> **Capacity gating.** Both `503 Busy` from `/ready` and `429 JobQueueFull` are governed by `pool.requests.is_full()`, which depends on the configured `MIDNIGHT_PROOF_SERVER_JOB_CAPACITY` env var. The default is `0` — meaning **unbounded** queue, so neither 429 nor 503 will fire unless an operator explicitly sets a capacity. Plugin-side guidance about "all workers busy" is misleading: the check is queue-fullness, not worker-occupancy.

## Other Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /version` | GET | Returns the proof server version |
| `GET /fetch-params/{k}` | GET | Fetch proving parameters for the given `k`. Returns 400 if `k ∉ 0..=25`. |
| `GET /proof-versions` | GET | Returns supported `ProofVersioned` field names (`Dummy` filtered out) |
| `POST /k`, `POST /check`, `POST /prove`, `POST /prove-tx` | POST | Proof generation endpoints. Body deserialization failures return 400. |

## Default port

`6300`, configurable via `MIDNIGHT_PROOF_SERVER_PORT`. Default `--num-workers` is `2`; default `--job-timeout` is `600.0` seconds.

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 429 responses | Pool capacity reached (only fires when `MIDNIGHT_PROOF_SERVER_JOB_CAPACITY > 0`) | Reduce parallelism; increase the capacity env var; add retry with backoff |
| 503 from `/ready` | Pool full (same condition as 429); see capacity gating note above | Wait, increase capacity, or raise worker count |
| 500 with "BadInput" | Malformed transaction data | Verify the transaction was built correctly with the SDK |
| 400 from `/fetch-params/{k}` | `k` outside `0..=25` | Use a `k` in `[0, 25]` |
| 400 from `/check`, `/prove`, `/prove-tx`, `/k` | Request body failed `tagged_deserialize` | Verify the body matches the expected SCALE-tagged shape |
| Connection refused on port 6300 | Proof server not running | Start the proof server container; check Docker status |
| Slow proof generation | Large circuit / insufficient resources | Allocate more CPU/memory to the proof server container |
