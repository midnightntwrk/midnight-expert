#!/usr/bin/env bash
# Sourced helper. Exposes:
#
#   compact_state_file <project_root> <session_id>
#     Echoes the per-session state file path:
#     $HOME/.midnight-expert/state/<hash16>/<session_id>.json, where <hash16>
#     is the first 16 hex chars of sha256(project_root). mkdir -p's the
#     directory. Empty session_id -> prints nothing, returns 0.
#
#   compact_state_init <state_file> <project_root> <session_id>
#     If <state_file> is missing, writes the schema skeleton (schema_version,
#     project_root, session_id, created_at, compact_files, and the empty
#     tracking fields) with compact_files set to the CURRENT sha256 snapshot
#     of every non-excluded *.compact file under project_root. This is the
#     "quiet on doubt" baseline: a hook that finds no state file treats the
#     tree as clean this time rather than flagging from an empty baseline.
#     No-op if the file already exists.
#
#   compact_is_midnight_project <project_root>
#     Returns 0 (true) when project_root looks like Midnight work: a *.compact
#     file within eight directory levels, a package.json within five levels
#     that names an @midnight-ntwrk/* package, or a git remote naming
#     "midnight" (docs and tooling repos). Hidden directories,
#     node_modules and common build/vendor directories are skipped and the
#     search stops at the first hit, so it stays cheap in large non-Midnight
#     trees. Empty or missing project_root, /, or the user's home
#     directory -> 1 (false). The session-wide
#     hooks use it to stay silent outside Midnight projects.
#
#   compact_baseline_resolve <state_file> <project_root>
#     SessionStart outside a Midnight project writes compact_files: null (a
#     deferred baseline) instead of scanning the tree. The first time a check
#     runs, this fills it in: every non-excluded *.compact file last modified
#     before the session's created_at, so contracts that were already there
#     are never flagged and contracts the session writes are. No-op when the
#     baseline is already set or the state file is missing.
#
#   compact_snapshot_files <project_root>
#     Prints the {absolute_path: sha256} JSON object for every non-excluded
#     *.compact file under project_root.
#
#   compact_exclusions <project_root>
#     Prints excluded project-relative paths, one per line, read from
#     <project_root>/.claude/compact-check.json's `.exclude` array. Missing
#     or invalid config file -> prints nothing.
#
#   compact_is_excluded <project_root> <abs_path>
#     Returns 0 (true) if <abs_path>'s project-relative form exactly matches
#     an excluded file entry, or is under an excluded directory entry
#     (trailing `/`). Paths outside project_root are never excluded (returns
#     1/false).
#
#   compact_filter_excluded <project_root>
#     Filter: reads absolute paths on stdin (one per line), prints only the
#     ones that are not excluded.
#
#   compact_transcript_compile_ts <transcript_path> <filename>
#     Prints the latest ISO-8601 timestamp of a Bash `compact compile` /
#     `compactc` tool call naming <filename>, searching both
#     <transcript_path> and its subagent transcripts
#     (<dir>/<session-id>/subagents/*.jsonl, where <session-id> is
#     <transcript_path>'s basename without .jsonl). Missing subagent dir is a
#     no-op. Empty if no match.
#
#   compact_unchecked_files <project_root> <transcript_path> <state_file>
#     Prints every *.compact file under project_root that is (a) not
#     excluded, (b) new or changed since the baseline in <state_file>'s flat
#     `.compact_files`, and (c) not covered by a Bash `compact compile` /
#     `compactc` tool call (containing the file's basename, with timestamp >=
#     the file's mtime) per compact_transcript_compile_ts. One path per line;
#     empty if none. Missing state file -> prints nothing (callers must
#     compact_state_init first).
#
#   compact_block_reason_for_files [extra_text]
#     Reads newline-separated file paths from stdin and prints a
#     {decision:"block",reason:...} JSON object built from them. When
#     <extra_text> is non-empty, it is appended after the standard reason.
#     Always returns 0.
#
#   compact_changed_check <project_root> <transcript> <state_file>
#     Convenience: pipes compact_unchecked_files into
#     compact_block_reason_for_files. Prints a block JSON iff at least one
#     unchecked file exists; otherwise prints nothing. Always returns 0 --
#     callers branch on stdout being empty.
#
# CANONICAL COPY: this file lives in three plugins (compact-core,
# midnight-verify, and midnight-expert) and a CI job
# (.github/workflows/ci-compact-core-hooks.yml) enforces that all three
# copies are byte-identical via sha256sum.

