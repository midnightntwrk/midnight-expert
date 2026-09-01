---
name: midnight-expert:feedback
description: This skill should be used when the user asks to "file feedback", "report a bug", "file an issue", "request a feature", "submit feedback", "send feedback to maintainers", or invokes /midnight-expert:feedback. Routes to a GitHub issue or enhancement on midnightntwrk/midnight-expert. The user types one paragraph; the skill silently scans the session transcript and environment, applies heavy redaction, and composes a maintainer-ready issue body.
version: 0.1.0
---

# Feedback

Route a user's feedback to GitHub on `midnightntwrk/midnight-expert` with minimal user effort. The user contributes intent and expectation; the skill provides everything else.

## Allowed Tools

Bash, Read, Write, AskUserQuestion

<!-- Note: Claude Code does not enforce this list from body content. It's documentation for human readers and a hint to the executing agent. -->

## Phase 0 — Capture opening prose

If the slash-command was invoked with arguments, those are the opening prose. Otherwise ask the user:

> "What's the feedback?"

Accept the user's free-text reply as `prose`. If `prose` is empty or whitespace-only, ask once more:

> "I need a sentence or two to get started — what's the feedback?"

If the second reply is also empty, abort cleanly: print *"Cancelled — no feedback captured."* and stop.

Save `prose` to `/tmp/feedback-prose.txt` using the Write tool (cleaner than heredoc bash).

## Phase 1 — Collect structured context

Determine the current session's JSONL file:

```bash
CURRENT_JSONL="$(bash "${CLAUDE_SKILL_DIR}/scripts/find-current-session.sh" "$PWD")"
```

The Phase 1 dependency graph (so you call these in the right batch):

```
parallel:  collect-environment.sh   list-recent-sessions.sh   find-current-session.sh
                    │                          │                          │
                    │                          │                          ▼
                    │                          │              extract-failure-signature.js
                    │                          │              plugin-name-detection.js
                    └────── all five → /tmp/feedback-*.json ──┘
```

Then in a single message, run these in parallel Bash tool calls (independent):

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/collect-environment.sh" > /tmp/feedback-environment.json
```

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/list-recent-sessions.sh" "$PWD" > /tmp/feedback-recent-sessions.json
```

If `CURRENT_JSONL` is non-empty, also run (depends on the JSONL path):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/extract-failure-signature.js" "$CURRENT_JSONL" > /tmp/feedback-failure-signature.json
```

```bash
KNOWN="$(jq -r '.plugins | keys | join(",")' /tmp/feedback-environment.json)"
node "${CLAUDE_SKILL_DIR}/scripts/plugin-name-detection.js" \
  --prose-file /tmp/feedback-prose.txt \
  --jsonl-file "$CURRENT_JSONL" \
  --plugins "$KNOWN" \
  > /tmp/feedback-plugin-candidates.json
