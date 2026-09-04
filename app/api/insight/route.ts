import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  buildRequest,
  coerceInsight,
  extractJsonObject,
  extractText,
} from "@/lib/insightRequest";
import {
  DEFAULT_MODEL,
  resolveShape,
  type ProviderId,
} from "@/lib/insightModels";

/**
 * Writes a short reading of one habit's already-computed statistics.
 *
 * Two ways in. The deployment can supply an Anthropic key through the
 * environment, or a person can bring their own key for Anthropic or OpenCode
 * Go and have it sent per request.
 *
 * A caller's key is used for exactly one outbound call and then goes out of
 * scope. It is never written down, never attached to an error, and never
 * logged — including in the failure paths below, which deliberately return
 * fixed strings rather than anything derived from the upstream response.
 *
 * It has to pass through here at all only because OpenCode Go sends no CORS
 * headers, so the browser cannot reach it directly. That is worth knowing if
 * anyone but the deployment's owner ever types a key into this app: their key
 * transits this server, and they are trusting whoever runs it.
 */

export const runtime = "nodejs";

const ChartEnum = z
  .enum(["automaticity", "trend", "weekday", "recovery", "none"])
  .describe(
    "Which chart the app should draw beside this observation, or 'none'. You are choosing from charts the app already draws from its own figures — you never supply chart data.",
  );

const InsightSchema = z.object({
  headline: z
    .string()
    .describe("At most 8 words naming the overall pattern. No greeting, no praise."),
  observations: z
    .array(
      z.object({
        title: z
          .string()
          .describe("At most 6 words. The claim itself, not a topic label."),
        body: z
          .string()
          .describe(
            "One or two sentences on what this shows that is not obvious from glancing at the chart. Cite the actual figures.",
          ),
        basis: z
          .string()
          .describe("The single figure this rests on, quoted, so the reader can check it."),
        chart: ChartEnum,
      }),
    )
    .min(2)
    .max(3)
    .describe("Two or three separate observations. Each must stand on its own."),
});

const SYSTEM = `You read habit-tracking statistics and write a short, specific interpretation.

WHAT YOU ARE GIVEN
Every number in the payload has already been computed by the app and is displayed on the same screen as your reading. Your job is to interpret them.

RULES
- Never state a number that is not in the payload. Do not add, average, project, or estimate. If you want to say something a figure does not support, say something else.
- No greetings, no praise, no exclamation marks, no emoji. "Great job" is not a reading.
- Say something the person could not see by glancing at the chart. If the only honest observation is obvious, say the obvious thing plainly rather than inflating it.
- Two or three observations, each standing on its own. Do not restate one in different words to reach three — two good ones beat three padded.
- At least one of them should be actionable: concrete enough to act on tomorrow. "Be more consistent" is not actionable; "move it before your commute on Sundays" is.
- Address the person as "you". Be direct and unsentimental. British spelling.

CHOOSING A CHART
Each observation may name one chart for the app to draw beside it, or "none". You are picking from charts the app draws itself, from its own figures — you never supply the data, and a chart you name will show the real numbers whether or not they support what you wrote.
- "automaticity" — repetitions so far against the Lally curve. For anything about how established the habit is.
- "trend" — completion rate over time. For direction of travel.
- "weekday" — completion rate per weekday. Daily habits only, and only when the profile is uneven.
- "recovery" — came back against slid into two. For anything about what happens after a miss.
- "none" — when no chart adds to the point. Preferred over a loosely related one; a chart that does not match its paragraph reads as a mistake.
Do not name the same chart twice.

WHAT HAS CHANGED SINCE LAST TIME
If the payload has a "since" block, a previous reading exists and the differences in it have already been calculated for you. Use them: what moved since then is usually the most interesting thing on the page. Never compute a change yourself, and never compare against a figure that is not in that block.
If "since" is absent or null, this is the first reading — say nothing about change, progress, or improvement, because you have nothing to compare against.
"since.alreadySaid" lists what previous readings led with. Do not make those points again unless the underlying figure has moved enough to be worth revisiting, in which case say what moved.

WHAT THE RESEARCH SAYS, so your reading is consistent with the rest of the app
- Automaticity climbs with repetitions, not elapsed days (Lally et al. 2010). The median to near-automatic was 66 repetitions, with an individual range of 18 to 254 — so never promise a date, and never imply the median is a deadline.
- A single missed period does not measurably harm habit formation. What does the damage is the second miss in a row: the abstinence violation effect, where one lapse reframes the goal as already broken. If the numbers show frequent slides into two, that is the most important thing on the page.
- Habits attach to stable context. An uneven weekday profile is usually a routine that does not hold on that day, not weak character — treat it as a scheduling problem.
- A person's typical run length is a fairer read of them than their record.

If the figures are unremarkable, say so honestly rather than manufacturing a pattern.`;

