/**
 * SSE Route Handler — /api/jobs/stream/[jobId]
 *
 * Streams semantic events from a running Docker job container to the browser
 * via Server-Sent Events (text/event-stream). Each event is a JSON object:
 *   data: {"type":"progress","label":"git commit -m ..."}
 *   data: {"type":"file-change","operation":"write","path":"src/index.js"}
 *   data: {"type":"decision","text":"I'll start by reading the existing..."}
 *   data: {"type":"complete","elapsedMs":87432}
 *   data: {"type":"cancelled","elapsedMs":12100}
 *   data: {"type":"error","message":"[stderr] ENOENT: ..."}
 *
 * Self-hosted deployment runs a custom HTTP server (no Vercel function timeouts),
 * so SSE connections can live for the full job duration (2-30 minutes).
 */

import { auth } from '../auth/index.js';
import { streamManager } from '../tools/stream-manager.js';

/**
 * GET handler for the SSE stream endpoint.
 *
 * @param {Request} request - Next.js App Router request
 * @param {{ params: Promise<{ jobId: string }> }} context - Route params
 * @returns {Response} SSE response with text/event-stream content type
 */
export async function GET(request, { params }) {
  // Auth check — SSE streams are operator-only
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      /**
       * Enqueue an SSE event frame.
       * Format: "data: {JSON}\n\n"
       *
       * @param {string} type - Semantic event type
       * @param {object} data - Additional event data fields
       */
      function enqueue(type, data) {
        try {
          const payload = JSON.stringify({ type, ...data });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // Controller may be closed if client disconnected — ignore
        }
      }

      // Send initial connection confirmation
      enqueue('connected', { jobId, ts: Date.now() });

      // Guard: job not found or already completed
      if (!streamManager.isActive(jobId)) {
        enqueue('error', { message: 'Job not found or already completed' });
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      // Subscribe to semantic events for this job
      const unsub = streamManager.subscribe(jobId, enqueue);

      // Clean up on client disconnect (browser tab close, navigation, network drop)
      request.signal.addEventListener('abort', () => {
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      }, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent nginx from buffering SSE frames
    },
  });
}
