import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# KittenTTS reads voice metadata as UTF-8, while Windows may default to cp1252.
# Relaunch before importing KittenTTS so its internal open() calls use UTF-8.
if os.name == "nt" and sys.flags.utf8_mode != 1:
    os.execv(sys.executable, [sys.executable, "-X", "utf8", *sys.argv])

import soundfile as sf
from kittenml import KittenTTS


HOST = os.environ.get("KITTENTTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("KITTENTTS_PORT", "8001"))
MODEL_ID = os.environ.get(
    "KITTENTTS_MODEL", "KittenML/kitten-tts-nano-0.8-int8"
)
VOICE = os.environ.get("KITTENTTS_VOICE", "Jasper")

print(f"Loading KittenTTS model {MODEL_ID} with voice {VOICE}...", flush=True)
MODEL = KittenTTS(MODEL_ID)
print("KittenTTS is ready.", flush=True)


class TTSHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/synthesize":
            self._send_json(404, {"error": "Not found."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            text = payload.get("text")

            if not isinstance(text, str) or not text.strip() or len(text) > 4000:
                self._send_json(400, {"error": "Text must be 1-4000 characters."})
                return

            audio = MODEL.generate(text.strip(), voice=VOICE)
            output = io.BytesIO()
            sf.write(
                output,
                audio,
                getattr(MODEL, "sample_rate", 24000),
                format="WAV",
                subtype="PCM_16",
            )
            body = output.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (json.JSONDecodeError, ValueError) as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            print(f"KittenTTS synthesis failed: {error}", flush=True)
            self._send_json(500, {"error": "Speech generation failed."})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), TTSHandler)
    print(f"KittenTTS service listening at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