/** Appended for models with no schema enforcement to lean on. */
const JSON_INSTRUCTION = `

OUTPUT
Reply with a single JSON object and nothing else. No markdown fence, no commentary before or after it.
{"headline": string, "observations": [{"title": string, "body": string, "basis": string, "chart": "automaticity" | "trend" | "weekday" | "recovery" | "none"}]}
Give two or three observations.`;

const ok = (fields: unknown) => Response.json(fields);
const fail = (message: string, status: number) =>
  Response.json({ error: message }, { status });

export async function POST(request: Request) {
  // The caller's key arrives in a header, not the body, so it cannot end up in
  // a request-body log alongside the payload.
  const callerKey = request.headers.get("x-insight-key")?.trim() || null;
  const providerHeader = request.headers.get("x-insight-provider")?.trim();
  const modelHeader = request.headers.get("x-insight-model")?.trim();
  const sessionId = request.headers.get("x-insight-session")?.trim() || undefined;

  const provider: ProviderId =
    providerHeader === "opencode-go" ? "opencode-go" : "anthropic";
  const model = modelHeader || DEFAULT_MODEL[provider];

  const envKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  // A caller's own key wins; the deployment's key is the fallback and only
  // ever works for Anthropic.
  const apiKey = callerKey ?? (provider === "anthropic" ? envKey : null);

  if (!apiKey) {
    return fail(
      callerKey === null && provider === "opencode-go"
        ? "Add your OpenCode Go key in Settings first."
        : "Written insights are not configured. Add a key in Settings.",
      501,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail("Malformed request.", 400);
  }

  // This endpoint only ever receives one small statistics object, so anything
  // large is either a bug or an attempt to use the deployment as a free proxy.
  const serialised = JSON.stringify(payload);
  if (!serialised || serialised.length > 4000) {
    return fail("Unexpected request shape.", 400);
  }

  const userContent = `Here are the computed statistics for one habit. Write the reading.\n\n${serialised}`;

  // Anthropic direct keeps the SDK path: `messages.parse` enforces the schema,
  // which is a real guarantee and worth not giving up for uniformity.
  if (provider === "anthropic") {
    return callAnthropic(apiKey, model, userContent);
  }

  return callGateway({ provider, model, apiKey, userContent, sessionId });
}

async function callAnthropic(apiKey: string, model: string, userContent: string) {
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(InsightSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return fail("The model declined to answer this one.", 422);
    }
    const parsed = response.parsed_output;
    if (!parsed) return fail("Could not read the response. Try again.", 502);
    return ok(parsed);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return fail("That Anthropic key was rejected.", 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail("Rate limited. Try again shortly.", 429);
    }
    if (error instanceof Anthropic.NotFoundError) {
      return fail("That model id was not recognised.", 404);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return fail("Couldn't reach the model.", 503);
    }
    if (error instanceof Anthropic.APIError) {
      return fail("The model call failed.", 502);
    }
    return fail("Something went wrong.", 500);
  }
}

async function callGateway(options: {
  provider: ProviderId;
  model: string;
  apiKey: string;
  userContent: string;
  sessionId?: string;
}) {
  const { provider, model, apiKey, userContent, sessionId } = options;
  const shape = resolveShape(provider, model);

  const req = buildRequest({
    provider,
    shape,
    model,
    apiKey,
    // No schema enforcement out here, so the format is spelled out in words.
    system: SYSTEM + JSON_INSTRUCTION,
    user: userContent,
    sessionId,
  });

  let upstream: Response;
  try {
    upstream = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return fail("Couldn't reach the model.", 503);
  }

  if (!upstream.ok) {
    // Fixed strings rather than the upstream body: an error from a gateway can
    // echo request details back, and none of that should reach a client.
    if (upstream.status === 401 || upstream.status === 403) {
      return fail("That key was rejected.", 401);
    }
    if (upstream.status === 404) return fail("That model id was not recognised.", 404);
    if (upstream.status === 429) return fail("Rate limited, or the plan's limit is used up.", 429);
    return fail("The model call failed.", 502);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return fail("The model returned something unreadable.", 502);
  }

  const fields = coerceInsight(extractJsonObject(extractText(shape, body)));
  if (!fields) {
    return fail(
      "That model didn't return a usable reading. Try again, or pick a different one.",
      502,
    );
  }
  return ok(fields);
}
