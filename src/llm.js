"use strict";
/**
 * Tiny provider-agnostic chatbot client.
 * Internal message shape:
 *   { role: 'user'|'assistant'|'tool', content: string,
 *     toolCalls?: [{ id, name, arguments }], toolCallId?, name? }
 */

class LLMError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

/* ---------------- SSE helpers ---------------- */

async function* sseData(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) yield data;
      }
    }
  }
}

async function httpError(res) {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message || j?.message || text;
    } catch {
      detail = text;
    }
  } catch {}
  detail = (detail || "").slice(0, 400);
  if (res.status === 401 || res.status === 403) {
    return new LLMError(`The API key was rejected (${res.status}). ${detail}`, res.status);
  }
  return new LLMError(`Request failed (${res.status}). ${detail}`, res.status);
}

/* ---------------- OpenAI-compatible ---------------- */

function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments || "{}" },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function openaiChat({ baseUrl, model, apiKey, messages, tools, signal, onText, stream = true }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const body = { model, messages: toOpenAIMessages(messages), stream, temperature: 0.6 };
  if (tools?.length) body.tools = tools;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await httpError(res);

  if (!stream) {
    const j = await res.json();
    const msg = j.choices?.[0]?.message || {};
    return {
      text: msg.content || "",
      toolCalls: (msg.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments || "{}",
      })),
    };
  }

  let text = "";
  const calls = [];
  for await (const data of sseData(res)) {
    if (data === "[DONE]") break;
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    const delta = j.choices?.[0]?.delta;
    if (!delta) continue;
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      onText?.(delta.content);
    }
    for (const tc of delta.tool_calls || []) {
      const i = tc.index ?? calls.length;
      if (!calls[i]) calls[i] = { id: "", name: "", arguments: "" };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].name += tc.function.name;
      if (tc.function?.arguments) calls[i].arguments += tc.function.arguments;
    }
  }
  return { text, toolCalls: calls.filter((c) => c && c.name) };
}

/* ---------------- Anthropic ---------------- */

function toAnthropic(messages) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const out = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      const blocks = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls || []) {
        let input = {};
        try { input = JSON.parse(tc.arguments || "{}"); } catch {}
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input });
      }
      if (!blocks.length) continue;
      out.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content) && last._grouped) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block], _grouped: true });
      }
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  for (const m of out) delete m._grouped;
  return { system, messages: out };
}

async function anthropicChat({ baseUrl, model, apiKey, messages, tools, signal, onText, stream = true }) {
  const { system, messages: msgs } = toAnthropic(messages);
  const body = {
    model,
    max_tokens: 2048,
    system: system || undefined,
    messages: msgs,
    stream,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await httpError(res);

  if (!stream) {
    const j = await res.json();
    let text = "";
    const toolCalls = [];
    for (const b of j.content || []) {
      if (b.type === "text") text += b.text;
      if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, arguments: JSON.stringify(b.input || {}) });
    }
    return { text, toolCalls };
  }

  let text = "";
  const blocks = {}; // index -> {type, text, id, name, json}
  for await (const data of sseData(res)) {
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    if (j.type === "content_block_start") {
      const b = j.content_block || {};
      blocks[j.index] = { type: b.type, text: b.text || "", id: b.id, name: b.name, json: "" };
    } else if (j.type === "content_block_delta") {
      const b = blocks[j.index];
      if (!b) continue;
      if (j.delta?.type === "text_delta") {
        b.text += j.delta.text || "";
        text += j.delta.text || "";
        onText?.(j.delta.text || "");
      } else if (j.delta?.type === "input_json_delta") {
        b.json += j.delta.partial_json || "";
      }
    } else if (j.type === "error") {
      throw new LLMError(j.error?.message || "Anthropic stream error", 500);
    }
  }

  const toolCalls = Object.values(blocks)
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, arguments: b.json || "{}" }));
  return { text, toolCalls };
}

/* ---------------- public API ---------------- */

async function streamChat(opts) {
  const f = opts.kind === "anthropic" ? anthropicChat : openaiChat;
  return f(opts);
}

async function testConnection(settings) {
  try {
    const res = await streamChat({
      ...settings,
      messages: [
        { role: "system", content: "You are a connectivity test bot." },
        { role: "user", content: "Reply with exactly: bobby online" },
      ],
      tools: [],
      stream: false,
      signal: AbortSignal.timeout(45000),
    });
    return { ok: true, reply: (res.text || "").slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { streamChat, testConnection, LLMError };
