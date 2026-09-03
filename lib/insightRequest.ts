import { endpointFor, PROVIDERS, type ApiShape, type ProviderId } from "./insightModels";

/**
 * Talking to a model that is not Claude.
 *
 * Anthropic's own SDK gives a schema guarantee (`messages.parse`), so the
 * direct-Anthropic path still uses it and is untouched. Everything reached
 * through OpenCode Go goes through here instead: three request shapes, no
 * schema enforcement worth relying on, and replies that routinely arrive
 * wrapped in prose or a markdown fence. The parsing below assumes the worst
 * because with open models the worst is normal.
 */

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildRequest(options: {
  provider: ProviderId;
  shape: ApiShape;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Sent so the gateway can group a conversation for prompt caching. */
  sessionId?: string;
}): BuiltRequest {
  const { provider, shape, model, apiKey, system, user, sessionId } = options;
  const maxTokens = options.maxTokens ?? 1500;
  const base = PROVIDERS[provider].baseUrl;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // OpenCode Go asks callers to identify themselves rather than send a
    // generic agent string, and to pass a session id so it can optimise
    // prompt caching. Both are conditions of not getting flagged.
    "User-Agent": "StreakWrapped/1.0 (habit insights)",
  };
  if (sessionId) headers["x-opencode-session"] = sessionId;

  if (provider === "anthropic" || shape === "anthropic") {
    // The Anthropic messages shape authenticates with x-api-key; the gateway
    // also accepts a bearer token, so both go out — the models reached this
    // way are served through two different conventions and this removes a
    // class of failure that is otherwise a silent 401.
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  if (provider !== "anthropic") {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (shape === "anthropic") {
    return {
      url: `${base}${endpointFor(shape)}`,
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    };
  }

  if (shape === "responses") {
    return {
      url: `${base}${endpointFor(shape)}`,
      headers,
      body: JSON.stringify({
        model,
        max_output_tokens: maxTokens,
        instructions: system,
        input: [{ role: "user", content: user }],
      }),
    };
  }

  return {
    url: `${base}${endpointFor(shape)}`,
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Asks for JSON where the endpoint honours it. Not every model behind
      // the gateway does, which is why the parser below never assumes it.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  };
}

/** Pulls the assistant's text out of whichever response shape came back. */
export function extractText(shape: ApiShape, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as Record<string, unknown>;

  if (shape === "anthropic") {
    const content = body.content;
    if (!Array.isArray(content)) return "";
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b && typeof b === "object" && (b as { type?: string }).type === "text",
      )
      .map((b) => b.text)
      .join("");
  }

  if (shape === "responses") {
    // The convenience field when present; otherwise walk the output blocks.
    if (typeof body.output_text === "string") return body.output_text;
    const output = body.output;
    if (!Array.isArray(output)) return "";
    const parts: string[] = [];
    for (const item of output) {
      const content = (item as { content?: unknown })?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const text = (block as { text?: unknown })?.text;
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join("");
  }

  const choices = body.choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  return typeof message?.content === "string" ? message.content : "";
}

/**
 * Finds the JSON object in a reply that may not be only JSON.
 *
 * Open models routinely answer with a markdown fence, a sentence of preamble,
 * or both, even when asked for bare JSON and even with response_format set.
 * Scanning for a balanced object is what makes the difference between a
 * feature that works across the catalogue and one that works on whichever
 * model it was tested against.
 */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;

  const direct = tryParse(text.trim());
  if (direct) return direct;

  // ```json … ``` or a bare fence.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  // Otherwise scan for the first balanced {...}, ignoring braces inside
  // strings so a value containing one cannot end the object early.
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return tryParse(text.slice(start, i + 1));
    }
  }
  return null;
}

function tryParse(candidate: string): unknown | null {
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export interface InsightFields {
  headline: string;
  reading: string;
  suggestion: string;
  basis: string;
}

/**
 * Accepts a reply only if every field is actually present.
 *
 * A partial object rendered as a card with blanks in it looks like a bug in
 * the app rather than a shortfall in the model, so a missing field is a
 * failure the caller can retry, not something to paper over with "".
 */
export function coerceInsight(value: unknown): InsightFields | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const text = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");

  const fields: InsightFields = {
    headline: text("headline"),
    reading: text("reading"),
    suggestion: text("suggestion"),
    basis: text("basis"),
  };
  if (!fields.headline || !fields.reading || !fields.suggestion) return null;
  if (!fields.basis) fields.basis = "the figures above";
  return fields;
}