```

If `CURRENT_JSONL` is empty (no session JSONLs found), substitute these defaults:

```bash
echo '{"events":[],"counts":{"tool-error":0,"nonzero-exit":0}}' > /tmp/feedback-failure-signature.json
echo '{"fromProse":[],"fromFailingTools":[],"activeInSession":[]}' > /tmp/feedback-plugin-candidates.json
```

### Failure handling

If individual scripts fail, fall back to `null` / empty for that field. If `~/.claude/projects/` doesn't exist at all, abort with:

> "I can't read your session storage at `~/.claude/projects/`. Re-run from a Claude Code session."

## Phase 2 — Silent inference

Read `${CLAUDE_SKILL_DIR}/references/inference-rubric.md`. Then read in parallel:

- `/tmp/feedback-prose.txt`
- `/tmp/feedback-recent-sessions.json`
- `/tmp/feedback-failure-signature.json`
- `/tmp/feedback-plugin-candidates.json`
- `/tmp/feedback-environment.json`

Apply the rubric to produce a JSON object matching this exact schema:

```json
{
  "route": "issue" | "enhancement",
  "route_confidence": "high" | "medium" | "low",
  "session_pointer": "current" | "older" | "ambiguous",
  "session_candidates": ["<sessionId>", ...],
  "plugin_label": "<slug>" | null,
  "plugin_confidence": "high" | "medium" | "low",
  "expected_anchor_draft": "<prose>" | null,
  "intent_anchor_draft": "<prose>" | null
}
```

Save it to `/tmp/feedback-inference.json` using the Write tool. Do not include any prose around the JSON.

If your output is unparseable, retry once. On the retry, prepend this exact instruction to your reasoning context: *"Output ONLY the JSON object — no markdown fences, no commentary, no leading or trailing whitespace, no explanatory text. The very first character of your output must be `{` and the last must be `}`."* If still unparseable after the retry, save the prose to a draft and abort:

```bash
DRAFT_DIR="${CLAUDE_PLUGIN_DATA}/.feedback/drafts"
mkdir -p "$DRAFT_DIR"
cp /tmp/feedback-prose.txt "$DRAFT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-prose-only.md"
```

Print: *"I couldn't analyze the feedback. Your prose is saved at <path>. Try again or file manually at https://github.com/midnightntwrk/midnight-expert/issues/new"*

## Phase 3 — Confirm only what's uncertain

Read `/tmp/feedback-inference.json`. Build a single `AskUserQuestion` call with up to 3 questions, each guarded by its confidence:

### Route question

Skip if `route_confidence == "high"`.

- **header**: `Route`
- **question**: `Is this a bug report or a feature request?`
- **options**:
  - `Bug report` (description: "Something isn't working as expected.")
  - `Feature request` (description: "I'd like a new capability.")

### Session question

Skip if `session_pointer == "current"`.

- **header**: `Session`
- **question**: `Which session does this relate to?`
- **options**: build from `session_candidates`. For each `sessionId` listed, an option whose label is `<gitBranch> · <startedAt>` and description is `<firstUserPrompt>` (truncated to ~80 chars). Always include `Current session` as the first option (recommended if `session_candidates` is empty).

### Plugin question

Skip if `plugin_confidence == "high"`.

- **header**: `Plugin`
- **question**: `Which plugin is this about?`
- **options**: build from the union of `fromProse + fromFailingTools + activeInSession` in `plugin-candidates.json`. Mark `plugin_label` (if non-null) as recommended. If the candidate list is empty, fall back to a 4-option list of plugins from `environment.json plugins` (top 4 by alphabetical order — better than nothing).

### Submitting the question

If all three are skipped (everything was high-confidence), proceed directly to Phase 4 with the inferred values.

If at least one is asked, send a single message containing the AskUserQuestion. After the user responds, update the inference object with their corrections (in working memory; no file write needed unless you prefer to persist).

## Phase 4 — Dispatch

Based on the (possibly user-corrected) `route`:

- `route == "issue"` → read `${CLAUDE_SKILL_DIR}/references/issue-flow.md` and follow it step by step.
- `route == "enhancement"` → read `${CLAUDE_SKILL_DIR}/references/enhancement-flow.md` and follow it step by step.

The hub does not duplicate route procedures inline. Each reference file is self-contained and uses the values already produced by Phases 0–3 (prose, JSONL path, environment, inference).

## Cleanup

After the route flow returns:

- Delete the per-run JSON sidecars if they still exist: `/tmp/feedback-prose.txt`, `/tmp/feedback-environment.json`, `/tmp/feedback-recent-sessions.json`, `/tmp/feedback-failure-signature.json`, `/tmp/feedback-plugin-candidates.json`, `/tmp/feedback-inference.json`.
- Defensive: clean up any leftover body tempfile from `issue-flow.md` Step 9 that didn't reach its own cleanup branch:
  ```bash
  rm -f /tmp/feedback-body.*.md
  ```
- Do NOT delete anything in `${CLAUDE_PLUGIN_DATA}/.feedback/drafts/` — those are user-visible artifacts.

## End-state

The skill has either:

- Filed an issue or enhancement (URL printed)
- Saved a draft on `gh` failure (path printed, paste-ready command printed)
- Aborted cleanly (no draft, brief message)

In all cases, return control to the user.
