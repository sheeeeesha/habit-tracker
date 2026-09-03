import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Writes a short reading of one habit's already-computed statistics.
 *
 * Server-side because the API key must never reach the browser. Note the env
 * var has no NEXT_PUBLIC_ prefix, deliberately — that prefix is what inlines a
 * value into the client bundle, and doing it here would publish the key to
 * everyone who loads the page.
 *
 * The model is given numbers and asked to interpret them. It is told, and the
 * schema enforces, that it must cite which figure it used; every number it can
 * mention is one this app computed and is already showing on the same screen.
 * That is what stops a written insight from quietly inventing a statistic —
 * the reading can be wrong about meaning, which is arguable, but it cannot be
 * wrong about arithmetic.
 */

export const runtime = "nodejs";

const InsightSchema = z.object({
  headline: z
    .string()
    .describe("At most 8 words naming the pattern. No greeting, no praise."),
  reading: z
    .string()
    .describe(
      "Two or three sentences on what these numbers show that is not obvious from looking at them. Cite the actual figures.",
    ),
  suggestion: z
    .string()
    .describe(
      "One concrete change to try, specific to this pattern. Not 'stay consistent'.",
    ),
  basis: z
    .string()
    .describe(
      "The single figure this reading rests on, quoted, so the reader can check it.",
    ),
});

const SYSTEM = `You read habit-tracking statistics and write a short, specific interpretation.

WHAT YOU ARE GIVEN
Every number in the payload has already been computed by the app and is displayed on the same screen as your reading. Your job is to interpret them.

RULES
- Never state a number that is not in the payload. Do not add, average, project, or estimate. If you want to say something a figure does not support, say something else.
- No greetings, no praise, no exclamation marks, no emoji. "Great job" is not a reading.
- Say something the person could not see by glancing at the chart. If the only honest observation is obvious, say the obvious thing plainly rather than inflating it.
- One suggestion, concrete enough to act on tomorrow. "Be more consistent" is not a suggestion; "move it before your commute on Sundays" is.
- Address the person as "you". Be direct and unsentimental. British spelling.

WHAT THE RESEARCH SAYS, so your reading is consistent with the rest of the app
- Automaticity climbs with repetitions, not elapsed days (Lally et al. 2010). The median to near-automatic was 66 repetitions, with an individual range of 18 to 254 — so never promise a date, and never imply the median is a deadline.
- A single missed period does not measurably harm habit formation. What does the damage is the second miss in a row: the abstinence violation effect, where one lapse reframes the goal as already broken. If the numbers show frequent slides into two, that is the most important thing on the page.
- Habits attach to stable context. An uneven weekday profile is usually a routine that does not hold on that day, not weak character — treat it as a scheduling problem.
- A person's typical run length is a fairer read of them than their record.

If the figures are unremarkable, say so honestly rather than manufacturing a pattern.`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Written insights are not configured on this deployment." },
      { status: 501 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  // A crude size guard: this endpoint only ever receives one small statistics
  // object, so anything large is either a bug or someone using the deployment
  // as a free proxy to the model.
  const serialised = JSON.stringify(payload);
  if (!serialised || serialised.length > 4000) {
    return Response.json({ error: "Unexpected request shape." }, { status: 400 });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(InsightSchema),
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here are the computed statistics for one habit. Write the reading.\n\n${serialised}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json(
        { error: "The model declined to answer this one." },
        { status: 422 },
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return Response.json(
        { error: "Could not read the response. Try again." },
        { status: 502 },
      );
    }

    return Response.json(parsed);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "The insight service is misconfigured." },
        { status: 500 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Too many requests just now. Try again shortly." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return Response.json({ error: "Couldn't reach the model." }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: "The model call failed." }, { status: 502 });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
