---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/chat/actions.js
  - lib/chat/components/app-sidebar.jsx
  - lib/chat/components/chat-header.jsx
  - templates/app/layout.js
  - lib/chat/components/greeting.jsx
autonomous: true
must_haves:
  truths:
    - "Agent name (e.g. 'Archie') appears in the sidebar header area"
    - "Agent name appears in the chat page header"
    - "Browser tab title shows the agent name"
    - "Fallback to INSTANCE_NAME or 'ClawForge' when SOUL.md has no parseable name"
  artifacts:
    - path: "lib/chat/actions.js"
      provides: "getAgentName server action"
      contains: "getAgentName"
    - path: "lib/chat/components/app-sidebar.jsx"
      provides: "Sidebar shows agent name instead of hardcoded 'ClawForge'"
    - path: "lib/chat/components/chat-header.jsx"
      provides: "Chat header displays agent name"
    - path: "templates/app/layout.js"
      provides: "Dynamic page title with agent name"
  key_links:
    - from: "lib/chat/actions.js"
      to: "lib/paths.js"
      via: "soulMd path import"
      pattern: "soulMd"
    - from: "lib/chat/components/app-sidebar.jsx"
      to: "lib/chat/actions.js"
      via: "getAgentName() call in useEffect"
      pattern: "getAgentName"
---

<objective>
Make the instance agent name (e.g. "Archie", "Epic") prominently visible in three places:
the sidebar header, the chat page header, and the browser tab title.

Purpose: Users currently have no indication of which agent/instance they are talking to.
Output: Agent name sourced from SOUL.md first line or INSTANCE_NAME env, displayed across the web UI.
</objective>

<execution_context>
@/Users/nwessel/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nwessel/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lib/chat/actions.js
@lib/chat/components/app-sidebar.jsx
@lib/chat/components/chat-header.jsx
@templates/app/layout.js
@lib/paths.js
@lib/chat/components/greeting.jsx

<interfaces>
<!-- Key patterns the executor needs -->

From lib/paths.js:
```javascript
export const soulMd = path.join(PROJECT_ROOT, 'config', 'SOUL.md');
```

From lib/chat/actions.js (existing pattern for server actions):
```javascript
'use server';
async function requireAuth() { ... }
export async function getAppVersion() { ... }
```

SOUL.md first line format (convention across instances):
```
# Archie — Noah's AI Agent
```
Agent name is the first word after "# " on line 1. Parse with regex: /^#\s+(\S+)/.

Fallback chain: SOUL.md first-line name -> process.env.INSTANCE_NAME -> 'ClawForge'

From app-sidebar.jsx line 56 (current hardcoded brand):
```jsx
<span className="px-2 font-semibold text-lg">ClawForge{version && ...}</span>
```

From templates/app/layout.js (current static metadata):
```javascript
export const metadata = {
  title: 'clawforge',
  description: 'AI Agent',
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getAgentName server action and wire into sidebar + chat header</name>
  <files>lib/chat/actions.js, lib/chat/components/app-sidebar.jsx, lib/chat/components/chat-header.jsx, lib/chat/components/greeting.jsx</files>
  <action>
1. In `lib/chat/actions.js`, add a new exported server action `getAgentName()`:
   - Import `soulMd` from `../paths.js` and `fs` (dynamic import like existing pattern)
   - Read `config/SOUL.md` via `fs.readFileSync(soulMd, 'utf8')`
   - Parse the first line with regex `/^#\s+(\S+)/` to extract the agent name (e.g. "Archie" from "# Archie - Noah's AI Agent")
   - Fallback chain: parsed name -> `process.env.INSTANCE_NAME` -> `'ClawForge'`
   - Wrap in try/catch, return the string name
   - This action does NOT require auth (agent name is not sensitive, and it simplifies usage in layout)

2. In `lib/chat/components/app-sidebar.jsx`:
   - Import `getAgentName` from `../actions.js`
   - Add `const [agentName, setAgentName] = useState('ClawForge');` state
   - In the existing `useEffect`, add `getAgentName().then(setAgentName).catch(() => {});`
   - Replace the hardcoded "ClawForge" text on line 56 with `{agentName}`
   - Keep the version badge exactly as-is after the agent name

3. In `lib/chat/components/chat-header.jsx`:
   - Import `getAgentName` from `../actions.js`
   - Add state: `const [agentName, setAgentName] = useState('');`
   - Add useEffect to fetch: `getAgentName().then(setAgentName).catch(() => {});`
   - Add the agent name display BEFORE the repo selector div, after the mobile sidebar trigger:
     ```jsx
     {agentName && (
       <span className="hidden md:inline text-sm font-medium text-foreground">{agentName}</span>
     )}
     ```
   - This shows the agent name on desktop; on mobile the sidebar already shows it

4. In `lib/chat/components/greeting.jsx`:
   - Import `{ useState, useEffect }` from 'react'
   - Import `getAgentName` from `../actions.js`
   - Fetch agent name on mount, replace "Hello! How can I help?" with "Hello! I'm {agentName}. How can I help?" when name is loaded
   - Fallback to current generic greeting if fetch fails
  </action>
  <verify>
    <automated>cd "/Users/nwessel/Claude Code/Business/Products/clawforge" && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Agent name appears in sidebar header (replacing "ClawForge"), in chat header bar, and in the greeting. Build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Dynamic browser tab title with agent name</name>
  <files>templates/app/layout.js</files>
  <action>
In `templates/app/layout.js`, replace the static `metadata` export with a `generateMetadata` async function:

```javascript
import { soulMd } from 'thepopebot/paths';
import fs from 'fs';

export async function generateMetadata() {
  let agentName = 'ClawForge';
  try {
    const content = fs.readFileSync(soulMd, 'utf8');
    const match = content.match(/^#\s+(\S+)/);
    if (match) agentName = match[1];
    else if (process.env.INSTANCE_NAME) agentName = process.env.INSTANCE_NAME;
  } catch {
    if (process.env.INSTANCE_NAME) agentName = process.env.INSTANCE_NAME;
  }
  return {
    title: agentName,
    description: 'AI Agent',
  };
}
```

NOTE: `templates/app/layout.js` is the user-project scaffold (imported as the app's root layout). It uses `thepopebot/*` package imports (not relative). The `soulMd` path resolves from the project root at runtime, so `fs.readFileSync` works in the server component.

Check if `thepopebot/paths` is properly exported in the package. If not, inline the path resolution:
```javascript
import path from 'path';
const soulMd = path.join(process.cwd(), 'config', 'SOUL.md');
```
  </action>
  <verify>
    <automated>cd "/Users/nwessel/Claude Code/Business/Products/clawforge" && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Browser tab title shows agent name (e.g. "Archie") instead of "clawforge". Build succeeds with no errors.</done>
</task>

</tasks>

<verification>
- `npm run build` passes with zero errors
- Sidebar header shows agent name from SOUL.md (not "ClawForge")
- Chat header bar displays agent name
- Browser tab title reads agent name
- Greeting says "Hello! I'm {name}. How can I help?"
</verification>

<success_criteria>
Agent name extracted from SOUL.md first line is visible in: (1) sidebar header/logo area, (2) chat page header, (3) browser tab title, (4) greeting message. Fallback to INSTANCE_NAME env or "ClawForge" when SOUL.md is missing or unparseable. Build succeeds.
</success_criteria>

<output>
After completion, create `.planning/quick/3-make-instance-agent-name-prominently-vis/3-SUMMARY.md`
</output>
