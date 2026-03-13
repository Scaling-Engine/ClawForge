# Phase 38: Developer Experience - Research

**Researched:** 2026-03-13
**Domain:** CLI tooling, interactive setup, LangGraph tool integration
**Confidence:** HIGH

## Summary

Phase 38 has three requirements, but analysis reveals that two of them (DX-01 and parts of DX-02) are already substantially implemented. The setup wizard (`setup/setup.mjs`) is a fully-featured 7-step interactive wizard using `@clack/prompts`, and `bin/cli.js` already has 9 commands. The remaining work is: (1) adding 3 new CLI commands to `bin/cli.js` (create-instance, run-job, check-status), and (2) creating a new `lib/ai/web-search.js` LangGraph tool that wraps the Brave Search API.

The Brave Search integration has a clear reference implementation in `templates/pi-skills/brave-search/search.js` (a CLI script used by Pi agent skills), but DX-03 requires a LangGraph `tool()` wrapper that the event handler agent can call directly -- not a CLI script. The existing code in `lib/ai/tools.js` shows the exact pattern for registering new tools.

**Primary recommendation:** Focus implementation on the 3 new CLI commands and the `web_search` LangGraph tool. The setup wizard is complete as-is.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DX-01 | `bin/setup` interactive wizard for first-time setup | ALREADY COMPLETE -- `setup/setup.mjs` is a full 7-step wizard (prereqs, PAT, API keys, app URL, sync, build, summary). No work needed. |
| DX-02 | `bin/cli.js` CLI commands for common operations | PARTIALLY COMPLETE -- 9 commands exist (init, setup, setup-telegram, reset-auth, reset, diff, set-agent-secret, set-agent-llm-secret, set-var). Need 3 new: create-instance, run-job, check-status. |
| DX-03 | `web_search` LangGraph tool queries Brave Search API | NEW -- `lib/ai/web-search.js` does not exist. Reference implementation at `templates/pi-skills/brave-search/search.js`. Need LangGraph tool wrapper + agent registration. |
</phase_requirements>

## Gap Analysis

### DX-01: Setup Wizard -- COMPLETE

`setup/setup.mjs` already implements:
- Step 1: Prerequisites check (Node.js >= 18, git, gh CLI, ngrok)
- Step 2: GitHub PAT creation with validation and scope checking
- Step 3: API keys (LLM provider selection, Brave Search key)
- Step 4: App URL configuration
- Step 5: Config sync to `.env` + GitHub secrets/variables
- Step 6: Build and server startup verification
- Step 7: Summary with all configured values

**Verdict:** No implementation work needed. Mark DX-01 as already satisfied.

### DX-02: CLI Commands -- 3 NEW Commands Needed

**Existing commands in `bin/cli.js`:**
- `init` -- Scaffold new project
- `setup` -- Run interactive wizard
- `setup-telegram` -- Configure Telegram webhook
- `reset-auth` -- Regenerate AUTH_SECRET
- `reset [file]` -- Restore template file
- `diff [file]` -- Show template differences
- `set-agent-secret` -- Set GitHub secret with AGENT_ prefix
- `set-agent-llm-secret` -- Set GitHub secret with AGENT_LLM_ prefix
- `set-var` -- Set GitHub variable

**New commands to implement:**

| Command | What It Does | Existing Code to Reuse |
|---------|-------------|----------------------|
| `create-instance <name>` | Create a new ClawForge instance from CLI | `lib/tools/instance-job.js` (`buildInstanceJobDescription`) + `lib/tools/create-job.js` (`createJob`) |
| `run-job <description>` | Dispatch a job from CLI | `lib/tools/create-job.js` (`createJob`) + `lib/tools/docker.js` (`dispatchDockerJob`) |
| `check-status [job_id]` | Check job status from CLI | `lib/tools/github.js` (`getJobStatus`) + `lib/tools/docker.js` (`inspectJob`) |

### DX-03: Web Search LangGraph Tool -- NEW File

**What exists:**
- `templates/pi-skills/brave-search/search.js` -- CLI script that calls Brave Search API and prints results. Uses `@mozilla/readability`, `jsdom`, `turndown` for content extraction.
- `instances/noah/config/MCP_SERVERS.json` -- configures `@modelcontextprotocol/server-brave-search` as an MCP server for job containers.
- `BRAVE_API_KEY` -- already collected by setup wizard (step 3c in `setup/setup.mjs`).

**What needs to be built:**
- `lib/ai/web-search.js` -- a LangGraph `tool()` that calls the Brave Search REST API directly (no MCP, no subprocess).
- Register it in the agent's tool array in `lib/ai/agent.js`.

**Key distinction:** The MCP server (`@modelcontextprotocol/server-brave-search`) runs inside Docker job containers for Claude Code CLI. The `web_search` LangGraph tool runs in the event handler (Layer 1) for the conversational agent. These are separate systems.

## Architecture Patterns

### CLI Command Pattern (from existing `bin/cli.js`)

