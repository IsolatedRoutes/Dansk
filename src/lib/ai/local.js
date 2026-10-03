// ============================================================
// AI backends
// Two interchangeable ways to run the AI features: a small model
// running entirely in your browser (WebGPU, no key, free, but
// noticeably weaker at Danish), or your own Anthropic API key
// (higher quality, small per-use cost). You choose in AI settings
// in the Chat tab. Photo import always needs the API key, since
// reading images needs a much bigger model than a "very small" one.
// ============================================================

export const LOCAL_MODEL_OPTIONS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0.5B — recommended on phones (~500MB)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B — better quality, needs more memory (~1GB)" },
];

export const LOCAL_MODEL_ID = LOCAL_MODEL_OPTIONS[0].id;

export let localEnginePromise = null;

let localEngineModelId = null;

export async function getLocalEngine(onProgress, modelId) {
  const targetModel = modelId || LOCAL_MODEL_ID;
  // A different model needs a fresh engine.
  if (localEnginePromise && localEngineModelId !== targetModel) {
    localEnginePromise = null;
  }
  if (!localEnginePromise) {
    localEngineModelId = targetModel;
    localEnginePromise = (async () => {
      if (typeof navigator === "undefined" || !navigator.gpu) {
        throw new Error("WEBGPU_UNSUPPORTED");
      }
      let webllm;
      try {
        webllm = await import("https://esm.run/@mlc-ai/web-llm");
      } catch {
        throw new Error("LOCAL_MODEL_LOAD_FAILED");
      }
      let engine;
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          engine = await webllm.CreateMLCEngine(targetModel, {
            initProgressCallback: (report) => {
              if (onProgress) onProgress(report);
            },
          });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1500)); // brief pause before one retry
        }
      }
      if (lastError) {
        // Surface the real reason (usually a network/download failure
        // reaching Hugging Face) instead of a bare generic message.
        throw new Error("LOCAL_MODEL_LOAD_FAILED: " + (lastError && lastError.message ? lastError.message : lastError));
      }
      return engine;
    })().catch((e) => {
      localEnginePromise = null; // allow retrying later
      throw e;
    });
  }
  return localEnginePromise;
}

export async function callLocalText(system, userText, opts) {
  const history = (opts && opts.history) || [];
  const onProgress = opts && opts.onProgress;
  const engine = await getLocalEngine(onProgress);
  // Small local models follow a normal conversational system prompt much
  // less reliably than Gemini/Claude — they'll sometimes just answer in
  // English instead of actually producing Danish. Spelling this out in
  // blunt, repeated, explicit terms measurably helps smaller models
  // comply, even though it reads as redundant for a stronger model.
  const reinforcedSystem =
    system +
    " IMPORTANT: When asked for Danish, you must write actual Danish words and sentences — never just repeat or rephrase the English. Double-check that any Danish text you produce is genuinely Danish before responding.";
  const messages = [{ role: "system", content: reinforcedSystem }, ...history, { role: "user", content: userText }];
  const reply = await engine.chat.completions.create({ messages });
  return reply.choices[0].message.content;
}
