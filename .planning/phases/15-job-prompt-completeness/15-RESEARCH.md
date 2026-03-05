# Phase 15: Job Prompt Completeness - Research

**Researched:** 2026-03-04
**Domain:** Job prompt construction for autonomous instance scaffolding via Claude Code CLI
**Confidence:** HIGH

## Summary

Phase 15 replaces the minimal stub in `createInstanceJobTool` (lines 143-185 of `lib/ai/tools.js`) with a `buildInstanceJobDescription(config)` function that produces a comprehensive prompt. This prompt must cause the Claude Code container agent to generate all 6 instance files plus update `docker-compose.yml` -- 7 artifacts total -- with semantically correct, purpose-scoped content.

The core challenge is **prompt engineering for autonomous file generation**: the job prompt is the only instruction the container agent receives. Every file it must produce, every validation it must perform, and every constraint it must respect must be encoded in that prompt. The existing two instances (`noah` and `strategyES`) provide complete reference patterns for what "correct" output looks like. The key risk is that the LLM deviates from exact formats (especially AGENT.md tool casing and REPOS.json schema), producing files that look correct but silently break at runtime.

**Primary recommendation:** Embed literal file templates in the job prompt with clearly marked substitution points. Do not ask the LLM to "write something similar to noah" -- give it the exact content with `{{placeholders}}` for instance-specific values, and provide the filled values in a JSON config block at the top of the prompt.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCAF-01 | Job generates all 6 instance files under `instances/{name}/`: Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, REPOS.json, .env.example | File inventory and templates documented in "Complete Instance Directory" section; exact file structure derived from noah and strategyES instances |
| SCAF-02 | Job updates `docker-compose.yml` with a new service block (comment-preserving) | Docker-compose service block pattern documented; comment-preservation strategy via yaml package or targeted string insertion |
| SCAF-03 | Generated SOUL.md and AGENT.md reflect the operator's stated instance purpose -- not generic boilerplate | Role split between SOUL.md (identity/persona) and AGENT.md (environment/tools) documented; substitution points identified |
| SCAF-04 | Generated REPOS.json and EVENT_HANDLER.md are scoped to gathered allowed repos and enabled channels | REPOS.json schema and EVENT_HANDLER.md scoping patterns documented from noah vs strategyES comparison |
</phase_requirements>

## Architecture Patterns

### What `buildInstanceJobDescription(config)` Must Produce

The function receives a validated config object (from the `createInstanceJobTool` Zod schema, already defined in Phase 13) and returns a string that becomes `job.md`. This string is the complete prompt for the Claude Code container agent.

The prompt structure should be:

```
1. JSON Config Block (machine-readable, verbatim values)
2. File Manifest (list of all 7 artifacts to produce)
3. Literal Templates (exact file content with {{placeholders}})
4. Substitution Rules (which values from JSON map to which placeholders)
5. docker-compose.yml Modification Instructions
6. Validation Checklist (post-generation self-checks)
```

### Complete Instance Directory Structure

Every instance directory has this exact structure:

```
instances/{name}/
  Dockerfile                    # Event handler Docker image
  .env.example                  # Environment variable template (no real secrets)
  config/
    SOUL.md                     # Persona identity (name, owner, style)
    AGENT.md                    # Container agent instructions (tools, GSD, working dir)
    EVENT_HANDLER.md            # Conversational layer instructions (channels, repos, job flow)
    REPOS.json                  # Allowed repository targets
```

Plus the 7th artifact: a new service block appended to `docker-compose.yml` at the project root.

### Pattern Analysis: Noah vs StrategyES

| Aspect | Noah | StrategyES | What Varies |
|--------|------|-----------|-------------|
| **Dockerfile** | Identical structure | Identical structure | Only the `COPY instances/{name}/config/` paths differ |
| **SOUL.md** | "Archie" persona, broad scope | "Epic" persona, restricted scope | Name, owner, scope description, communication style, restrictions |
| **AGENT.md** | Generic ClawForge agent env | Adds scope restriction + tech stack | Scope section, optional tech stack section; core tools/GSD sections identical |
| **EVENT_HANDLER.md** | All channels, all repos, full GSD | Slack/Web only, single repo, scope restrictions | Available repos section, scope restrictions, channel list, examples |
| **REPOS.json** | 2 repos (clawforge, neurostory) | 1 repo (strategyes-lab) | Repo entries only |
| **.env.example** | All channel vars | Slack only (no Telegram) | Channel-specific env vars present/absent |
| **docker-compose service** | `noah-event-handler`, `noah-net` | `ses-event-handler`, `strategyES-net` | Service name, container name, network name, volume names, env var prefix, hostname |

