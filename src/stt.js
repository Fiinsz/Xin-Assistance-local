const STT_URL = (
  process.env.FASTER_WHISPER_URL || "http://127.0.0.1:8002/transcribe"
).trim();
const STT_TIMEOUT_MS = Number(process.env.FASTER_WHISPER_TIMEOUT_MS || 120000);

export async function transcribeSpeech(
  audio,
  contentType = "audio/webm"
) {
  const response = await fetch(STT_URL, {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body: audio,
    signal: AbortSignal.timeout(STT_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`faster-whisper returned HTTP ${response.status}: ${errorBody}`);
  }

  return response.json();
}
