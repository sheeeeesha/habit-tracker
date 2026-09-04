import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRequest,
  coerceInsight,
  extractJsonObject,
  extractText,
} from "./insightRequest";
import {
  DEFAULT_MODEL,
  MODELS,
  endpointFor,
  findModel,
  resolveShape,
} from "./insightModels";

describe("model catalogue", () => {
  it("gives every model a shape, since the wrong one is a 404", () => {
    for (const m of MODELS) {
      assert.ok(["anthropic", "chat", "responses"].includes(m.shape), `${m.id} has no shape`);
      assert.ok(m.label && m.family, `${m.id} is missing display fields`);
    }
  });

  it("has no duplicate ids", () => {
    const ids = MODELS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("routes each family to the shape its provider documents", () => {
    // These are the pairings that break silently if they drift.
    assert.equal(findModel("kimi-k3")?.shape, "chat");
    assert.equal(findModel("glm-5.3")?.shape, "chat");
    assert.equal(findModel("deepseek-v4-pro")?.shape, "chat");
    assert.equal(findModel("minimax-m3")?.shape, "anthropic");
    assert.equal(findModel("qwen3.7-plus")?.shape, "anthropic");
    assert.equal(findModel("grok-4.6")?.shape, "responses");
    assert.equal(findModel("gpt-5.6-luna")?.shape, "responses");
  });

  it("falls back sensibly for a model id typed in by hand", () => {
    // A catalogue entry that does not exist yet must still be usable.
    assert.equal(resolveShape("opencode-go", "some-new-model"), "chat");
    assert.equal(resolveShape("anthropic", "claude-something-new"), "anthropic");
  });

  it("points every default at a real entry", () => {
    for (const [provider, id] of Object.entries(DEFAULT_MODEL)) {
      const entry = findModel(id);
      assert.ok(entry, `default ${id} is not in the catalogue`);
      assert.equal(entry.provider, provider);
    }
  });

  it("maps shapes to the documented endpoints", () => {
    assert.equal(endpointFor("anthropic"), "/v1/messages");
    assert.equal(endpointFor("chat"), "/v1/chat/completions");
    assert.equal(endpointFor("responses"), "/v1/responses");
  });
});

describe("request building", () => {
  const base = {
    apiKey: "test-key",
    system: "SYS",
    user: "USER",
    sessionId: "sess-1",
  };

  it("sends the Anthropic shape to /v1/messages with x-api-key", () => {
    const req = buildRequest({
      ...base,
      provider: "anthropic",
      shape: "anthropic",
      model: "claude-opus-5",
    });
    assert.ok(req.url.endsWith("/v1/messages"));
    assert.equal(req.headers["x-api-key"], "test-key");
    assert.ok(req.headers["anthropic-version"]);
    assert.equal(req.headers.Authorization, undefined, "Anthropic direct takes no bearer");
    const body = JSON.parse(req.body);
    assert.equal(body.system, "SYS");
    assert.deepEqual(body.messages, [{ role: "user", content: "USER" }]);
  });

  it("sends both auth conventions for Anthropic-shaped models on the gateway", () => {
    // Those models are documented for the Anthropic SDK but reached through a
    // bearer-token gateway; sending one only is a silent 401.
    const req = buildRequest({
      ...base,
      provider: "opencode-go",
      shape: "anthropic",
      model: "minimax-m3",
    });
    assert.equal(req.headers["x-api-key"], "test-key");
    assert.equal(req.headers.Authorization, "Bearer test-key");
    assert.ok(req.url.startsWith("https://opencode.ai/zen/go/"));
  });

  it("sends the chat shape with a system message and a JSON request", () => {
    const req = buildRequest({
      ...base,
      provider: "opencode-go",
      shape: "chat",
      model: "glm-5.3",
    });
    assert.ok(req.url.endsWith("/v1/chat/completions"));
    const body = JSON.parse(req.body);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.response_format.type, "json_object");
  });

  it("sends the responses shape with instructions and max_output_tokens", () => {
    const req = buildRequest({
      ...base,
      provider: "opencode-go",
      shape: "responses",
      model: "grok-4.6",
    });
    assert.ok(req.url.endsWith("/v1/responses"));
    const body = JSON.parse(req.body);
    assert.equal(body.instructions, "SYS");
    assert.ok(body.max_output_tokens > 0);
    assert.equal(body.max_tokens, undefined, "responses uses max_output_tokens");
  });

  it("identifies itself and passes a session id, as the gateway asks", () => {
    const req = buildRequest({
      ...base,
      provider: "opencode-go",
      shape: "chat",
      model: "glm-5.3",
    });
    assert.match(req.headers["User-Agent"], /StreakWrapped/);
    assert.equal(req.headers["x-opencode-session"], "sess-1");
  });
});

describe("reading the reply", () => {
  it("pulls text out of each response shape", () => {
    assert.equal(
      extractText("anthropic", {
        content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "hello" }],
      }),
      "hello",
    );
    assert.equal(
      extractText("chat", { choices: [{ message: { content: "hello" } }] }),
      "hello",
    );
    assert.equal(extractText("responses", { output_text: "hello" }), "hello");
    assert.equal(
      extractText("responses", {
        output: [{ content: [{ type: "output_text", text: "hello" }] }],
      }),
      "hello",
    );
  });

  it("returns empty rather than throwing on a shape it did not expect", () => {
    assert.equal(extractText("chat", {}), "");
    assert.equal(extractText("anthropic", null), "");
    assert.equal(extractText("responses", { output: "nonsense" }), "");
  });
});

