# Issue Flow

Heavy-curation path for bug reports. Loaded from SKILL.md when `route == "issue"`.

## Steps at a glance

1. [Re-target the session if not current](#step-1-re-target-the-session-if-not-current)
2. [Show pre-filled anchors](#step-2-show-pre-filled-anchors)
3. [Forensic scan deeper](#step-3-forensic-scan-deeper)
4. [Pick evidence cards](#step-4-pick-evidence-cards)
5. [Apply heavy redaction](#step-5-apply-heavy-redaction)
6. [Show evidence summary](#step-6-show-evidence-summary)
7. [Compose the issue body](#step-7-compose-the-issue-body)
8. [Final review](#step-8-final-review)
9. [File the issue](#step-9-file-the-issue)
10. [Success / failure handling](#step-10-success--failure-handling)

## Step 1: Re-target the session if not current

The skill produced `failure-signature.json` and `plugin-candidates.json` over the CURRENT session in Phase 1. If `session_pointer != "current"`, you must re-target.

Two operations on the chosen session:

**A) Re-run failure-signature and plugin-detection over the OLDER session's RAW JSONL** (these scripts consume raw JSONL — they do NOT consume the IR, because the IR strips `is_error`):

```bash
TARGET_JSONL=~/.claude/projects/<project-key>/<chosen-sessionId>.jsonl
node ${CLAUDE_SKILL_DIR}/scripts/extract-failure-signature.js "$TARGET_JSONL" > /tmp/feedback-failure-signature.json

KNOWN="$(jq -r '.plugins | keys | join(",")' /tmp/feedback-environment.json)"
node ${CLAUDE_SKILL_DIR}/scripts/plugin-name-detection.js \
  --prose-file /tmp/feedback-prose.txt \
  --jsonl-file "$TARGET_JSONL" \
  --plugins "$KNOWN" \
  > /tmp/feedback-plugin-candidates.json
```

The IR (output of `parse-session.js`) is NOT required for the v1 issue flow. Steps 4 (evidence extraction) and 5 (redaction) read directly from the raw `$TARGET_JSONL` using the `messageIndex` pointers in `failure-signature.json`. If you find yourself wanting human-readable narrative slicing (longer-term), you can parse to IR with:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/parse-session.js "$TARGET_JSONL" > /tmp/feedback-ir.json
```

But this is optional — leave it off for v1.

Subsequent steps work with `/tmp/feedback-failure-signature.json` (raw-JSONL-derived events with `messageIndex` pointers) and the raw `$TARGET_JSONL` for direct content lookup.

## Step 2: Show pre-filled anchors

Use `AskUserQuestion` with two question objects (multi-select disabled):

- **Question 1**: "What were you trying to do?"
  - If `intent_anchor_draft` is non-null, present it as the first option labeled `Use draft (recommended)`, with the draft text in the description.
  - Add an option `Edit / type fresh`.
- **Question 2**: "What did you expect to happen?"
  - Same pattern with `expected_anchor_draft`.

Edits arrive in subsequent text replies. Capture both anchors as the final intent and expected text. Do not re-ask if the user types something thin — accept it.

## Step 3: Forensic scan deeper

You already have the failure signature. Now read the raw JSONL around each failure event (use `messageIndex` to slice the entries array) and identify the single most relevant failure event for this issue. The "most relevant" event is the one whose surrounding context best matches the user's anchors and prose.

If the failure signature has zero events:
- Ask: "I couldn't auto-spot a failure in this session. Can you describe roughly when (timestamp/branch) and what command/skill produced the error?"
- Use the response to narrow your scan and produce a synthetic event if you can identify one.
- If you still find nothing, proceed with `evidence_light = true` (Step 7 will note this in the body).

## Step 4: Pick evidence cards

Follow `references/evidence-extraction.md`. Output `evidence-cards.json` (in-memory; no file required).

## Step 5: Apply heavy redaction

For each card, pipe its raw content through `${CLAUDE_SKILL_DIR}/scripts/redact-string.js` via stdin. NEVER pass card content as a shell-quoted string — shell expansion would silently inline the user's environment variables before redaction sees them.

Pattern:

```bash
GIT_USER_NAME="$(git config user.name 2>/dev/null || true)"
GIT_USER_EMAIL="$(git config user.email 2>/dev/null || true)"
PROJECT_ROOT="$PWD"
export GIT_USER_NAME GIT_USER_EMAIL PROJECT_ROOT

# For each card, write its raw content to a temp file, then pipe via stdin:
RAW_PATH="$(mktemp)"
cat > "$RAW_PATH" <<RAW_EOF
<card raw content here>
RAW_EOF

REDACTED="$(node ${CLAUDE_SKILL_DIR}/scripts/redact-string.js < "$RAW_PATH")"
rm -f "$RAW_PATH"
```

Or, simpler if you can capture stdin programmatically (preferred):

```bash
echo -n "$RAW_CONTENT_FROM_STRUCTURED_DATA" | node ${CLAUDE_SKILL_DIR}/scripts/redact-string.js
```

The Node script reads stdin verbatim — no shell expansion of `$` references inside the content. The result is safe to use as `redactedContent` on the evidence card.

## Step 6: Show evidence summary

Use `AskUserQuestion`:

- **Question**: "N items will be included in the issue. Look right?"
- **Options**:
  - `Looks good — file it` (recommended)
  - `Let me drill in`
  - `Cancel`

In the description of `Looks good`, show a one-line summary of each card by caption. Example:

> Will include: 1) Bash: compact compile exited 127  2) User prompt immediately before  3) Environment snapshot

### Drill-in path

If user picks `Let me drill in`, show each card one at a time with its full redacted content. For each:

- **Question**: "Include this card?"
- **Options**: `Include` / `Edit caption` / `Drop`

If `Edit caption`, take the new caption in the next text reply and update.
If `Drop`, remove the card from the set.

After drilling all cards, regenerate the summary and recheck. If the user has dropped every card, abort cleanly: save the prose as a draft, exit. (An issue with no evidence has no value.)

## Step 7: Compose the issue body

Read `${CLAUDE_SKILL_DIR}/templates/issue-body.md.tmpl` and substitute per `references/issue-body-template.md`. The plugin label is already settled in Phase 3.

If `evidence_light` was set in Step 3, prepend a one-line note in the TL;DR section:

> *(Evidence-light: skill could not auto-spot a failure event; the report relies on the user's narrative.)*

## Step 8: Final review

Use `AskUserQuestion`:

- **Question**: "Issue body is composed below. File it?"
- **Options**: `Looks good — file it` (recommended) / `Edit` / `Cancel`

In `Looks good`'s description (or as a code block above the question), include the full rendered body so the user can scan it.

If `Edit`, take a free-form change request in the next text reply, regenerate the body once, re-show. **Second** rejection → save draft, abort.

## Step 9: File the issue

Save the body to a temp file first (so we can use `--body-file`):

```bash
BODY_PATH="$(mktemp /tmp/feedback-body.XXXXXX.md)"
cat > "$BODY_PATH" <<'EOF'
<rendered body>
EOF
```

Then file:

```bash
gh issue create \
  --repo midnightntwrk/midnight-expert \
  --title "<generated-title>" \
  --body-file "$BODY_PATH" \
  --label "<plugin_slug>"
```

Capture stdout (the URL) and stderr.

## Step 10: Success / failure handling

**On success.** Print to user: *"Filed: <URL>"*. Delete the temp file `$BODY_PATH`.

**On gh missing or unauthed.** Detect by checking exit code or matching stderr. Save the body:

```bash
DRAFT_DIR="${CLAUDE_PLUGIN_DATA}/.feedback/drafts"
mkdir -p "$DRAFT_DIR"
DRAFT_PATH="$DRAFT_DIR/<sessionId>-$(date -u +%Y%m%dT%H%M%SZ).md"
cp "$BODY_PATH" "$DRAFT_PATH"
```

Print:

```
gh CLI not found / unauthed. Install:
  macOS: brew install gh
  Linux: see https://cli.github.com
Then run: gh auth login

Your draft is saved at: <DRAFT_PATH>
To file once gh is ready:

  gh issue create --repo midnightntwrk/midnight-expert \
    --title "<title>" \
    --body-file <DRAFT_PATH> \
    --label <plugin-slug>
```

**On gh non-zero exit (other reasons — network, permissions, etc.).** Same draft save. Surface the gh stderr in addition to the paste-ready command.
