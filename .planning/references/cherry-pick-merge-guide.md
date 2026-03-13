# Cherry-Pick Merge Guide — thepopebot → ClawForge v2.1

**Purpose:** File-by-file instructions for each cherry-pick wave.

## General Rules

1. **Convert all imports**: `thepopebot/*` → relative paths (e.g., `../../lib/db/schema.js`)
2. **Keep ClawForge patterns**: dockerode, SSE streaming, ClawForge DB schema
3. **Test after each phase**: Run `npm run build` to catch import/type errors
4. **Never overwrite**: Files in the "Never Touch" list (see upstream-feature-inventory.md)

---

## Wave 1: Low Risk, UI Additions (Phases 29-31)

### Phase 29 — Foundation & Config

**Safe copy (adapt imports):**
- `lib/config.js` → Copy, change any `thepopebot/db` imports to `../db/schema.js`
- `lib/llm-providers.js` → Copy directly (standalone utility)
- `lib/chat/components/ui/combobox.jsx` → Copy, verify Radix UI deps match
- `lib/chat/components/tool-names.js` → Copy directly (static map)
- `lib/db/config.js` → Copy, adapt to ClawForge Drizzle schema patterns

**DB migration needed:** Add `config` table to schema.js + create migration file

### Phase 30 — New Pages

**Safe copy (adapt imports):**
- `lib/chat/components/pull-requests-page.jsx` → Copy, adapt GitHub API calls to use ClawForge's `lib/tools/github.js`
- `lib/chat/components/runners-page.jsx` → Copy, same GitHub API adaptation
- `lib/chat/components/profile-page.jsx` → Copy, use ClawForge's NextAuth session

**Careful merge:**
- `lib/chat/components/app-sidebar.jsx` → Add PR badge count, Runners link, Profile link. Keep existing Swarm, MCP Settings, Job Stream links.

**Route files:** Create Next.js route files under `web/app/` for each new page

### Phase 31 — Chat Enhancements

**Safe copy (adapt imports):**
- `lib/chat/components/code-mode-toggle.jsx` → Copy, integrate with ClawForge's `useRepoChat()` context

**Careful merge:**
- `lib/chat/components/chat.jsx` → Add file upload (drag-and-drop + paperclip), code mode toggle. Keep `useRepoChat()`, `useFeaturesContext()`, job stream rendering.
- `lib/chat/components/message.jsx` → Add enhanced code blocks, image previews. Keep `JobStreamViewer` integration.

---

## Wave 2: Auth & Admin (Phases 32-34)

### Phase 32 — Auth Roles

**Careful merge:**
- `lib/db/schema.js` → Add `role` column (`text`, default `'user'`) to `users` table. Keep all existing tables unchanged.

**New files:**
- Middleware for `/admin/*` route guarding (create from scratch, ClawForge-specific)
- `/forbidden` page component

**DB migration needed:** ALTER TABLE users ADD COLUMN role

### Phase 33 — Admin Panel

**Safe copy (adapt imports):**
- `lib/chat/components/settings-general-page.jsx` → Copy, adapt config calls
- `lib/chat/components/settings-chat-page.jsx` → Copy, adapt config calls
- `lib/chat/components/settings-github-page.jsx` → Copy, adapt GitHub API calls
- `lib/chat/components/settings-users-page.jsx` → Copy, adapt to ClawForge user schema

**New files:**
- `web/app/admin/layout.jsx` → Admin layout with sidebar
- `web/app/admin/*/page.jsx` → Route files for each admin sub-page
- Redirect middleware: `/settings/*` → `/admin/*`

### Phase 34 — GitHub Secrets Management

**Safe copy (adapt):**
- `lib/github-api.js` → Copy, verify uses ClawForge's GitHub token patterns
- `lib/db/crypto.js` → Rewrite to use Node `crypto` (AES-256-GCM), NOT libsodium

**New files:**
- `lib/chat/components/settings-secrets-layout.jsx` → Adapt from upstream
- Admin secrets page route

---

## Wave 3: Advanced Features (Phases 35-38)

### Phase 35 — Voice Input

**Safe copy (adapt):**
- `lib/voice/recorder.js` → Copy, change Whisper references to AssemblyAI
- `lib/voice/transcription.js` → Rewrite for AssemblyAI real-time API (different protocol than Whisper)
- `lib/voice/config.js` → Copy, change env var to `ASSEMBLYAI_API_KEY`
- `lib/chat/components/voice-bars.jsx` → Copy directly (pure UI component)

**Careful merge:**
- `lib/chat/components/chat.jsx` → Add microphone button and voice state

### Phase 36 — Code Workspaces V2

**New dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/addon-serialize`, `chokidar`

**Safe copy (adapt):**
- `lib/code/terminal-view.jsx` → Copy, adapt to xterm v6 API (upstream uses v5)
- `lib/code/actions.js` → Copy, use ClawForge's dockerode API for workspace CRUD
- `lib/code/ws-proxy.js` → Copy, integrate with ClawForge's WebSocket setup

**Key adaptation:** All Docker operations must use ClawForge's dockerode client, NOT upstream's raw http calls

### Phase 37 — Cluster Detail Views

**Safe copy (adapt imports):**
- `lib/cluster/components/*.jsx` → Copy all 6+ UI components, adapt to ClawForge's cluster DB schema and API

**New route files:**
- `web/app/cluster/[id]/page.jsx`
- `web/app/cluster/[id]/console/page.jsx`
- `web/app/cluster/[id]/logs/page.jsx`
- `web/app/cluster/[id]/role/[roleId]/page.jsx`

**Keep untouched:** `lib/cluster/index.js`, `dispatch.js`, `runtime.js` — ClawForge's cluster backend is authoritative

### Phase 38 — Developer Experience

**Safe copy (adapt):**
- `lib/ai/web-search.js` → Copy, register as tool in ClawForge's `lib/ai/tools.js`
- `bin/setup` → Copy, adapt to ClawForge's env var naming
- `bin/cli.js` → Copy, adapt commands to ClawForge's API

**Careful merge:**
- `lib/ai/tools.js` → Add `web_search` tool definition. Keep all 9 existing tools unchanged.

---

## Post-Wave Checklist

After each wave:
- [ ] `npm run build` passes
- [ ] All new pages render without errors
- [ ] Existing features still work (Slack, Telegram, Web Chat, job dispatch, clusters)
- [ ] No `thepopebot/*` import paths remain
- [ ] No `libsodium` references (use Node crypto)
- [ ] No `--dangerously-skip-permissions` anywhere

---
*Created: 2026-03-12*
