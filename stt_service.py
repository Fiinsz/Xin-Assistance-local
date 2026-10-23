import json
import os
import sys
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if os.name == "nt" and sys.flags.utf8_mode != 1:
    os.execv(sys.executable, [sys.executable, "-X", "utf8", *sys.argv])

from faster_whisper import WhisperModel


HOST = os.environ.get("FASTER_WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("FASTER_WHISPER_PORT", "8002"))
MODEL_SIZE = os.environ.get("FASTER_WHISPER_MODEL", "small")
DEVICE = os.environ.get("FASTER_WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "int8")
SUPPORTED_LANGUAGES = frozenset(("en", "id"))

print(
    f"Loading faster-whisper model {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})...",
    flush=True,
)
MODEL = WhisperModel(
    MODEL_SIZE,
    device=DEVICE,
    compute_type=COMPUTE_TYPE,
    download_root=os.environ.get("FASTER_WHISPER_MODEL_DIR"),
)
print("faster-whisper is ready.", flush=True)


def normalize_phrase(text: str) -> str:
    return " ".join(text.lower().split())


def merge_deduped_segments(segments) -> str:
    phrases = []
    previous_normalized = ""

    for segment in segments:
        phrase = segment.text.strip()
        if not phrase:
            continue

        normalized = normalize_phrase(phrase)
        if normalized == previous_normalized:
            continue

        phrases.append(phrase)
        previous_normalized = normalized

    return " ".join(phrases).strip()


class STTHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/transcribe":
            self._send_json(404, {"error": "Not found."})
            return

        temporary_path = None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 25 * 1024 * 1024:
                self._send_json(400, {"error": "Audio must be 1-25 MB."})
                return

            audio = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "audio/webm").split(
                ";", 1
            )[0].lower()
            suffix = {
                "audio/ogg": ".ogg",
                "audio/wav": ".wav",
                "audio/x-wav": ".wav",
                "audio/mp4": ".mp4",
                "audio/mpeg": ".mp3",
            }.get(content_type, ".webm")
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
                temporary_file.write(audio)
                temporary_path = temporary_file.name

            segments, info = MODEL.transcribe(
                temporary_path,
                language=None,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                beam_size=5,
                condition_on_previous_text=False,
                temperature=0.0,
                without_timestamps=True,
            )
            if info.language not in SUPPORTED_LANGUAGES:
                self._send_json(
                    422,
                    {
                        "error": "Only English and Bahasa Indonesia speech are supported.",
                        "language": info.language,
                        "language_probability": info.language_probability,
                    },
                )
                return

            text = merge_deduped_segments(segments)
            self._send_json(
                200,
                {
                    "text": text,
                    "language": info.language,
                    "language_probability": info.language_probability,
                },
            )
        except Exception as error:
            traceback.print_exc()
            self._send_json(
                500,
                {
                    "error": f"Speech transcription failed: {error}",
                    "content_type": self.headers.get("Content-Type", ""),
                },
            )
        finally:
            if temporary_path:
                try:
                    os.remove(temporary_path)
                except OSError:
                    pass

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), STTHandler)
    print(f"faster-whisper service listening at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
