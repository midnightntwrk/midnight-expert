# Compile fails with "command not found" in midnight-tooling

## TL;DR
compact compile invocation fails with command-not-found error; user expected the binary to be on PATH after install.

## Severity (skill's read)
**blocker** — compile invocation never succeeds.

## Repro context
- Plugin: midnight-tooling
- (env values vary at runtime)

## What the user was trying to do
Compile their hello-world contract.

## What the user expected
The compact CLI to compile the contract successfully.

## Evidence
### Bash: `compact compile contracts/hello-world.compact` exited 127
```
bash: compact: command not found
```

## Skill's analysis
**Confidence**: high

The failing tool call shows the `compact` binary is not on PATH (`command not found`), which directly explains the symptom. The user mentions installing the CLI just before; this suggests an install-path or shell-rehash issue. Cited evidence: `Bash: compact compile contracts/hello-world.compact exited 127`.
