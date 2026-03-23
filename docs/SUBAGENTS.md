# Using Subagents

Subagents let you chain multiple AI agents together to tackle complex tasks that are too large or too specialized for a single agent. Each agent in the pipeline has its own role, system prompt, and allowed tools — they execute sequentially, handing off results to the next.

---

## What Are Subagents?

A subagent is a named pipeline with a list of **roles**. Each role is a separate agent with its own personality, instructions, and allowed tools. When you run a subagent, the roles execute one at a time in order:

1. Role 1 runs, completes its task, and writes output to a shared location
2. Role 2 runs, reads that output, builds on it, and writes its own output
3. Role 3 runs, reads everything, and produces the final result

This "assembly line" pattern is powerful for tasks that benefit from specialization. A researcher agent that focuses only on reading and analysis produces better output than a generalist agent trying to do everything at once.

---

## Creating a Subagent

### Via the Admin Panel

1. Go to `/admin/clusters` (labeled "Subagents" in the navigation)
2. Click **Add Subagent**
3. Give it a name (e.g., `code-review-pipeline`)
4. Optionally add a high-level system prompt shared across all roles
5. Add each role:
   - **Name** — Identifies this role (e.g., `researcher`, `reviewer`, `implementer`)
   - **System Prompt** — Detailed instructions for what this role does and what it should write/read
   - **Allowed Tools** — Which Claude Code tools this role can use
6. Click **Save**

### Via CLUSTER.json

For version-controlled definitions, add a `CLUSTER.json` file to `instances/{name}/config/`:

```json
{
  "clusters": [
    {
      "name": "code-review-pipeline",
      "systemPrompt": "You are working on a code review and improvement pipeline.",
      "roles": [
        {
          "name": "researcher",
          "systemPrompt": "You are a code research agent. Analyze the codebase and identify patterns, potential issues, and areas for improvement. Write your findings to /tmp/shared/research.md.",
          "allowedTools": ["Read", "Grep", "Glob", "Bash"]
        },
        {
          "name": "reviewer",
          "systemPrompt": "You are a code reviewer. Read /tmp/shared/research.md and create a detailed code review with actionable recommendations. Write to /tmp/shared/review.md.",
          "allowedTools": ["Read", "Write", "Grep", "Glob"]
        },
        {
          "name": "implementer",
          "systemPrompt": "You are an implementation agent. Read /tmp/shared/review.md and implement the recommended changes.",
          "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
        }
      ]
    }
  ]
}
```

The admin panel and `CLUSTER.json` are synchronized — changes in either are reflected in both.

---

## Running a Subagent

### Via Conversation

Ask your agent to start a subagent run:

> "Run the code-review-pipeline on this project"

Your agent will propose a subagent job, show you the pipeline, and wait for your approval. Once approved, the run begins.

You can also trigger subagent runs via the `create_cluster_job` tool in `EVENT_HANDLER.md`. Admins can configure this tool to be available to the agent.

### Via the Subagents Page

Navigate to `/clusters` (labeled "Subagents" in the sidebar) to:
- View all defined subagents and their roles
- See the history of all subagent runs
- Check the status of each run (running, complete, failed)

---

## Monitoring a Run

Click any run in the history to open the detail view. You'll see three tabs:

- **Overview** — Run metadata, status, agent timeline showing each role's progress
- **Console** — Live streaming output from the currently executing role (updates in real-time)
- **Logs** — Historical log output for any completed role. Click a role button to view its logs

The console tab is most useful while a run is in progress. The logs tab is useful after a run completes to review what each role did.

---

## What the Console Shows

The console tab streams live events from the active agent:

| Symbol | Meaning |
|--------|---------|
| `+` green | File created |
| `~` yellow | File modified |
| `$` | Bash command executed |
| `>` blue | Agent progress update |
| Check mark green | Agent completed |
| X red | Error occurred |

---

## Passing Data Between Roles

Roles share data via a shared Docker volume mounted at `/tmp/shared/`. The convention is:

- Each role writes its output to a known path (e.g., `/tmp/shared/research.md`)
- The next role reads from that path and builds on it
- The final role produces the deliverable

**Tips for writing effective role prompts:**
- Be explicit about where to write: `"Write your findings to /tmp/shared/research.md"`
- Be explicit about where to read: `"Read /tmp/shared/research.md before proceeding"`
- Keep each role focused — specialization produces better results
- Give each role only the tools it needs

---

## Role Design Patterns

### Research → Write → Review
```
researcher  → reads codebase, writes findings.md
writer      → reads findings.md, writes draft.md
reviewer    → reads draft.md, produces final.md
```

### Plan → Implement → Test
```
planner     → reads requirements, writes plan.md (Read, Glob, Write)
implementer → reads plan.md, writes code (Read, Write, Edit, Bash)
tester      → reads code, writes test results (Read, Write, Bash)
```

### Multi-Repo Coordination
```
analyzer    → reads repo A, writes analysis.md
adapter     → reads analysis.md, adapts for repo B (Write, Edit)
verifier    → runs tests in repo B (Bash)
```

---

## Example Use Cases

- **Code review pipeline** — Research → review → implement recommendations
- **Documentation pipeline** — Audit existing docs → write new docs → verify links
- **Dependency update pipeline** — Identify outdated → update → run tests → write changelog
- **Feature planning** — Research requirements → design → scaffold implementation
- **Content generation** — Research → draft → edit → format

---

## Iteration Limits

Subagent runs have a hard iteration limit to prevent runaway execution. If a role gets stuck in a loop (e.g., failing repeatedly and retrying), the run will fail with a "limit exceeded" status rather than running forever. Check the logs tab to see what went wrong.

---

## Troubleshooting

**Run shows "failed" immediately**
Check the Console tab — the first agent probably encountered an auth or setup error. Common cause: missing `AGENT_*` secrets that the role needs.

**Role completed but next role didn't start**
The coordinator checks for the previous role's completion status. If the previous role exited with a non-zero exit code, the run may have stopped. Check the Overview tab for exit codes.

**No output in Console tab**
The console only shows the currently active role. If the run has already completed, use the Logs tab to view historical output for each role.
