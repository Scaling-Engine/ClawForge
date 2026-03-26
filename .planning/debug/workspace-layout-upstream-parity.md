---
status: awaiting_human_verify
trigger: "workspace-layout-upstream-parity — /code/{id} page lacks sidebar and app shell, should match upstream ThePopeBot layout"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — code-page.jsx renders with width:100vw height:100vh as a standalone div, bypassing the app shell entirely
test: Compare code-page.jsx outer div vs ChatPage which uses SidebarProvider + AppSidebar + SidebarInset
expecting: Wrapping code-page content in SidebarProvider + AppSidebar + SidebarInset will add the sidebar
next_action: Refactor code-page.jsx to remove standalone full-screen wrapper and add SidebarProvider + AppSidebar + SidebarInset wrapper

## Symptoms

expected: /code/{id} page should render WITHIN the main app layout — sidebar on left, workspace on right. Same chrome as chat page.
actual: /code/{id} page renders as standalone full-screen page with minimal top bar. No sidebar, no app navigation.
errors: No errors — layout/structure issue only.
reproduction: Navigate to any /code/{workspaceId} page
started: Since the page was created in phases 48-51

## Eliminated

(none)

## Evidence

- timestamp: 2026-03-23T00:01:00Z
  checked: templates/app/code/[id]/code-page.jsx lines 122-131
  found: Outer div has style "width:100vw height:100vh backgroundColor:#1e1e2e" — completely standalone, no shared app shell
  implication: This is the root cause. The page doesn't use SidebarProvider/AppSidebar at all.

- timestamp: 2026-03-23T00:01:00Z
  checked: lib/chat/components/chat-page.jsx lines 92-113
  found: ChatPage wraps content in SidebarProvider > AppSidebar + SidebarInset
  implication: The pattern to follow is clear. code-page.jsx needs the same wrapper.

- timestamp: 2026-03-23T00:01:00Z
  checked: lib/chat/components/page-layout.jsx
  found: PageLayout component exists — takes session + children, adds AppSidebar + SidebarInset automatically
  implication: Can use PageLayout for simpler wrapping, but need to check if it constrains content width (it adds max-w-4xl which would break the terminal full-width layout)

- timestamp: 2026-03-23T00:01:00Z
  checked: lib/chat/components/index.js
  found: AppSidebar is exported from lib/chat/components/index.js; SidebarProvider/SidebarInset from lib/chat/components/ui/sidebar.js; ChatNavProvider from lib/chat/components/chat-nav-context.js
  implication: code-page.jsx can import these directly and wrap its content — same pattern as chat-page.jsx

## Resolution

root_cause: code-page.jsx rendered as a standalone full-screen div (width:100vw, height:100vh) with a hardcoded dark background, bypassing the app shell entirely. No SidebarProvider, AppSidebar, or SidebarInset was present.
fix: Added SidebarProvider + AppSidebar + SidebarInset + ChatNavProvider wrapper (same pattern as chat-page.jsx). Also exported SidebarProvider, SidebarInset, and ChatNavProvider from lib/chat/components/index.js so they're accessible via the clawforge/chat package path. Inner content uses height:100svh with overflow:hidden to fill the SidebarInset area.
verification: Build passes (esbuild, 39ms). Self-verified JSX nesting is correct. Awaiting navigation test.
files_changed:
  - templates/app/code/[id]/code-page.jsx
  - lib/chat/components/index.js (source)
  - lib/chat/components/index.js (compiled by build)
