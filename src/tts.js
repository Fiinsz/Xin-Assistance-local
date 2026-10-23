const TTS_URL = (
  process.env.KITTENTTS_URL || "http://127.0.0.1:8001/synthesize"
).trim();
const TTS_TIMEOUT_MS = Number(process.env.KITTENTTS_TIMEOUT_MS || 300000);
const TTS_RETRIES = 2;

export async function synthesizeSpeech(text) {
  let lastError;

  for (let attempt = 1; attempt <= TTS_RETRIES; attempt += 1) {
    try {
      const response = await fetch(TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `KittenTTS returned HTTP ${response.status}: ${errorBody}`
        );
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < TTS_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  throw new Error(
    `Unable to reach KittenTTS at ${TTS_URL}: ${lastError?.message}`,
    { cause: lastError }
  );
}

export async function synthesizeSpeechBuffer(text) {
  const response = await synthesizeSpeech(text);
  return {
    audio: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "audio/wav"
  };
}