compact_state_file() {
  local project_root="$1"
  local session_id="$2"

  if [ -z "$session_id" ]; then
    return 0
  fi

  local hash dir
  hash=$(printf '%s' "$project_root" | sha256sum | awk '{print $1}' | cut -c1-16)
  dir="$HOME/.midnight-expert/state/$hash"
  mkdir -p "$dir"
  printf '%s/%s.json\n' "$dir" "$session_id"
}

compact_snapshot_files() {
  local project_root="$1"
  local snapshot_json

  snapshot_json=$(
    find "$project_root" -type f -name '*.compact' -print0 2>/dev/null \
      | tr '\0' '\n' \
      | compact_filter_excluded "$project_root" \
      | tr '\n' '\0' \
      | xargs -0 -r sha256sum 2>/dev/null \
      | jq -Rn '
          reduce inputs as $line (
            {};
            ($line | capture("^(?<hash>[a-f0-9]+)\\s+(?<path>.*)$")) as $m
            | . + {($m.path): $m.hash}
          )
        '
  )
  # Not "${snapshot_json:-{\}}": bash 3.2 (macOS /bin/bash) keeps the backslash.
  [ -n "$snapshot_json" ] || snapshot_json='{}'
  printf '%s\n' "$snapshot_json"
}

compact_is_midnight_project() {
  local root="$1" hit f user_home
  [ -n "$root" ] && [ -d "$root" ] || return 1

  # A home directory or / is never a project, even when Midnight projects sit
  # somewhere under it: treating it as one means scanning the whole tree on
  # every Stop. The home directory comes from the user database, not $HOME
  # (the hook tests point $HOME at their temp project).
  local user
  user=$(id -un 2>/dev/null || true)
  if [ -n "$user" ] && command -v getent >/dev/null 2>&1; then
    user_home=$(getent passwd "$user" 2>/dev/null | cut -d: -f6 || true)
  elif [ -n "$user" ] && command -v dscl >/dev/null 2>&1; then
    user_home=$(dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null \
      | awk '{print $2}' || true)
  fi
  case "${root%/}" in
    "") return 1 ;;
  esac
  if [ -n "$user_home" ] && [ "${root%/}" = "${user_home%/}" ]; then
    return 1
  fi

  hit=$(find "$root" -mindepth 1 -maxdepth 8 \
      \( -type d \( -name '.*' -o -name node_modules -o -name target -o -name dist \
          -o -name build -o -name vendor -o -name Library \) -prune \) \
      -o \( -type f -name '*.compact' -print -quit \) 2>/dev/null || true)
  [ -n "$hit" ] && return 0

  while IFS= read -r -d '' f; do
    grep -q '"@midnight-ntwrk/' "$f" 2>/dev/null && return 0
  done < <(find "$root" -mindepth 1 -maxdepth 5 \
      \( -type d \( -name '.*' -o -name node_modules \) -prune \) \
      -o \( -type f -name package.json -print0 \) 2>/dev/null || true)

  if [ -f "$root/.git/config" ] && grep -qi 'url = .*midnight' "$root/.git/config" 2>/dev/null; then
    return 0
  fi

  return 1
}