### What Stays Constant (Boilerplate)

These sections are identical across all instances and should be provided as literal templates:

1. **Dockerfile**: Entire file is boilerplate except for the 4 `COPY instances/{name}/config/` lines
2. **AGENT.md**: The "Available Tools", "GSD Skills", "GSD Usage", "Temporary Files", "Git" sections are identical. Only "What You Are", "Scope", "Working Directory", and optional "Tech Stack" sections vary
3. **EVENT_HANDLER.md**: The "GSD Workflow" reference table, "Job Description Best Practices", "Job Creation Flow", "Credential Setup", "Checking Job Status" sections are shared boilerplate. The "Your Role", "Scope Restrictions", "Available Repositories", "Conversational Guidance", "Examples" sections are instance-specific

### What Must Be Purpose-Scoped (SCAF-03)

**SOUL.md** must reflect:
- Instance persona name (from config or derived from purpose)
- Owner/operator description
- Scope of capabilities (broad vs restricted)
- Communication style (derived from purpose)
- Explicit restrictions (what this instance cannot do)

**AGENT.md** must reflect:
- Which repo(s) are cloned at `/job`
- Scope restrictions matching SOUL.md
- Optional tech stack section (if purpose implies a known stack)

### Exact `--allowedTools` List

From `entrypoint.sh` line 215:
```
ALLOWED_TOOLS="${CLAUDE_ALLOWED_TOOLS:-Read,Write,Edit,Bash,Glob,Grep,Task,Skill}"
```

The exact casing is: `Read,Write,Edit,Bash,Glob,Grep,Task,Skill`

This must appear in every generated AGENT.md exactly as written. The AGENT.md does not literally set `--allowedTools` (the entrypoint does), but it documents the available tools for the system prompt. The tool names in AGENT.md must match this exact casing so that the system prompt is consistent with the CLI flag.

### REPOS.json Schema

Exact schema from existing instances:

```json
{
  "repos": [
    {
      "owner": "ScalingEngine",
      "slug": "strategyes-lab",
      "name": "StrategyES Lab",
      "aliases": ["strategyes-lab", "strategyes", "lab"]
    }
  ]
}
```

Required fields: `owner` (exact GitHub org/user slug), `slug` (exact repo name), `name` (display name), `aliases` (array of strings for fuzzy matching in conversation).

The `buildInstanceJobDescription` function must map the `allowed_repos` array (repo slugs from intake) into this schema. The `owner` defaults to `ScalingEngine` (the org all current repos live under). The `name` and `aliases` should be derived from the slug.

### .env.example Structure

The env file is channel-conditional. Base vars always present:

```
APP_URL=https://{name}.scalingengine.com
APP_HOSTNAME={name}.scalingengine.com
AUTH_SECRET=

GH_TOKEN=
GH_OWNER=ScalingEngine
GH_REPO={primary_repo_slug}
GH_WEBHOOK_SECRET=

LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=
```

Channel-conditional vars:
- **Slack**: `SLACK_BOT_TOKEN=`, `SLACK_SIGNING_SECRET=`, `SLACK_ALLOWED_USERS=`, `SLACK_ALLOWED_CHANNELS=`, `SLACK_REQUIRE_MENTION=true`
- **Telegram**: `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_WEBHOOK_SECRET=`, `TELEGRAM_CHAT_ID=`
- **Web**: `AUTH_TRUST_HOST=true`
- **OpenAI** (always include if Slack enabled): `OPENAI_API_KEY=` (for Whisper transcription)

### docker-compose.yml Service Block Pattern

Each instance service block follows this pattern:

