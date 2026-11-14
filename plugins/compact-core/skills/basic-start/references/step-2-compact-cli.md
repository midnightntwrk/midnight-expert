> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 2: Compact CLI

### What this verifies

The Compact compiler and CLI tools are installed and set to the latest version.

### Procedure

1. Check the compiler version:

```bash
compact check
```

Should report the version and "Up to date". If `compact` is not found, install it with `/midnight-tooling:install-cli`.

2. Check the CLI tools version:

```bash
compact self check
```

Should report the CLI version and "Up to date".

3. Set the default compiler to the latest supported version:

```bash
compact update 0.31.1
```

Confirms the default compiler version is set.

### Expected output

Both commands report up-to-date versions. `compact update` confirms the default is set to the supported compiler.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
