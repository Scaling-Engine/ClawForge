# Quick Task 260320-e2g: Restructure chat UI to match upstream PopeBot layout - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Task Boundary

Restructure the ClawForge web chat UI to match the upstream PopeBot layout. Move Code toggle and repo/branch selectors from their current positions to below the chat input, matching upstream's visual design and interaction patterns.

</domain>

<decisions>
## Implementation Decisions

### Headless vs Interactive
- **Replace Interactive with Headless.** Remove the Interactive workspace button entirely. The "Headless" toggle below the chat input launches the terminal workspace with tabs (Code + Shell), matching upstream exactly. The existing `launchWorkspace` / `handleLaunchInteractive` logic gets rewired to the Headless toggle.

### Code Sub-modes
- **Remove the Plan/Code sub-mode dropdown entirely.** Match upstream — just a single Code toggle. When Code is ON, messages route to `/stream/terminal`. No plan vs code distinction in the UI.

### Header Content
- **Agent name + sidebar trigger only.** Remove repo/branch selectors from the header completely. Clean header matching upstream — just the agent name and mobile sidebar button. Repo/branch selectors move below the chat input, visible only when Code toggle is ON.

### Claude's Discretion
- Toggle switch styling (pill-shaped toggle vs button)
- Greeting text when Code mode is active ("What we coding today?" or similar)
- Exact positioning/spacing of below-input controls

</decisions>

<specifics>
## Specific Ideas

Reference screenshots from upstream PopeBot show:
1. **Default state**: Greeting + chat input + "Code" toggle switch (pill/slider style) centered below input
2. **Code ON state**: Greeting changes to "What we coding today?", repo dropdown + branch dropdown appear next to Code toggle below input
3. **Headless state**: Shows terminal with Code/Shell tabs, repo + branch info in header bar above terminal, "Headless" toggle
4. The Code toggle is a proper iOS-style toggle switch, not a button

</specifics>