```yaml
  {prefix}-event-handler:
    container_name: clawforge-{prefix}
    build:
      context: .
      dockerfile: instances/{name}/Dockerfile
    networks:
      - {name}-net
      - proxy-net
    environment:
      APP_URL: ${PREFIX_APP_URL}
      APP_HOSTNAME: ${PREFIX_APP_HOSTNAME}
      AUTH_SECRET: ${PREFIX_AUTH_SECRET}
      AUTH_TRUST_HOST: "true"
      GH_TOKEN: ${PREFIX_GH_TOKEN}
      GH_OWNER: ${PREFIX_GH_OWNER}
      GH_REPO: ${PREFIX_GH_REPO}
      GH_WEBHOOK_SECRET: ${PREFIX_GH_WEBHOOK_SECRET}
      LLM_PROVIDER: ${PREFIX_LLM_PROVIDER:-anthropic}
      LLM_MODEL: ${PREFIX_LLM_MODEL:-claude-sonnet-4-6}
      ANTHROPIC_API_KEY: ${PREFIX_ANTHROPIC_API_KEY}
      # ... channel-specific vars ...
    volumes:
      - {prefix}-data:/app/data
      - {prefix}-config:/app/config
    labels:
      - traefik.enable=true
      - traefik.http.routers.{prefix}.rule=Host(`${PREFIX_APP_HOSTNAME}`)
      - traefik.http.routers.{prefix}.entrypoints=websecure
      - traefik.http.routers.{prefix}.tls.certresolver=letsencrypt
      - traefik.http.services.{prefix}.loadbalancer.server.port=80
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/api/ping"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

Where `{prefix}` is a short identifier (e.g., `noah` or `ses`) and `{name}` is the instance directory name. The env var prefix convention is `PREFIX_` (uppercase, e.g., `NOAH_`, `SES_`).

Additionally required:
- New network: `{name}-net` in the `networks:` section
- New volumes: `{prefix}-data` and `{prefix}-config` in the `volumes:` section
- Traefik service must add the new network to its `networks:` list

### Comment-Preserving YAML Modification (SCAF-02)

The existing `docker-compose.yml` has a commented `LETSENCRYPT_EMAIL` line and section separator comments. The job prompt must instruct the container agent to:

1. Read the existing `docker-compose.yml`
2. Append the new service block at the end of the `services:` section
3. Append the new network at the end of the `networks:` section
4. Append the new volumes at the end of the `volumes:` section
5. Add the new network to the `traefik` service's `networks:` list
6. Preserve all existing comments (the `# ---` separators, the `# Uncomment` notes)

