/**
 * The one place that calls Claude.
 *
 * Two things ask it for something: the generator (a workout) and the reply
 * reader (what a reply says). Both want JSON in a known shape, and both have
 * to cope with the same things going wrong, so the call lives here once.
 *
 * Structured output constrains the response to the schema, which is what
 * makes the email layout and the progress tracking possible at all. It does
 * not make the content sensible; the callers check that.
 */

import Anthropic from "@anthropic-ai/sdk";

/** The current Opus. Writing a good session is the product. */
export const MODEL = "claude-opus-5-5";

export class ClaudeError extends Error {}

export interface JsonRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /**
   * How hard to think. A workout is worth thinking about; reading "A 40 x 10
   * 10 9" is not.
   */
  effort: "low" | "medium" | "high";
  /** A generous ceiling: thinking is billed and capped out of the same budget. */
  maxTokens: number;
}

/**
 * The text that counts.
 *
 * With refusal fallbacks on, a response can carry the start of one model's
 * answer, a fallback marker, and then another model's complete answer. Only
 * what follows the last marker is a whole answer; anything before it is a
 * fragment of JSON that would fail to parse.
 */
export function finalText(content: ReadonlyArray<{ type: string; text?: string }>): string {
  let start = 0;
  content.forEach((block, at) => {
    if (block.type === "fallback") start = at + 1;
  });

  return content
    .slice(start)
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}

export async function askForJson(request: JsonRequest): Promise<unknown> {
  const client = new Anthropic();

  /*
   * Streamed rather than awaited whole, because the response can be long
   * enough that a non-streaming request risks the SDK's HTTP timeout.
   *
   * Refusal fallbacks are on. Nothing here should ever be declined, but a
   * false positive on a fitness prompt would otherwise cost a workout, and
   * with "default" the API reroutes rather than stopping.
   */
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: request.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: request.effort,
      format: { type: "json_schema", schema: request.schema },
    },
    system: request.system,
    messages: [{ role: "user", content: request.user }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new ClaudeError(
      `The model declined to answer (${message.stop_details?.category ?? "no category"}).`,
    );
  }

  if (message.stop_reason === "max_tokens") {
    // Cut off mid-object. Better to retry than to send half a workout.
    throw new ClaudeError(`Ran out of tokens at ${request.maxTokens}.`);
  }

  const text = finalText(message.content);
  if (!text) throw new ClaudeError("The model returned no text.");

  try {
    return JSON.parse(text);
  } catch {
    throw new ClaudeError(`The model returned something that is not JSON: ${text.slice(0, 120)}`);
  }
}
