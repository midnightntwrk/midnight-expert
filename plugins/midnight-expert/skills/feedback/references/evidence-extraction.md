# Evidence Extraction

How to pick evidence cards for the issue body. Used in Issue Flow step 4.

## Inputs

- The raw JSONL entries (parsed) from the chosen session
- `failure-signature.json` (events list with `messageIndex` and `previousUserPromptIndex`)
- `environment.json`

## Default card set

Build up to 6 cards. Pick from these kinds, prioritized in this order:

1. **failing-tool-call** — the most-recent `tool-error` or `nonzero-exit` event from the failure signature. Use the assistant entry referenced by the event's `messageIndex` to retrieve the tool input (the command). Caption: `<tool>: <one-line summary of input>`.
2. **error-output** — separate card if the tool result content is substantial (>2 lines) or if a follow-up assistant message quotes/analyzes the error. Caption: `Tool output / error from <tool>`.
3. **preceding-user-prompt** — the user message at `previousUserPromptIndex`. Caption: `User prompt immediately before the failure`. **If `previousUserPromptIndex` is `null` (e.g., resumed sessions where no string-content user prompt precedes the failure), skip this card.**
4. **environment-snapshot** — a card whose content is a code-block formatted version of `environment.json`'s relevant fields (plugin, plugin version, CC version, model, OS, toolchain). Caption: `Environment`. Always include unless the bug is purely about the prose itself.

If multiple failures appear in the signature, prefer the one whose `previousUserPromptIndex` is closest to the user's described symptom. If unclear, pick the most recent (latest `messageIndex`).

## Caps

- No more than 6 cards per issue.
- Each card content capped at ~30 lines after redaction. Truncate with `… (truncated, N more lines)`.
- Total card content capped at ~150 lines. If exceeded, drop lower-priority cards (environment-snapshot first, then preceding-user-prompt).

## Drop rules

- If a card's redacted content reduces to fewer than 2 lines of substance, drop it.
- If two cards would have nearly identical content (e.g., the error and the tool-result), merge into one with a combined caption.

## Redaction

For each card's content, run only the string-level transforms from `${CLAUDE_SKILL_DIR}/scripts/redactor.js`:

- `redactPII(text, { gitUserName, gitUserEmail })`
- `redactSecrets(text)`
- `relativizePaths(text, { homeDir, projectRoot })`

Do NOT use the `heavy` preset's full `redact()` pipeline — it strips tool inputs/outputs, which is the very content we want to display. Heavy preset rules are for narrative IR, not surgical evidence.

## Output shape

Build `evidence-cards.json` (in-memory):

```json
{
  "cards": [
    {
      "kind": "failing-tool-call",
      "caption": "Bash: `compact compile contracts/hello-world.compact` exited 127",
      "redactedContent": "$ compact compile contracts/hello-world.compact\nbash: compact: command not found",
      "messageIndex": 47
    }
  ]
}
```