The safest approach is to instruct Claude Code to use string manipulation (find the insertion points by pattern matching) rather than parse/rewrite YAML, since YAML parsers strip comments. Alternatively, use the `yaml` npm package with `yaml.parseDocument()` which preserves comments -- but this would need to be available in the job container (it's already a project dependency).

**Recommendation:** Instruct the container agent to use the Edit tool for targeted insertions at specific locations in docker-compose.yml, rather than full-file rewrite. This naturally preserves comments.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML comment preservation | Custom YAML parser/serializer | Edit tool targeted insertions | YAML parsers strip comments; Edit preserves surrounding content |
| Instance name derivation | Custom slug generation | Use the `name` field from intake verbatim (already validated by Zod) | Validation already done at tool schema level (`^[a-z][a-z0-9-]*$`) |
| Env var prefix derivation | Complex naming algorithm | Uppercase the instance name or use a short alias | Keep it simple: `name.toUpperCase().replace(/-/g, '_')` + `_` suffix |
| Template rendering | Custom template engine | String concatenation with `.replace()` | Only a few `{{placeholders}}` per template; no loops or conditionals needed |

## Common Pitfalls

### Pitfall 1: LLM Deviates From Exact Tool Name Casing in AGENT.md
**What goes wrong:** If the generated AGENT.md uses `read` instead of `Read`, Claude Code jobs from this instance run with no tools and produce empty output.
**Why it happens:** The LLM generating AGENT.md may normalize tool names to lowercase.
**How to avoid:** Provide the exact AGENT.md content as a literal template in the job prompt. Mark the tools section as "DO NOT MODIFY -- use verbatim."
**Warning signs:** Jobs from the new instance have 0 GSD invocations and no file changes.

### Pitfall 2: SOUL.md Contains Shell-Unsafe Characters
**What goes wrong:** The entrypoint uses `echo -e "$SYSTEM_PROMPT"` which expands `$VAR` patterns and backticks in SOUL.md content.
**Why it happens:** The LLM writes natural prose that may include `$` or backtick characters.
**How to avoid:** Include explicit constraint in the prompt: "SOUL.md must not contain `$` characters or backticks outside of fenced code blocks."
**Warning signs:** System prompt for the new instance contains literal environment variable values instead of persona text.

### Pitfall 3: REPOS.json Has Wrong Owner Format
**What goes wrong:** The `owner` field must be the exact GitHub org slug (e.g., `ScalingEngine`). If it uses a display name or different casing, `gh api` calls fail silently.
**How to avoid:** Provide the exact `owner` value in the JSON config block. Do not let the LLM infer it.
**Warning signs:** Jobs dispatched from the new instance fail at the clone step.

### Pitfall 4: docker-compose.yml Modification Breaks Existing Services
**What goes wrong:** Full-file YAML rewrite strips comments or reorders keys, breaking the traefik config or existing services.
**How to avoid:** Use targeted Edit insertions, not full-file Write. Instruct the agent to validate with a mental check of the diff before committing.
**Warning signs:** Existing services (noah, strategyES) fail to start after the PR is merged.

### Pitfall 5: Generated EVENT_HANDLER.md Includes Channels Not Enabled
**What goes wrong:** If an instance has only Slack enabled but EVENT_HANDLER.md mentions Telegram capabilities, the operator is confused and may try to use a channel that doesn't work.
**How to avoid:** The prompt must condition EVENT_HANDLER.md sections on the `enabled_channels` array from config.
**Warning signs:** EVENT_HANDLER.md says "Users interact with you from Slack, Telegram, or Web Chat" when only Slack is enabled.

### Pitfall 6: Env Var Prefix Collision
**What goes wrong:** If two instances derive the same env var prefix (e.g., both use `APP_`), the root `.env` file has conflicting variable names.
**How to avoid:** The prefix must be unique per instance. Derive it deterministically from the instance name and document it in the PR.
**Warning signs:** `docker compose config` shows environment variable substitution warnings.

## Code Examples

### buildInstanceJobDescription Function Signature

```javascript
// Source: derived from lib/ai/tools.js createInstanceJobTool schema (lines 143-185)

/**
 * Build a comprehensive job description for instance scaffolding.
 * @param {Object} config - Validated instance configuration
 * @param {string} config.name - Instance slug (lowercase, no spaces)
 * @param {string} config.purpose - What this instance is for
 * @param {string[]} config.allowed_repos - GitHub repo slugs
 * @param {string[]} config.enabled_channels - ['slack', 'telegram', 'web']
 * @param {string[]} [config.slack_user_ids] - Optional Slack user IDs
 * @param {string} [config.telegram_chat_id] - Optional Telegram chat ID
 * @returns {string} Complete job prompt for Claude Code container
 */
export function buildInstanceJobDescription(config) {
  // 1. Build JSON config block
  // 2. Build file manifest
  // 3. Assemble literal templates with substitution markers
  // 4. Add docker-compose modification instructions
  // 5. Add validation checklist
  return prompt;
}
```

### JSON Config Block Format (Top of job.md)

```markdown
## Instance Configuration

```json
{
  "name": "jim",
  "purpose": "StrategyES dev agent scoped to Jim's workspace",
  "owner": "ScalingEngine",
  "allowed_repos": [
    {
      "owner": "ScalingEngine",
      "slug": "strategyes-lab",
      "name": "StrategyES Lab",
      "aliases": ["strategyes-lab", "strategyes", "lab"]
    }
  ],
  "enabled_channels": ["slack"],
  "env_prefix": "JIM",
  "slack_user_ids": ["U0ABC123"],
  "telegram_chat_id": null
}
```

### Dockerfile Template (Literal)

```dockerfile
# ClawForge Event Handler -- {{NAME}} Instance
# Build context is repo root (.), so all paths are relative to that.

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y curl git python3 make g++ && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*
RUN npm install -g pm2

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY lib/ ./lib/
COPY api/ ./api/
COPY drizzle/ ./drizzle/
COPY drizzle.config.js ./

COPY templates/app/ ./app/
COPY templates/next.config.mjs ./
COPY templates/postcss.config.mjs ./
COPY templates/instrumentation.js ./
COPY templates/middleware.js ./

COPY config/ ./config/

# Instance-specific config
COPY instances/{{name}}/config/SOUL.md ./config/SOUL.md
COPY instances/{{name}}/config/EVENT_HANDLER.md ./config/EVENT_HANDLER.md
COPY instances/{{name}}/config/AGENT.md ./config/AGENT.md
COPY instances/{{name}}/config/REPOS.json ./config/REPOS.json

RUN npm run build

ENV AUTH_SECRET=build-placeholder
RUN npx next build

RUN npm prune --omit=dev

COPY templates/docker/event-handler/ecosystem.config.cjs /opt/ecosystem.config.cjs

EXPOSE 80
CMD ["pm2-runtime", "/opt/ecosystem.config.cjs"]
```

The only substitution is `{{name}}` in 4 COPY lines.

### AGENT.md Template (Verbatim Core -- DO NOT MODIFY)

The tools section, GSD section, and working directory section must be provided verbatim. Only these sections should be customized:
- "What You Are" paragraph (instance name, scope)
- Optional "Scope" section (for restricted instances)
- Optional "Tech Stack" section (if purpose implies a known stack)

### docker-compose.yml Insertion Strategy

The prompt should instruct the container agent to make 4 targeted edits:

1. **Add network to traefik service**: Insert `- {name}-net` into traefik's `networks:` list
2. **Add service block**: Insert new service block after the last existing service (before `volumes:`)
3. **Add network definition**: Insert `{name}-net: driver: bridge` into `networks:` section
4. **Add volume definitions**: Insert `{prefix}-data:` and `{prefix}-config:` into `volumes:` section

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Free-text job description (current stub) | JSON config block + literal templates | Eliminates semantic ambiguity; container agent uses exact values |
| "Write something similar to noah" | Literal template with marked substitution points | Prevents tool name casing errors and format drift |
| Full YAML rewrite for docker-compose | Targeted Edit insertions | Preserves comments and existing formatting |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (already used in project) |
| Config file | None (test scripts in package.json) |
| Quick run command | `node --test tests/test-instance-job.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAF-01 | buildInstanceJobDescription produces prompt mentioning all 6 files | unit | `node --test tests/test-instance-job.js` | No -- Wave 0 |
| SCAF-02 | Prompt includes docker-compose modification instructions | unit | `node --test tests/test-instance-job.js` | No -- Wave 0 |
| SCAF-03 | SOUL.md template section contains purpose-derived content | unit | `node --test tests/test-instance-job.js` | No -- Wave 0 |
| SCAF-04 | REPOS.json and EVENT_HANDLER.md sections are scoped to config | unit | `node --test tests/test-instance-job.js` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/test-instance-job.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test-instance-job.js` -- unit tests for `buildInstanceJobDescription()` output
- [ ] Verify function exports correctly from new module

## Open Questions

1. **Env var prefix derivation strategy**
   - What we know: Noah uses `NOAH_`, StrategyES uses `SES_` (not `STRATEGYES_`)
   - What's unclear: Should the prefix always be the uppercase instance name, or should it support a custom short prefix?
   - Recommendation: Default to `name.toUpperCase().replace(/-/g, '_')` but the function could accept an optional `env_prefix` override. For Phase 15, keep it simple -- derive from name.

2. **How much EVENT_HANDLER.md to embed as template vs generate**
   - What we know: EVENT_HANDLER.md is the longest file (13-18KB). Noah's has 370 lines; strategyES has 260 lines.
   - What's unclear: Whether the prompt should embed the full EVENT_HANDLER.md template or a skeleton with instructions to fill in.
   - Recommendation: Embed the full template with clear substitution markers. The boilerplate sections (GSD reference, job creation flow, credential setup) are identical and should be copied verbatim. The purpose-scoped sections (role, scope, repos, examples) should have `{{placeholder}}` markers with the values provided in the JSON config block. This is the safest approach to avoid the LLM inventing incorrect content.

3. **docker-compose service name vs instance name**
   - What we know: Noah uses `noah-event-handler` (name = prefix). StrategyES uses `ses-event-handler` (prefix != name).
   - What's unclear: Should the function auto-derive a short prefix, or always use the full instance name?
   - Recommendation: Use the instance name as both the service prefix and env var prefix for simplicity. If the name is long (e.g., `acme-marketing`), the service name `acme-marketing-event-handler` is verbose but unambiguous.

## Sources

### Primary (HIGH confidence)
- `instances/noah/` -- Complete reference instance: Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, REPOS.json, .env.example
- `instances/strategyES/` -- Second reference instance with scoped restrictions
- `docker-compose.yml` -- Service block structure, network/volume naming, env var convention
- `templates/docker/job/entrypoint.sh` -- `--allowedTools` exact list (line 215), system prompt construction (lines 138-156)
- `lib/ai/tools.js` -- Current `createInstanceJobTool` stub (lines 143-185), Zod schema
- `lib/tools/create-job.js` -- How `createJob()` writes `job.md` to GitHub
- `.planning/research/PITFALLS.md` -- Comprehensive pitfall analysis for instance generation

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` -- Architectural decisions from prior research phases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all patterns derived from existing production code
- Architecture: HIGH -- direct comparison of two working instances reveals exact patterns
- Pitfalls: HIGH -- prior research (PITFALLS.md) already catalogued critical issues; confirmed against actual code

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- instance structure unlikely to change)
