// SSE streaming of any Strands agent via async iterators.
// Protocol: `data: {"t":"..."}` text chunks, `data: {"tool":"name"}` status,
// `data: {"done":true,"full":"..."}` final (full text drives voice TTS).
import type { Agent } from "@strands-agents/sdk";

type AnyEvent = Record<string, unknown>;

function textOf(ev: AnyEvent): string | null {
  try {
    if (ev.type !== "modelStreamUpdateEvent") return null;
    const inner = ev.event as Record<string, unknown>;
    if (inner?.type !== "modelContentBlockDeltaEvent") return null;
    const delta = inner.delta as Record<string, unknown>;
    if (delta?.type !== "textDelta" || typeof delta.text !== "string") return null;
    return delta.text;
  } catch {
    return null;
  }
}

function toolOf(ev: AnyEvent): string | null {
  try {
    if (ev.type !== "modelStreamUpdateEvent") return null;
    const inner = ev.event as Record<string, unknown>;
    if (inner?.type !== "modelContentBlockStartEvent") return null;
    const start = inner.start as Record<string, unknown>;
    if (start?.type !== "toolUseStart" || typeof start.name !== "string") return null;
    return start.name;
  } catch {
    return null;
  }
}

export function sseStream(agent: Agent, prompt: string, onComplete?: (text: string) => void | Promise<void>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const send = (obj: unknown, c: ReadableStreamDefaultController<Uint8Array>) =>
    c.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  return new ReadableStream<Uint8Array>({
    async start(c) {
      let full = "";
      try {
        for await (const raw of agent.stream(prompt)) {
          const ev = raw as unknown as AnyEvent;
          const t = textOf(ev);
          if (t) {
            full += t;
            send({ t }, c);
          } else {
            const tool = toolOf(ev);
            if (tool) send({ tool }, c);
          }
        }
        try { await onComplete?.(full); } catch (persistError) { console.error("SSE persistence failed:", persistError); }
        send({ done: true, full }, c);
      } catch (e) {
        send({ error: String(e).slice(0, 300) }, c);
      } finally {
        c.close();
      }
    },
  });
}

// Word-chunked fallback stream (no AWS creds): identical SSE protocol.
export function sseFallback(text: string, ms = 25, onComplete?: (text: string) => void | Promise<void>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(c) {
      for (const w of text.split(/(\s+)/)) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ t: w })}\n\n`));
        await new Promise((r) => setTimeout(r, ms));
      }
      try { await onComplete?.(text); } catch (persistError) { console.error("SSE persistence failed:", persistError); }
      c.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, full: text })}\n\n`));
      c.close();
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
