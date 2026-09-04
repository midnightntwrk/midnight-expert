# Project Initialization Troubleshooting

Common failures when creating a new Midnight project and how to resolve them.

## Scaffolding Failures

### `npx create-mn-app` fails or hangs

**Symptoms:** Command not found, network errors, npm cache issues.

**Fixes:**
1. Verify Node.js version: `node --version` (must be 22+)
2. Clear npm cache: `npm cache clean --force`
3. Try with explicit registry: `npx --registry https://registry.npmjs.org create-mn-app@latest <name>`
4. If behind a proxy, configure npm: `npm config set proxy <url>`

### Directory already exists

**Symptom:** `create-mn-app` prompts about existing directory.

**Fix:** Choose a different project name, or approve the overwrite prompt. To remove manually: `rm -rf <project-name>` then retry.

## Compilation Failures

### `pragma language_version` error

**Symptom:** Compiler rejects the pragma directive.

**Fixes:**
1. Update compiler: `compact update`
2. Verify the pragma in the `.compact` file matches a supported version
3. The hello-world template uses `pragma language_version >= 0.22;` which is compatible with all recent compilers

### ZK parameter download stalls or fails

**Symptom:** First compilation hangs at "downloading ZK parameters" or fails with timeout.

**Fixes:**
1. First compilation downloads ~500MB of ZK parameters — this is normal and takes several minutes
2. Ensure stable internet connection
3. If Docker resources are limited, increase Docker Desktop memory to 4+ GB
4. Retry the compilation — partial downloads are cached

### Compilation succeeds but managed directory is empty

**Symptom:** `contracts/managed/hello-world/` exists but is missing expected subdirectories.

**Fixes:**
1. Check compiler output for warnings or errors
2. Run compilation with verbose output: `compact compile --trace-passes <source> <target>`
3. Ensure the target directory path is correct
4. Clean and retry: `rm -rf contracts/managed && npm run compile`

## Proof Server Failures

### Docker not running

**Symptom:** `/midnight-tooling:devnet start` fails with Docker errors.

**Fixes:**
1. Start Docker Desktop
2. On Linux: `sudo systemctl start docker`
3. Verify: `docker info`
4. Run `/midnight-tooling:doctor` for detailed diagnostics

### Port 6300 already in use

**Symptom:** Proof server fails to start with "port already allocated" error.

**Fixes:**
1. Find what's using the port: `lsof -i :6300` (macOS/Linux) or `ss -tlnp | grep 6300` (Linux)
2. Stop the conflicting process or container
3. If it's an old proof server container: `docker stop midnight-proof-server && docker rm midnight-proof-server`
4. Retry starting the proof server

### Container exits immediately

**Symptom:** Proof server container starts then stops within seconds.

**Fixes:**
1. Check logs: `docker logs midnight-proof-server`
2. Increase Docker memory allocation to 4–8 GB (Docker Desktop → Settings → Resources)
3. The proof server needs at least 4 GB RAM
4. Check for OOM kill: `docker inspect midnight-proof-server --format='{{.State.OOMKilled}}'`

### Health check fails

**Symptom:** Container is running but `curl http://localhost:6300/health` fails.

**Fixes:**
1. Wait 30–60 seconds — the proof server takes time to initialize
2. Check if the container is still starting: `docker logs -f midnight-proof-server`
3. The `/ready` endpoint returns HTTP 503 while loading ZK parameters
4. Monitor readiness: `curl http://localhost:6300/ready`

## Custom Registry Configuration

### LLM suggests adding custom registry config

**Symptom:** Custom registry configuration (`.npmrc`, `.yarnrc.yml`, scoped registry settings) is suggested for `@midnight-ntwrk` packages.

**Fix:** All `@midnight-ntwrk/*` packages are published on the **public npm registry** — no custom registry configuration is needed. The `.yarnrc.yml` files found in Midnight SDK source repositories are for SDK contributors, not consumers.

1. Remove any custom registry configuration for the `@midnight-ntwrk` scope
2. Verify package availability: `npm view @midnight-ntwrk/compact-runtime versions`
3. Install packages normally: `npm install @midnight-ntwrk/compact-runtime`

## Cross-References

For deeper troubleshooting beyond project initialization:
- Run `/midnight-tooling:doctor` for comprehensive environment diagnostics
- Consult the `midnight-tooling:troubleshooting` skill for error-specific guidance
- Consult the `midnight-tooling:compact-cli` skill for CLI-specific issues
- Consult the `midnight-tooling:proof-server` skill for Docker and proof server issues
