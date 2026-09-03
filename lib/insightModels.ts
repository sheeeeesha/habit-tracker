/**
 * Where a written insight can be generated, and how to talk to each place.
 *
 * OpenCode Go fronts a lot of open models behind three different API shapes,
 * and which shape a model wants is a property of the model, not the provider —
 * Kimi speaks OpenAI chat-completions, MiniMax and Qwen speak the Anthropic
 * messages shape, Grok speaks OpenAI responses. Getting that wrong is a 404 or
 * a silently empty reply, so it is recorded per model here rather than guessed
 * at the call site.
 *
 * The catalogue is static on purpose. Go publishes a live model list, but the
 * browser cannot read it (no CORS) and a runtime fetch would put a network
 * call in front of a settings dropdown. A stale entry is not a dead end
 * either: any model id can be typed in by hand, and an unknown id falls back
 * to the chat-completions shape, which is what most of them speak.
 */

/** The request/response shape a model expects. */
export type ApiShape = "anthropic" | "chat" | "responses";

export type ProviderId = "anthropic" | "opencode-go";

export interface Provider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  /** Where someone gets a key, shown next to the field. */
  keyHint: string;
  keyPrefixHint: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    keyHint: "console.anthropic.com",
    keyPrefixHint: "sk-ant-…",
  },
  "opencode-go": {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go",
    keyHint: "opencode.ai — the Go subscription",
    keyPrefixHint: "your Go API key",
  },
};

export interface ModelEntry {
  id: string;
  label: string;
  provider: ProviderId;
  shape: ApiShape;
  /** Grouping for the picker. */
  family: string;
  /**
   * A rough steer for a task that is a few hundred tokens in and a paragraph
   * out. "cheap" models are the ones Go's own tables allow tens of thousands
   * of requests a month on.
   */
  note?: string;
}

export const MODELS: ModelEntry[] = [
  // --- Anthropic, direct -------------------------------------------------
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    provider: "anthropic",
    shape: "anthropic",
    family: "Claude",
    note: "Best writing; roughly a penny a reading.",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    shape: "anthropic",
    family: "Claude",
    note: "Cheaper, still very capable.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    shape: "anthropic",
    family: "Claude",
    note: "Cheapest Claude.",
  },

  // --- OpenCode Go: OpenAI responses shape -------------------------------
  { id: "grok-4.6", label: "Grok 4.6", provider: "opencode-go", shape: "responses", family: "Grok" },
  {
    id: "gpt-5.6-luna",
    label: "GPT 5.6 Luna",
    provider: "opencode-go",
    shape: "responses",
    family: "GPT",
  },
  {
    id: "muse-spark-1.3-contributor",
    label: "Muse Spark 1.3 (Contributor)",
    provider: "opencode-go",
    shape: "responses",
    family: "Muse Spark",
    note: "Cheapest tier — but prompts are used to train future models.",
  },
  {
    id: "muse-spark-1.2-contributor",
    label: "Muse Spark 1.2 (Contributor)",
    provider: "opencode-go",
    shape: "responses",
    family: "Muse Spark",
    note: "Cheapest tier — but prompts are used to train future models.",
  },

  // --- OpenCode Go: OpenAI chat-completions shape ------------------------
  { id: "glm-5.3", label: "GLM-5.3", provider: "opencode-go", shape: "chat", family: "GLM" },
  {
    id: "glm-5.3-flash",
    label: "GLM-5.3 Flash",
    provider: "opencode-go",
    shape: "chat",
    family: "GLM",
    note: "Cheap.",
  },
  { id: "glm-5.2", label: "GLM-5.2", provider: "opencode-go", shape: "chat", family: "GLM" },
  { id: "glm-5.1", label: "GLM-5.1", provider: "opencode-go", shape: "chat", family: "GLM" },
  { id: "kimi-k3", label: "Kimi K3", provider: "opencode-go", shape: "chat", family: "Kimi" },
  {
    id: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    provider: "opencode-go",
    shape: "chat",
    family: "Kimi",
  },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "opencode-go", shape: "chat", family: "Kimi" },
  {
    id: "longcat-2.0",
    label: "LongCat 2.0",
    provider: "opencode-go",
    shape: "chat",
    family: "LongCat",
    note: "Very cheap.",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "opencode-go",
    shape: "chat",
    family: "DeepSeek",
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "opencode-go",
    shape: "chat",
    family: "DeepSeek",
    note: "Cheap.",
  },
  {
    id: "deepseek-v4-flash-vision-exp",
    label: "DeepSeek V4 Flash Vision",
    provider: "opencode-go",
    shape: "chat",
    family: "DeepSeek",
  },
  {
    id: "mimo-v2.5",
    label: "MiMo V2.5",
    provider: "opencode-go",
    shape: "chat",
    family: "MiMo",
    note: "Cheapest of the lot.",
  },
  {
    id: "mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    provider: "opencode-go",
    shape: "chat",
    family: "MiMo",
  },
  { id: "hy4-preview", label: "Hy4 (preview)", provider: "opencode-go", shape: "chat", family: "Hy" },
  { id: "hy3", label: "Hy3", provider: "opencode-go", shape: "chat", family: "Hy" },

  // --- OpenCode Go: Anthropic messages shape -----------------------------
  {
    id: "minimax-m3",
    label: "MiniMax M3",
    provider: "opencode-go",
    shape: "anthropic",
    family: "MiniMax",
  },
  {
    id: "minimax-m2.7",
    label: "MiniMax M2.7",
    provider: "opencode-go",
    shape: "anthropic",
    family: "MiniMax",
  },
  {
    id: "minimax-m2.5",
    label: "MiniMax M2.5",
    provider: "opencode-go",
    shape: "anthropic",
    family: "MiniMax",
  },
  {
    id: "qwen3.8-max",
    label: "Qwen3.8 Max",
    provider: "opencode-go",
    shape: "anthropic",
    family: "Qwen",
  },
  {
    id: "qwen3.8-flash",
    label: "Qwen3.8 Flash",
    provider: "opencode-go",
    shape: "anthropic",
    family: "Qwen",
    note: "Cheap.",
  },
  {
    id: "qwen3.7-max",
    label: "Qwen3.7 Max",
    provider: "opencode-go",
    shape: "anthropic",
    family: "Qwen",
  },
  {
    id: "qwen3.7-plus",
    label: "Qwen3.7 Plus",
    provider: "opencode-go",
    shape: "anthropic",
    family: "Qwen",
  },
  {
    id: "qwen3.6-plus",
    label: "Qwen3.6 Plus",
    provider: "opencode-go",
    shape: "anthropic",
    family: "Qwen",
  },
];

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-opus-5",
  "opencode-go": "glm-5.3",
};

export function findModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsFor(provider: ProviderId): ModelEntry[] {
  return MODELS.filter((m) => m.provider === provider);
}

/**
 * How to call a model id, including one this catalogue has never heard of.
 *
 * A typed-in id resolves by provider rather than failing: chat-completions is
 * the shape most open models speak, so it is the safest guess, and an
 * Anthropic key means the Anthropic shape by definition.
 */
export function resolveShape(provider: ProviderId, modelId: string): ApiShape {
  return findModel(modelId)?.shape ?? (provider === "anthropic" ? "anthropic" : "chat");
}

/** Endpoint path for a shape, appended to the provider's base URL. */
export function endpointFor(shape: ApiShape): string {
  if (shape === "anthropic") return "/v1/messages";
  if (shape === "responses") return "/v1/responses";
  return "/v1/chat/completions";
}
