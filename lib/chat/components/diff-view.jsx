"use client";
import { useMemo } from "react";
import { html as diff2htmlHtml } from "diff2html";

/**
 * DiffView — renders a unified diff string as red/green HTML.
 * Uses diff2html for rendering. CSS is inlined to avoid Next.js CSS import issues.
 *
 * @param {object} props
 * @param {string} props.diff - Unified diff string (from tool input/output)
 * @param {string} [props.filename] - File name for header display
 */
export function DiffView({ diff, filename }) {
  const diffHtml = useMemo(() => {
    if (!diff) return null;
    try {
      return diff2htmlHtml(diff, {
        drawFileList: false,
        matching: "lines",
        outputFormat: "line-by-line",
        colorScheme: "auto",
      });
    } catch {
      // Fallback: render as preformatted text
      return null;
    }
  }, [diff]);

  if (!diff) return null;

  if (!diffHtml) {
    // Fallback rendering
    return (
      <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-foreground overflow-x-auto text-xs max-h-96 overflow-y-auto">
        {diff}
      </pre>
    );
  }

  return (
    <div className="diff-view-container rounded overflow-hidden text-xs max-h-96 overflow-y-auto">
      {filename && (
        <div className="bg-muted px-3 py-1 text-xs font-mono text-muted-foreground border-b border-border">
          {filename}
        </div>
      )}
      <div
        dangerouslySetInnerHTML={{ __html: diffHtml }}
        className="diff-view-inner"
      />
      <style jsx global>{`
        .diff-view-inner .d2h-wrapper { font-size: 12px; }
        .diff-view-inner .d2h-file-header { display: none; }
        .diff-view-inner .d2h-code-line-ctn { white-space: pre-wrap; word-break: break-all; }
        .diff-view-inner .d2h-del { background-color: rgba(255, 0, 0, 0.1); }
        .diff-view-inner .d2h-ins { background-color: rgba(0, 255, 0, 0.1); }
        .diff-view-inner .d2h-del .d2h-code-line-ctn del { background-color: rgba(255, 0, 0, 0.2); text-decoration: none; }
        .diff-view-inner .d2h-ins .d2h-code-line-ctn ins { background-color: rgba(0, 255, 0, 0.2); text-decoration: none; }
        .diff-view-inner .d2h-code-linenumber { color: var(--muted-foreground, #666); min-width: 40px; }
        .diff-view-inner .d2h-info { background-color: var(--muted, #f4f4f4); color: var(--muted-foreground, #666); }
        .diff-view-inner table { width: 100%; }
      `}</style>
    </div>
  );
}
