import { buildHeaders, describeApiFailure, fetchAndParse } from "./http";

export async function callClaudeText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  const headers = await buildHeaders();
  const { res, data } = await fetchAndParse("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [...history, { role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw describeApiFailure(res, data);
  const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!reply.trim()) throw new Error("RESPONSE_NOT_JSON: (empty response)");
  return reply;
}

export async function callClaudeImage(system, userText, base64, mediaType, maxTokens) {
  const headers = await buildHeaders();
  const { res, data } = await fetchAndParse("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens || 1500,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw describeApiFailure(res, data);
  const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!reply.trim()) throw new Error("RESPONSE_NOT_JSON: (empty response)");
  return reply;
}
