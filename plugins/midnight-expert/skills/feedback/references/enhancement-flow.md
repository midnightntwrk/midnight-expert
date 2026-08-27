# Enhancement Flow

Lightweight path for feature requests. Loaded from SKILL.md when `route == "enhancement"`.

## Steps

1. **Re-confirm prose.** Show the prose to the user with one `AskUserQuestion`:

   - **Question**: "File this as an enhancement? Edit if needed."
   - **Options**: `File as-is` (recommended) / `Edit` / `Cancel`

   If the user picks Edit, accept their edits in a follow-up text reply and update the prose.
   If Cancel, abort cleanly (no draft saved).

2. **Compose title.** From the (possibly edited) prose, generate a short title in `<verb> <object>` form, ~80 chars max.

   Examples: `Add Windows install instructions`, `Surface compact CLI version in /doctor output`.

3. **File the issue.** Run:

   ```bash
   gh issue create \
     --repo midnightntwrk/midnight-expert \
     --title "<generated-title>" \
     --body "<final-prose>" \
     --label enhancement \
     --label "<plugin_slug>"
   ```

   The `<plugin_slug>` label comes from Phase 3 inference. If `plugin_label` was `null`, omit the second `--label` argument.

4. **On success.** Capture stdout (the issue URL) and present it to the user:

   *"Filed: <URL>. Thanks for the suggestion."*

5. **On failure.** Save the body to `${CLAUDE_PLUGIN_DATA}/.feedback/drafts/<sessionId>-<UTC-iso8601>.md`. Print:

   - the saved path
   - the rendered body
   - a paste-ready `gh` command using `--body-file <path>`
   - the gh stderr if available

## Notes

- No evidence cards.
- No skill's analysis section.
- No multi-step review.
- Plugin label is settled in Phase 3; do not re-ask here.
