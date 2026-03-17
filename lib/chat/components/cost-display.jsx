"use client";

/**
 * CostDisplay — inline badge showing token usage and estimated USD cost.
 * Rendered after terminal session turns.
 *
 * @param {object} props
 * @param {number} props.inputTokens - Input token count
 * @param {number} props.outputTokens - Output token count
 * @param {number} props.estimatedUsd - Estimated cost in USD
 */
export function CostDisplay({ inputTokens, outputTokens, estimatedUsd }) {
  if (estimatedUsd == null && inputTokens == null) return null;

  const totalTokens = (inputTokens || 0) + (outputTokens || 0);
  const costStr = estimatedUsd != null ? `$${estimatedUsd.toFixed(4)}` : '';

  return (
    <div className="inline-flex items-center gap-2 mt-1 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono">
      {costStr && <span>{costStr}</span>}
      {totalTokens > 0 && (
        <span>
          {totalTokens.toLocaleString()} tokens
          <span className="text-muted-foreground/60 ml-1">
            ({(inputTokens || 0).toLocaleString()} in / {(outputTokens || 0).toLocaleString()} out)
          </span>
        </span>
      )}
    </div>
  );
}
