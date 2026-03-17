"use client";
import { useState } from "react";
import { ChevronDownIcon } from "./icons.js";
import { cn } from "../utils.js";

/**
 * ThinkingPanel — collapsible panel showing Claude's reasoning steps.
 * Defaults to collapsed. Shows a "Reasoning" header with expand toggle.
 *
 * @param {object} props
 * @param {string} props.thinking - The thinking/reasoning text content
 */
export function ThinkingPanel({ thinking }) {
  const [expanded, setExpanded] = useState(false);

  if (!thinking) return null;

  return (
    <div className="my-1 rounded-lg border border-border/50 bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 rounded-lg"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400 shrink-0">
          <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z" />
          <line x1="9" y1="22" x2="15" y2="22" />
        </svg>
        <span className="font-medium text-muted-foreground">Reasoning</span>
        <ChevronDownIcon
          size={14}
          className={cn(
            "ml-auto text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground leading-relaxed max-h-64 overflow-y-auto">
            {thinking}
          </pre>
        </div>
      )}
    </div>
  );
}