Each command is a function that:
1. Reads `.env` for config (via `loadRepoInfo()` pattern)
2. Imports library functions dynamically
3. Uses `@clack/prompts` for interactive input when args are missing
4. Prints results with `console.log`

```javascript
// Pattern from set-agent-secret
async function runJob(description) {
  if (!description) {
    // Interactive prompt
    const { text, isCancel } = await import('@clack/prompts');
    description = await text({ message: 'Job description:' });
    if (isCancel(description)) process.exit(0);
  }

  // Reuse existing library code
  const { createJob } = await import('../lib/tools/create-job.js');
  const result = await createJob(description);
  console.log(`Job created: ${result.job_id}`);
  console.log(`Branch: ${result.branch}`);
}
```

### LangGraph Tool Pattern (from existing `lib/ai/tools.js`)

Every tool follows this exact structure:
1. Import `tool` from `@langchain/core/tools` and `z` from `zod`
2. Define async handler function
3. Define tool metadata with `name`, `description`, `schema`
4. Export for registration in `lib/ai/agent.js`

```javascript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const webSearchTool = tool(
  async ({ query, num_results }) => {
    // Call Brave Search API
    // Return JSON.stringify(results)
  },
  {
    name: 'web_search',
    description: '...',
    schema: z.object({
      query: z.string().describe('Search query'),
      num_results: z.number().optional().default(5).describe('Number of results'),
    }),
  }
);

export { webSearchTool };
```

Registration in `agent.js` (line 19):
```javascript
const tools = [createJobTool, ..., webSearchTool];
```

### Brave Search API Pattern (from `templates/pi-skills/brave-search/search.js`)

The API call is straightforward:
```javascript
const params = new URLSearchParams({
  q: query,
  count: Math.min(numResults, 20).toString(),
  country: 'US',
});

const response = await fetch(
  `https://api.search.brave.com/res/v1/web/search?${params}`,
  {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
    },
  }
);
```

Response structure:
```javascript
// data.web.results[] contains:
{ title, url, description, age, page_age }
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job dispatch from CLI | Custom GitHub API calls | `createJob()` from `lib/tools/create-job.js` | Already handles branch creation, job.md writing, target repo sidecar |
| Job status from CLI | Custom status checking | `getJobStatus()` from `lib/tools/github.js` + `inspectJob()` from `lib/tools/docker.js` | Already handles both Actions and Docker dispatch methods |
| Instance creation from CLI | Manual file scaffolding | `buildInstanceJobDescription()` from `lib/tools/instance-job.js` + `createJob()` | The instance creation is itself a job that generates all config files |
| Search result parsing | Custom HTML/JSON parser | Direct Brave API JSON response | The API returns clean structured data; content extraction is optional |
| Interactive CLI prompts | readline/inquirer | `@clack/prompts` | Already used throughout `setup/setup.mjs` and `bin/cli.js` |

## Common Pitfalls

### Pitfall 1: Environment Variable Loading
**What goes wrong:** CLI commands fail because `process.env.GH_TOKEN` etc. aren't set
**Why it happens:** `bin/cli.js` runs standalone, not within the Next.js server that loads `.env`
**How to avoid:** Use the existing `loadRepoInfo()` pattern or `dotenv` to load `.env` before using library functions. The existing `loadEnvFile()` in `setup/lib/env.mjs` already handles this.

### Pitfall 2: BRAVE_API_KEY Availability
**What goes wrong:** `web_search` tool errors because no API key
**Why it happens:** Brave key is optional in setup wizard, and stored as `BRAVE_API_KEY` in `.env` (also synced as `AGENT_LLM_BRAVE_API_KEY` to GitHub secrets)
**How to avoid:** Check `process.env.BRAVE_API_KEY` at tool construction time. If missing, either omit the tool from agent registration or return a helpful error message.

### Pitfall 3: Agent Singleton Reset
**What goes wrong:** Adding web_search tool doesn't take effect until server restart
**Why it happens:** `lib/ai/agent.js` caches the agent singleton. The tool array is set once at creation.
**How to avoid:** This is expected behavior. The tool is registered at agent creation time. Document that server restart is needed after adding the tool.

### Pitfall 4: CLI vs Server Context
**What goes wrong:** CLI commands that import `lib/tools/*.js` fail due to missing server-side dependencies
**Why it happens:** Some library functions depend on running within the Next.js server context (e.g., database connections, Docker socket)
**How to avoid:** For CLI commands, ensure `.env` is loaded first, and only import the specific functions needed. The `createJob()` function only needs `GH_OWNER`, `GH_REPO`, and `GH_TOKEN` env vars -- it works purely via GitHub API.

## Code Examples

### New CLI Command: run-job
```javascript
async function runJob(description) {
  if (!description) {
    const { text, isCancel } = await import('@clack/prompts');
    description = await text({
      message: 'Enter job description:',
      validate: (input) => { if (!input) return 'Description is required'; },
    });
    if (isCancel(description)) { process.exit(0); }
  }

  // Load env for GH_TOKEN, GH_OWNER, GH_REPO
  loadEnvToProcess();

  const { createJob } = await import(path.join(__dirname, '..', 'lib', 'tools', 'create-job.js'));
  const result = await createJob(description);

  console.log(`\n  Job ID: ${result.job_id}`);
  console.log(`  Branch: ${result.branch}\n`);
}
```

