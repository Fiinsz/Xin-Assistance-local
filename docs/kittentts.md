# Local KittenTTS setup

KittenTTS currently provides its documented runtime through Python, not a browser or
Node.js package. This project keeps Ollama in Node.js and uses a local Python service
for speech generation.

## Install

Use Python 3.10+ in a virtual environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-tts.txt
```

## Run

Start the speech service in one terminal:

```powershell
python -X utf8 tts_service.py
```

On Windows, the service also relaunches itself in UTF-8 mode when started with
`python tts_service.py`, because KittenTTS voice metadata is UTF-8 encoded.

Start the chatbot in another:

```powershell
npm start
```

The model is loaded once when `tts_service.py` starts. The default model is the fastest
supported int8 Nano model, using the documented male `Jasper` voice. Set
`KITTENTTS_MODEL` and `KITTENTTS_VOICE` to choose another supported model and voice.

The first request may download model files and take longer. The chatbot displays the
answer immediately, then automatically generates and plays its audio. The generated
audio is stored in SQLite, so later Play clicks reuse it without generating again.
The browser's built-in speech synthesis is not used. On CPU, the first generation may
still take time, but it happens only once per message. Browser autoplay restrictions
may require the user to click Play if automatic playback is blocked.

## Response limit and profiles

Responses are limited to 20 words by default. Set `MAX_RESPONSE_WORDS` to a positive
integer to change the limit. The backend validates the final response before saving it
or sending it to KittenTTS.

The assistant profile selector is backed by SQLite. The seeded profiles are Xin
assistant, Programming tutor, and Voice assistant; each conversation keeps its
selected profile and its system prompt is sent to Ollama as a trusted system message.
Xin uses an original gentle, intelligent, and subtly playful personality rather than
imitating a named fictional character or voice actor.

KittenTTS voice descriptions are guidance, not a guarantee of a specific anime voice.
This integration does not clone or reproduce a named performer.