describe("finding the JSON", () => {
  const obj = { headline: "a", reading: "b", suggestion: "c", basis: "d" };

  it("reads a bare object", () => {
    assert.deepEqual(extractJsonObject(JSON.stringify(obj)), obj);
  });

  it("reads it out of a markdown fence", () => {
    assert.deepEqual(
      extractJsonObject("```json\n" + JSON.stringify(obj) + "\n```"),
      obj,
    );
    assert.deepEqual(extractJsonObject("```\n" + JSON.stringify(obj) + "\n```"), obj);
  });

  it("reads it out of surrounding prose, which open models add unprompted", () => {
    assert.deepEqual(
      extractJsonObject(`Sure! Here is the reading:\n${JSON.stringify(obj)}\nHope that helps.`),
      obj,
    );
  });

  it("is not fooled by a brace inside a string value", () => {
    const tricky = { headline: "a }", reading: "b {", suggestion: "c", basis: "d" };
    assert.deepEqual(extractJsonObject(`prose ${JSON.stringify(tricky)} more`), tricky);
  });

  it("handles an escaped quote before a brace", () => {
    const tricky = { headline: 'say \\"hi\\" }', reading: "b", suggestion: "c", basis: "d" };
    const parsed = extractJsonObject(JSON.stringify(tricky)) as typeof tricky;
    assert.equal(parsed.reading, "b");
  });

  it("returns null when there is no object at all", () => {
    assert.equal(extractJsonObject(""), null);
    assert.equal(extractJsonObject("I cannot help with that."), null);
    assert.equal(extractJsonObject("[1,2,3]"), null, "an array is not the object we want");
  });
});

describe("accepting the fields", () => {
  const obs = (over: Record<string, unknown> = {}) => ({
    title: "Sundays",
    body: "b",
    basis: "42%",
    chart: "weekday",
    ...over,
  });

  it("takes a complete reply", () => {
    const out = coerceInsight({
      headline: " Sundays ",
      observations: [obs(), obs({ title: "Recovery", chart: "recovery" })],
    });
    assert.equal(out?.headline, "Sundays", "should be trimmed");
    assert.equal(out?.observations.length, 2);
    assert.equal(out?.observations[0].chart, "weekday");
  });

  it("rejects a partial reply rather than rendering blanks", () => {
    assert.equal(coerceInsight({ observations: [obs(), obs()] }), null, "no headline");
    assert.equal(coerceInsight({ headline: "a" }), null, "no observations");
    assert.equal(coerceInsight({ headline: "a", observations: "nope" }), null);
    assert.equal(coerceInsight(null), null);
    assert.equal(coerceInsight("a string"), null);
  });

  it("rejects a reading too thin to be worth showing", () => {
    // One observation is not a reading; it is the old single-paragraph shape
    // wearing the new one's clothes.
    assert.equal(coerceInsight({ headline: "a", observations: [obs()] }), null);
  });

  it("drops observations missing their claim, and fails if too few survive", () => {
    assert.equal(
      coerceInsight({ headline: "a", observations: [obs(), obs({ body: "" }), obs()] })
        ?.observations.length,
      2,
    );
    assert.equal(
      coerceInsight({ headline: "a", observations: [obs(), obs({ title: "" })] }),
      null,
    );
  });

  it("keeps at most three, however many arrive", () => {
    const out = coerceInsight({
      headline: "a",
      observations: [obs(), obs(), obs(), obs(), obs()],
    });
    assert.equal(out?.observations.length, 3);
  });

  it("fills in only the citation, which is presentational", () => {
    const out = coerceInsight({
      headline: "a",
      observations: [obs({ basis: "" }), obs()],
    });
    assert.equal(out?.observations[0].basis, "the figures above");
  });

  it("drops an unknown chart instead of failing the whole reading", () => {
    // "none" is in the schema the model is given; anything else is a model
    // inventing a chart. Either way the prose is still good.
    const out = coerceInsight({
      headline: "a",
      observations: [obs({ chart: "none" }), obs({ chart: "piechart" }), obs({ chart: 7 })],
    });
    assert.equal(out?.observations[0].chart, null);
    assert.equal(out?.observations[1].chart, null);
    assert.equal(out?.observations[2].chart, null);
  });
});