### New LangGraph Tool: web_search
```javascript
// lib/ai/web-search.js
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const webSearchTool = tool(
  async ({ query, num_results = 5 }) => {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ error: 'BRAVE_API_KEY not configured. Run setup wizard to add it.' });
    }

    const params = new URLSearchParams({
      q: query,
      count: Math.min(num_results, 20).toString(),
      country: 'US',
    });

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      }
    );

    if (!response.ok) {
      return JSON.stringify({ error: `Brave Search API error: ${response.status}` });
    }

    const data = await response.json();
    const results = (data.web?.results || []).slice(0, num_results).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
      age: r.age || r.page_age || '',
    }));

    return JSON.stringify({ results, total: results.length });
  },
  {
    name: 'web_search',
    description:
      'Search the web using Brave Search API. Returns titles, URLs, snippets, and publication age. ' +
      'Use this when the operator asks a question that requires current information, fact-checking, ' +
      'or research beyond your training data.',
    schema: z.object({
      query: z.string().describe('The search query'),
      num_results: z.number().optional().describe('Number of results to return (default: 5, max: 20)'),
    }),
  }
);

export { webSearchTool };
```

### Agent Registration (agent.js modification)
```javascript
// Add import
import { webSearchTool } from './web-search.js';

// Add to tools array (conditionally if BRAVE_API_KEY exists)
const tools = [
  createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool,
  createInstanceJobTool, getProjectStateTool, startCodingTool,
  listWorkspacesTool, cancelJobTool, createClusterJobTool,
  ...(process.env.BRAVE_API_KEY ? [webSearchTool] : []),
];
```

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/core` | ^1.1.24 | `tool()` function for LangGraph tools | Already used for all 9 existing tools |
| `zod` | ^4.3.6 | Schema validation for tool inputs | Already used for all tool schemas |
| `@clack/prompts` | (existing) | Interactive CLI prompts | Already used in setup wizard and cli.js |

### No New Dependencies Needed
The web search tool uses `fetch()` (built into Node 18+) and the Brave Search REST API. No new npm packages required.

## Integration Points

### CLI Commands Integration
1. **`bin/cli.js` switch statement** (line 546-577) -- add 3 new cases
2. **`printUsage()` function** (line 48-62) -- add new commands to help text
3. **`lib/tools/create-job.js`** -- import `createJob()` for run-job command
4. **`lib/tools/github.js`** -- import `getJobStatus()` for check-status command
5. **`lib/tools/instance-job.js`** -- import `buildInstanceJobDescription()` for create-instance command
6. **`.env` loading** -- reuse `loadRepoInfo()` pattern or extend it

### Web Search Tool Integration
1. **New file: `lib/ai/web-search.js`** -- tool implementation
2. **`lib/ai/agent.js` line 4** -- add import
3. **`lib/ai/agent.js` line 19** -- add to tools array
4. **`lib/ai/tools.js` line 750** -- optionally export from tools.js for consistency (or keep in separate file)

## Open Questions

1. **Docker dispatch from CLI?**
   - The `run-job` CLI command can easily dispatch via GitHub Actions (just push a branch). Docker dispatch requires the server to be running and Docker socket access.
   - Recommendation: CLI `run-job` should use GitHub Actions path only (via `createJob()` which pushes a branch). Docker dispatch is handled by the server.

2. **create-instance interactivity level?**
   - The LangGraph tool (`create_instance_job`) takes 6 parameters. Should the CLI command prompt for all of them interactively?
   - Recommendation: Accept `--name` and `--purpose` as required, prompt for the rest interactively using `@clack/prompts`.

3. **web_search tool: include content extraction?**
   - The Pi skill version (`search.js`) has a `--content` flag that fetches and parses page content using Readability.
   - Recommendation: Start with search results only (title, URL, snippet). Content extraction adds heavy dependencies (jsdom, readability, turndown) and latency. The agent can use the URLs to fetch content separately if needed.

## Sources

### Primary (HIGH confidence)
- `lib/ai/tools.js` -- Existing tool registration pattern (9 tools)
- `lib/ai/agent.js` -- Agent singleton and tool array
- `bin/cli.js` -- Existing CLI command structure
- `setup/setup.mjs` -- Complete setup wizard implementation
- `templates/pi-skills/brave-search/search.js` -- Brave API reference implementation

### Secondary (HIGH confidence)
- `lib/tools/create-job.js` -- Job creation via GitHub API
- `lib/tools/github.js` -- GitHub API helper and job status
- `instances/noah/config/MCP_SERVERS.json` -- MCP Brave Search config (for containers, not event handler)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new deps
- Architecture: HIGH -- exact patterns exist in codebase for both CLI commands and LangGraph tools
- Pitfalls: HIGH -- based on direct code analysis of existing implementations

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependency changes expected)
