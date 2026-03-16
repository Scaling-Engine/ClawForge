---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified: [package.json]
autonomous: true
requirements: []
must_haves:
  truths:
    - "Sidebar displays 'ClawForge v2.1.0'"
  artifacts:
    - path: "package.json"
      provides: "Version string"
      contains: '"version": "2.1.0"'
  key_links:
    - from: "package.json"
      to: "lib/chat/components/app-sidebar.jsx"
      via: "lib/cron.js:getInstalledVersion() -> lib/chat/actions.js:getAppVersion()"
      pattern: '"version":\\s*"2\\.1\\.0"'
---

<objective>
Update package.json version from 0.1.0 to 2.1.0 so the web app sidebar displays the correct version.

Purpose: The app just shipped v2.1 but package.json still says 0.1.0, causing the sidebar to show the wrong version.
Output: package.json with version 2.1.0
</objective>

<execution_context>
@/Users/nwessel/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nwessel/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update package.json version to 2.1.0</name>
  <files>package.json</files>
  <action>Change the "version" field in package.json from "0.1.0" to "2.1.0". This is line 3 of the file. No other changes needed.</action>
  <verify>
    <automated>node -e "const p = require('./package.json'); if (p.version !== '2.1.0') { console.error('Expected 2.1.0, got ' + p.version); process.exit(1); } console.log('OK: version is ' + p.version);"</automated>
  </verify>
  <done>package.json version field reads "2.1.0" and npm run build succeeds</done>
</task>

</tasks>

<verification>
- `node -e "console.log(require('./package.json').version)"` outputs `2.1.0`
- `npm run build` succeeds
</verification>

<success_criteria>
- package.json version is "2.1.0"
- Sidebar will display "ClawForge v2.1.0" when app runs
</success_criteria>

<output>
After completion, create `.planning/quick/2-make-sure-the-version-on-the-web-app-mat/2-SUMMARY.md`
</output>
