"use client";
import { useState } from "react";
import { WrenchIcon, SpinnerIcon, CheckIcon, XIcon, ChevronDownIcon, FileTextIcon } from "./icons.js";
import { DiffView } from "./diff-view.js";
import { ThinkingPanel } from "./thinking-panel.js";
import { cn } from "../utils.js";

const TOOL_DISPLAY_NAMES = {
  Read: "Read File",
  Write: "Write File",
  Edit: "Edit File",
  MultiEdit: "Multi-Edit File",
  Bash: "Run Command",
  Glob: "Find Files",
  Grep: "Search Files",
  WebFetch: "Fetch URL",
  TodoWrite: "Update Todos",
  TodoRead: "Read Todos",
  _thinking: "Reasoning",
};

// Tools whose input contains file diffs or content changes
const DIFF_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

function getToolDisplayName(toolName) {
  return TOOL_DISPLAY_NAMES[toolName] || toolName.replace(/_/g, " ");
}

function getToolIcon(toolName) {
  if (DIFF_TOOLS.has(toolName)) return FileTextIcon;
  return WrenchIcon;
}

function formatContent(content) {
  if (content == null) return null;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  }
  return JSON.stringify(content, null, 2);
}

/**
 * Extract a diff string from tool input/output for Write/Edit/MultiEdit tools.
 * Returns { diff, filename } or null if no diff found.
 */
function extractDiffInfo(toolName, input, output) {
  if (!DIFF_TOOLS.has(toolName)) return null;

  const filename = input?.file_path || input?.path || input?.filename || "";

  // For Edit/MultiEdit, output often contains the diff
  if (output && typeof output === "string" && output.includes("---")) {
    return { diff: output, filename };
  }

  // For Write, construct a simple diff showing new content
  if (toolName === "Write" && input?.content) {
    const content = typeof input.content === "string" ? input.content : JSON.stringify(input.content, null, 2);
    // Create a pseudo-diff showing the written content
    const lines = content.split("\n").map((l) => `+${l}`).join("\n");
    const diff = `--- /dev/null\n+++ ${filename || "file"}\n@@ -0,0 +1,${content.split("\n").length} @@\n${lines}`;
    return { diff, filename };
  }

  return null;
}

/**
 * TerminalToolCall — extends ToolCall with diff rendering for file edit tools
 * and thinking panel for reasoning blocks.
 *
 * @param {object} props
 * @param {object} props.part - AI SDK message part (tool-input-*, tool-output-*)
 */
export function TerminalToolCall({ part }) {
  const [expanded, setExpanded] = useState(false);

  const toolName = part.toolName || "tool";
  const displayName = getToolDisplayName(toolName);
  const state = part.state || "input-available";
  const isRunning = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  // TERM-08: Thinking blocks get special treatment
  if (toolName === "_thinking") {
    const thinking = part.input?.thinking || (typeof part.input === "string" ? part.input : "");
    return <ThinkingPanel thinking={thinking} />;
  }

  const IconComponent = getToolIcon(toolName);
  const diffInfo = extractDiffInfo(toolName, part.input, part.output);

  return (
    <div className="my-1 rounded-lg border border-border bg-background">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 rounded-lg"
      >
        <IconComponent size={14} className="text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground">{displayName}</span>
        {diffInfo?.filename && (
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
            {diffInfo.filename}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {isRunning && (
            <>
              <SpinnerIcon size={12} />
              <span>Running...</span>
            </>
          )}
          {isDone && (
            <>
              <CheckIcon size={12} className="text-green-500" />
              <span>Done</span>
            </>
          )}
          {isError && (
            <>
              <XIcon size={12} className="text-red-500" />
              <span>Error</span>
            </>
          )}
        </span>
        <ChevronDownIcon
          size={14}
          className={cn(
            "text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 text-xs">
          {/* TERM-03: Render diff for file edit tools */}
          {diffInfo ? (
            <DiffView diff={diffInfo.diff} filename={diffInfo.filename} />
          ) : (
            <>
              {part.input != null && (
                <div className="mb-2">
                  <div className="font-medium text-muted-foreground mb-1">Input</div>
                  <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-foreground overflow-x-auto">
                    {formatContent(part.input)}
                  </pre>
                </div>
              )}
              {part.output != null && (
                <div>
                  <div className="font-medium text-muted-foreground mb-1">Output</div>
                  <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-foreground overflow-x-auto max-h-64 overflow-y-auto">
                    {formatContent(part.output)}
                  </pre>
                </div>
              )}
            </>
          )}
          {part.input == null && part.output == null && !diffInfo && (
            <div className="text-muted-foreground italic">Waiting for data...</div>
          )}
        </div>
      )}
    </div>
  );
}