compact_baseline_resolve() {
  local state_file="$1"
  local project_root="$2"
  local created created_epoch path mtime ts

  [ -f "$state_file" ] || return 0
  [ "$(jq -r '.compact_files == null' "$state_file" 2>/dev/null)" = "true" ] || return 0

  created=$(jq -r '.created_at // empty' "$state_file")
  ts="${created%Z}"; ts="${ts%%.*}"
  created_epoch=$(date -u -d "${ts}Z" "+%s" 2>/dev/null \
               || date -juf "%Y-%m-%dT%H:%M:%S" "$ts" "+%s" 2>/dev/null \
               || echo 0)

  local tmp
  tmp=$(mktemp)
  find "$project_root" -type f -name '*.compact' -print0 2>/dev/null \
    | tr '\0' '\n' \
    | compact_filter_excluded "$project_root" \
    | while IFS= read -r path; do
        mtime=$(stat -c "%Y" "$path" 2>/dev/null || stat -f "%m" "$path" 2>/dev/null || echo 0)
        if [ "$mtime" -lt "$created_epoch" ]; then
          printf '%s\0' "$path"
        fi
      done \
    | xargs -0 -r sha256sum 2>/dev/null \
    | jq -Rn '
        reduce inputs as $line (
          {};
          ($line | capture("^(?<hash>[a-f0-9]+)\\s+(?<path>.*)$")) as $m
          | . + {($m.path): $m.hash}
        )
      ' > "$tmp" || printf '{}' > "$tmp"
  [ -s "$tmp" ] || printf '{}' > "$tmp"

  jq --slurpfile cf "$tmp" '.compact_files = $cf[0]' "$state_file" > "$state_file.tmp" \
    && mv "$state_file.tmp" "$state_file"
  rm -f "$tmp"
}

compact_state_init() {
  local state_file="$1"
  local project_root="$2"
  local session_id="$3"

  if [ -f "$state_file" ]; then
    return 0
  fi

  mkdir -p "$(dirname "$state_file")"

  local compact_files_json created_at
  compact_files_json=$(compact_snapshot_files "$project_root")
  created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # The snapshot goes in on stdin, not as --argjson: one argument is capped
  # at 128 KiB on Linux, and a tree with many contracts goes past that.
  printf '%s' "$compact_files_json" | jq \
    --arg root "$project_root" \
    --arg sid "$session_id" \
    --arg created "$created_at" \
    '{
      schema_version: 1,
      project_root: $root,
      session_id: $sid,
      created_at: $created,
      compact_files: .,
      triggers_since_last_block: 0,
      last_block_timestamp: null,
      flag_events: [],
      on_next_user_prompt: [],
      unchecked_from_previous_session: []
    }' > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
}

compact_exclusions() {
  local project_root="$1"
  local config="$project_root/.claude/compact-check.json"

  [ -f "$config" ] || return 0

  jq -r '(.exclude // [])[]?' "$config" 2>/dev/null || true
  return 0
}

compact_is_excluded() {
  local project_root="$1"
  local abs_path="$2"
  local root="${project_root%/}"
  local rel

  case "$abs_path" in
    "$root"/*)
      rel="${abs_path#"$root"/}"
      ;;
    *)
      return 1
      ;;
  esac

  # A here-string, not < <(compact_exclusions ...): callers run this once per
  # file, and a process substitution per call drops results under bash 3.2
  # (macOS /bin/bash) after about 250 calls.
  local entry exclusions
  exclusions=$(compact_exclusions "$project_root")
  [ -n "$exclusions" ] || return 1
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    if [ "$entry" = "$rel" ]; then
      return 0
    fi
    case "$entry" in
      */)
        case "$rel" in
          "$entry"*) return 0 ;;
        esac
        ;;
    esac
  done <<< "$exclusions"

  return 1
}

compact_filter_excluded() {
  local project_root="$1"
  local root="${project_root%/}"
  local path rel entry excluded
  local -a entries=()

  # Read the exclusions once. Calling compact_is_excluded per path opens a
  # process substitution per path, and under bash 3.2 (macOS /bin/bash) that
  # intermittently drops paths after about 250 of them.
  while IFS= read -r entry; do
    [ -n "$entry" ] && entries+=("$entry")
  done < <(compact_exclusions "$project_root")

  while IFS= read -r path; do
    [ -z "$path" ] && continue
    excluded=false
    case "$path" in
      "$root"/*)
        rel="${path#"$root"/}"
        for entry in "${entries[@]+"${entries[@]}"}"; do
          if [ "$entry" = "$rel" ]; then
            excluded=true; break
          fi
          case "$entry" in
            */) case "$rel" in "$entry"*) excluded=true; break ;; esac ;;
          esac
        done
        ;;
    esac
    [ "$excluded" = true ] || printf '%s\n' "$path"
  done
}

