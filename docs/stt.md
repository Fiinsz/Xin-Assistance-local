# Offline speech-to-text

The microphone uses a local `faster-whisper` service. The browser records
audio, Node.js forwards it to the service, and Whisper automatically detects
only English (`en`) or Indonesian (`id`).

## Setup

Install the STT dependencies:

```powershell
python -m pip install -r requirements-stt.txt
```

Start the service once while online so faster-whisper can download the model:

```powershell
$env:FASTER_WHISPER_MODEL="small"
python -X utf8 stt_service.py
```

The default model is `small`, uses CPU `int8`, and listens on
`http://127.0.0.1:8002`. The downloaded model is cached locally. After the
model is cached, transcription is local and does not require internet access.
The project pins PyAV below version 19 because faster-whisper uses an audio
metadata option removed by newer PyAV releases. `small` uses more RAM and CPU
time than `base`, while providing better accuracy for difficult speech and
noisy audio.

Start Node.js in another terminal:

```powershell
npm start
```

The browser requests microphone permission, detects speech locally with the
Web Audio API, and records one complete audio session. After two seconds of
silence, that single recording is sent once for transcription and the final
text is submitted. Whisper accepts only English (`en`) and Indonesian (`id`)
and rejects other detected languages. The UI does not expose a language
selector.

For a faster but less accurate model, use `base`:

```powershell
$env:FASTER_WHISPER_MODEL="base"
python -X utf8 stt_service.py
```
