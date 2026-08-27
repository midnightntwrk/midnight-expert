# midnight-expert

<p align="center">
  <img src="assets/mascot.png" alt="midnight-expert mascot" width="200" />
</p>

Meta-plugin for the midnight-expert marketplace. Provides comprehensive diagnostics and health reporting for the entire midnight-expert ecosystem -- plugin installation, MCP server connectivity, external CLI tools, cross-plugin references, and NPM registry access.

## Skills

### midnight-expert:doctor

Runs comprehensive diagnostics across the midnight-expert ecosystem. Launches five parallel diagnostic agents (plugin health, MCP servers, external tools, cross-plugin references, NPM registry) and produces a consolidated health report with actionable fixes. Supports `--auto-fix` mode to silently install missing dependencies. The skill directory contains diagnostic scripts that are executed by the sub-agents.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [fix-table.md](skills/doctor/references/fix-table.md) | Maps diagnostic output to actionable fixes, including auto-fix classification for silent vs prompted resolution | When interpreting doctor results and determining how to resolve detected issues |

### midnight-expert:add-to-ecosystem

Walks the user's current project through the four Electric Capital eligibility requirements (on GitHub, public, `midnightntwrk` topic, optional `compact` topic), inserts the canonical Midnight attribution sentence into `README.md`, commits, pushes, and opens a PR.

### midnight-expert:feedback

Routes a user's feedback to a GitHub issue or enhancement on `midnightntwrk/midnight-expert`. The user types one paragraph; the skill silently scans the session transcript and environment, applies heavy redaction, and composes a maintainer-ready issue body.

## Hooks

### UserPromptSubmit

On every user prompt, drains the `on_next_user_prompt` array in the CURRENT session's own per-session state file (`~/.midnight-expert/state/<hash16>/<session-id>.json`, `<hash16>` = first 16 hex chars of `sha256(project_root)`) and surfaces its formatted contents as additional context for that turn. Each entry is an object with a `type` discriminator; the hook formats known types and silently skips unknown ones (forward-compat). A sibling session's state file is never touched.

Currently consumed: `compact-not-compiled` entries written by the `compact-core` Stop hook when it detected unchecked Compact contracts but couldn't block (Stop reattempt, or cooldown still active). Each entry's file list is re-filtered through the project's `.claude/compact-check.json` exclusion config before being surfaced (config may have changed since the entry was queued); an entry left with no files is dropped silently. If the entry carries an `escalation` field (set once the session has flagged uncompiled contracts 2+ times in 30 minutes), that text -- pointing at `compact-core`'s `compact-check-reset.sh` and `compact-check-exclude.sh` scripts -- is appended to the message. The format names the contract paths and asks the agent to compile / verify them before treating any related claim as confirmed.

This hook sources `scripts/hooks/_compact-check.sh`, one of three byte-identical copies of this shared helper (the other two live in `compact-core` and `midnight-verify`; CI enforces byte-identity across all three). It always exits 0 and never blocks prompt submission.