compact_transcript_compile_ts() {
  local transcript_path="$1"
  local filename="$2"

  [ -f "$transcript_path" ] || return 0

  local dir sid subagent_dir filter
  dir=$(dirname "$transcript_path")
  sid=$(basename "$transcript_path" .jsonl)
  subagent_dir="$dir/$sid/subagents"

  filter='
    select((.message.content // []) | type == "array")
    | select(any(.message.content[]?;
        .type? == "tool_use"
        and .name? == "Bash"
        and ((.input.command? // "") | test("compact[[:space:]]+compile|compactc"))
        and ((.input.command? // "") | contains($fn))
      ))
    | .timestamp // empty
  '

  {
    jq -r --arg fn "$filename" "$filter" "$transcript_path" 2>/dev/null

    if [ -d "$subagent_dir" ]; then
      local f
      for f in "$subagent_dir"/*.jsonl; do
        [ -e "$f" ] || continue
        jq -r --arg fn "$filename" "$filter" "$f" 2>/dev/null
      done
    fi
  } | sort | tail -1
}

compact_unchecked_files() {
  local project_root="$1"
  local transcript_path="$2"
  local state_file="$3"

  if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
    return 0
  fi
  if [ -z "$project_root" ] || [ ! -d "$project_root" ]; then
    return 0
  fi
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  compact_baseline_resolve "$state_file" "$project_root"

  local file current_hash stored_hash filename file_mtime latest_compile_ts compile_epoch ts

  while IFS= read -r -d '' file; do
    if compact_is_excluded "$project_root" "$file"; then
      continue
    fi

    current_hash=$(sha256sum "$file" | awk '{print $1}')
    stored_hash=$(jq -r --arg f "$file" '.compact_files[$f] // empty' "$state_file")

    if [ -n "$stored_hash" ] && [ "$current_hash" = "$stored_hash" ]; then
      continue
    fi

    filename=$(basename "$file")
    file_mtime=$(stat -c "%Y" "$file" 2>/dev/null \
              || stat -f "%m" "$file" 2>/dev/null \
              || echo 0)

    latest_compile_ts=$(compact_transcript_compile_ts "$transcript_path" "$filename")

    if [ -n "$latest_compile_ts" ]; then
      ts="${latest_compile_ts%Z}"
      ts="${ts%%.*}"
      # $ts is a UTC wall-clock time with the trailing 'Z' and any
      # fractional seconds stripped. Parse it back as UTC on both GNU
      # (re-append Z) and BSD/macOS (-u forces UTC interpretation); never
      # let the timestamp be reinterpreted in the host's local timezone.
      compile_epoch=$(date -u -d "${ts}Z" "+%s" 2>/dev/null \
                   || date -juf "%Y-%m-%dT%H:%M:%S" "$ts" "+%s" 2>/dev/null \
                   || echo 0)
      if [ "$compile_epoch" -ge "$file_mtime" ]; then
        continue
      fi
    fi

    printf '%s\n' "$file"
  done < <(find "$project_root" -type f -name '*.compact' -print0 2>/dev/null)
}

compact_block_reason_for_files() {
  local extra_text="${1:-}"
  local list="" f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    list+="- ${f}"$'\n'
  done

  if [ -z "$list" ]; then
    return 0
  fi

  local reason="The following Compact contracts were created or modified in this session but were not compiled (no \`compact compile\` or \`compactc\` invocation including the file name was found in the transcript after the file's last modification):

${list}
Run /verify on these contracts -- or invoke \`compact compile\` / \`compactc\` against them -- before finishing. This is a reminder; you decide whether verification is needed here."

  if [ -n "$extra_text" ]; then
    reason="${reason}"$'\n\n'"${extra_text}"
  fi

  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
}

compact_changed_check() {
  local files
  files=$(compact_unchecked_files "$1" "$2" "$3")

  if [ -z "$files" ]; then
    return 0
  fi

  printf '%s\n' "$files" | compact_block_reason_for_files
  return 0
}
