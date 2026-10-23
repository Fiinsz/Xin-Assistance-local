
const form = document.querySelector("#chat-form");
const input = document.querySelector("#user-input");
const messages = document.querySelector("#messages");
const speechStatus = document.querySelector("#speech-status");
const microphoneButton = document.querySelector("#microphone-button");
const sendButton = document.querySelector("#send-button");
const historyPanel = document.querySelector("#history-panel");
const historyToggle = document.querySelector("#history-toggle");
const newChatButton = document.querySelector("#new-chat-button");
const conversationHistory = document.querySelector("#conversation-history");
const historyCount = document.querySelector(".history-count");
const replyBubble = document.querySelector("#reply-bubble");
const replyBubbleText = document.querySelector("#reply-bubble-text");
const characterDisplay = document.querySelector("#character-display");
const characterImage = document.querySelector("#character-image");
const characterState = document.querySelector("#character-state");
const toastContainer = document.querySelector("#toast-container");


const conversation = [];
let conversationId = null;
let isLoading = false;
const canRecognizeSpeech = Boolean(window.MediaRecorder);
let isListening = false;
let mediaRecorder;
let recordedAudio = [];
let adaptiveListening = false;
let audioContext;
let audioAnalyser;
let microphoneStream;
let audioMonitorFrame;
let soundStartedAt = null;
let silenceStartedAt = null;
let monitorStarting = false;
let isTranscribing = false;
let discardCurrentRecording = false;
let conversationTaskVersion = 0;
const activeRequestControllers = new Set();
let currentReply = "";
const selectedCharacter = "xin";
let currentAudio = null;
let currentAudioUrl = null;
let speechRequest = null;
let currentAudioMessageId = null;
const currentAudioBubbles = new Set();
let currentReplyMessageId = null;
let currentReplyHasAudio = false;
let currentReplySourceBubble = null;
let voiceSessionEnabled = false;

function trackRequest(controller) {
  activeRequestControllers.add(controller);
  return controller;
}

function cancelConversationTasks() {
  conversationTaskVersion += 1;
  activeRequestControllers.forEach((controller) => controller.abort());
  activeRequestControllers.clear();
  stopSpeech();

  if (mediaRecorder?.state === "recording") {
    discardCurrentRecording = true;
    mediaRecorder.stop();
  }

  recordedAudio = [];
  isTranscribing = false;
  isLoading = false;
  input.disabled = false;
  sendButton.disabled = false;
  microphoneButton.disabled = !canRecognizeSpeech;
}

const characterAssets = {
  xin: {
    name: "Xin",
    directory: "Xin",
    idle: "bot2_idle",
    thinking: "bot2_Thingking",
    speak: "bot2_speak"
  }
};

function isAssistantAudioActive() {
  return Boolean(
    speechRequest ||
    (currentAudio && !currentAudio.paused && !currentAudio.ended)
  );
}

function updateCharacterState(state) {
  const character = characterAssets[selectedCharacter];

  if (!character) return;

  const assetName =
    state === "speaking"
      ? character.speak
      : state === "thinking"
        ? character.thinking
        : character.idle;

  characterDisplay.dataset.state = state;
  characterImage.src =
    `characters/${character.directory}/${assetName}.png`;
  characterImage.alt = `${character.name} character ${state}`;
  characterState.textContent = assetName;
}

updateCharacterState("idle");

function renderMessages() {
  messages.innerHTML = "";

  if (conversation.length === 0) {
    addMessage("Hello! How can I help you today?", "bot");
    return;
  }

  conversation.forEach(({ id, role, content, hasAudio }) => {
    addMessage(content, role === "assistant" ? "bot" : "user", {
      messageId: id,
      hasAudio
    });
  });
}

// =========================
// TOAST NOTIFICATIONS
// =========================

function showToast(message, type = "success") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute(
    "role",
    type === "error" ? "alert" : "status"
  );

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = type === "error" ? "!" : "✓";

  const text = document.createElement("span");
  text.className = "toast-message";
  text.textContent = message;

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";
  close.addEventListener("click", () => dismissToast(toast));

  toast.append(icon, text, close);
  toastContainer.appendChild(toast);

  const timeout = window.setTimeout(
    () => dismissToast(toast),
    3200
  );

  toast.dataset.timeoutId = String(timeout);
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains("toast-leaving")) return;

  window.clearTimeout(Number(toast.dataset.timeoutId));
  toast.classList.add("toast-leaving");

  toast.addEventListener(
    "animationend",
    () => toast.remove(),
    { once: true }
  );

  window.setTimeout(() => toast.remove(), 300);
}

// =========================
// CONVERSATION HISTORY
// =========================

function renderHistory(items) {
  conversationHistory.innerHTML = "";
  historyCount.textContent = String(items.length);

  items.forEach((item) => {
    const button = document.createElement("div");

    button.className = "history-item";
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.dataset.conversationId = item.id;

    button.innerHTML = `
      <span class="history-icon">◌</span>
      <span class="history-title"></span>
      <span class="history-actions">
        <button
          class="history-action rename-conversation"
          type="button"
          aria-label="Rename conversation"
          title="Rename conversation"
        >✎</button>
        <button
          class="history-action delete-conversation"
          type="button"
          aria-label="Delete conversation"
          title="Delete conversation"
        >×</button>
      </span>
    `;

    button.querySelector(".history-title").textContent = item.title;

    button.addEventListener("click", () => {
      selectConversation(item.id);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectConversation(item.id);
      }
    });

    button
      .querySelector(".rename-conversation")
      .addEventListener("click", (event) => {
        event.stopPropagation();
        renameConversation(item);
      });

    button
      .querySelector(".delete-conversation")
      .addEventListener("click", (event) => {
        event.stopPropagation();
        removeConversation(item);
      });

    button.classList.toggle(
      "active",
      item.id === conversationId
    );

    conversationHistory.appendChild(button);
  });
}

async function refreshHistory() {
  const response = await fetch("/api/conversations");

  if (!response.ok) {
    throw new Error("Unable to load conversation history.");
  }

  const responseText = await response.text();
  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Unable to parse conversation history (HTTP ${response.status}).`
    );
  }

  renderHistory(data.conversations);
  return data.conversations;
}

async function selectConversation(id) {
  if (id === conversationId) return;

  cancelConversationTasks();
  const taskVersion = conversationTaskVersion;
  const controller = trackRequest(new AbortController());

  let response;

  try {
    response = await fetch(
      `/api/conversations/${id}/messages`,
      { signal: controller.signal }
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    throw error;
  } finally {
    activeRequestControllers.delete(controller);
  }

  if (taskVersion !== conversationTaskVersion) return;

  if (!response.ok) {
    throw new Error("Unable to load the selected conversation.");
  }

  const data = await response.json();

  conversationId = id;
  conversation.length = 0;

  conversation.push(
    ...data.messages.map(({ id, role, content, hasAudio }) => ({
      id,
      role,
      content,
      hasAudio
    }))
  );

  renderMessages();
  replyBubble.hidden = true;
  await refreshHistory();
}

async function createNewConversation() {
  cancelConversationTasks();

  const controller = trackRequest(new AbortController());
  let response;

  try {
    response = await fetch("/api/conversations", {
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") return;
    throw error;
  } finally {
    activeRequestControllers.delete(controller);
  }

  if (!response.ok) {
    throw new Error("Unable to create a new conversation.");
  }

  const data = await response.json();

  conversationId = data.conversation.id;
  conversation.length = 0;

  renderMessages();
  await refreshHistory();
}

// =========================
// RENAME CONVERSATION
// =========================

async function renameConversation(item) {
  const title = window.prompt(
    "Rename conversation:",
    item.title
  );

  if (title === null) return;

  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    showToast(
      "Conversation title cannot be empty.",
      "error"
    );
    return;
  }

  if (trimmedTitle.length > 80) {
    showToast(
      "Title must be 80 characters or fewer.",
      "error"
    );
    return;
  }

  if (trimmedTitle === item.title) return;

  try {
    const response = await fetch(
      `/api/conversations/${item.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: trimmedTitle
        })
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        data.error || `Request failed (HTTP ${response.status}).`
      );
    }

    await refreshHistory();
    showToast("Conversation renamed.");
  } catch (error) {
    console.error("Conversation rename failed:", error);

    showToast(
      error.message || "Could not rename conversation.",
      "error"
    );
  }
}

// =========================
// DELETE CONVERSATION
// =========================

async function removeConversation(item) {
  const confirmed = window.confirm(
    `Delete "${item.title}"? This cannot be undone.`
  );

  if (!confirmed) return;

  const isCurrentConversation = item.id === conversationId;

  try {
    if (isCurrentConversation) {
      cancelConversationTasks();
    }

    const response = await fetch(
      `/api/conversations/${item.id}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.error || `Request failed (HTTP ${response.status}).`
      );
    }

    if (isCurrentConversation) {
      conversationId = null;
      conversation.length = 0;
      renderMessages();
      replyBubble.hidden = true;

      try {
        await createNewConversation();
      } catch (createError) {
        await refreshHistory();

        showToast(
          "Conversation deleted, but a new chat could not be opened.",
          "error"
        );

        console.error(
          "Could not open a replacement conversation:",
          createError
        );

        return;
      }
    } else {
      await refreshHistory();
    }

    showToast("Conversation deleted.");
  } catch (error) {
    console.error("Conversation deletion failed:", error);

    showToast(
      error.message || "Could not delete conversation.",
      "error"
    );
  }
}

// =========================
// SPEECH RECOGNITION
// =========================

const SOUND_THRESHOLD = 0.025;
const SOUND_DURATION_MS = 2000;

function startRecording() {
  if (
    !voiceSessionEnabled ||
    !adaptiveListening ||
    isListening ||
    isTranscribing ||
    isLoading ||
    !microphoneStream
  ) {
    return;
  }

  const mimeType = MediaRecorder.isTypeSupported(
    "audio/webm;codecs=opus"
  )
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  recordedAudio = [];

  try {
    mediaRecorder = new MediaRecorder(
      microphoneStream,
      { mimeType }
    );
  } catch (error) {
    mediaRecorder = null;
    speechStatus.textContent =
      "Microphone recording could not start. Listening again...";
    console.error("Microphone recording could not start:", error);
    return;
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedAudio.push(event.data);
    }
  };

  mediaRecorder.onstart = () => {
    isListening = true;
    microphoneButton.classList.add("listening");
    microphoneButton.setAttribute(
      "aria-label",
      "Stop listening"
    );
    microphoneButton.title = "Stop listening";
    speechStatus.textContent =
      "Listening... speak your message.";
  };

  mediaRecorder.onerror = (event) => {
    isListening = false;
    microphoneButton.classList.remove("listening");

    speechStatus.textContent =
      `Local audio recording failed: ${
        event.error?.message || "unknown error"
      }.`;

    console.error("Local audio recording failed:", event.error);
  };

  mediaRecorder.onstop = transcribeRecording;

  try {
    mediaRecorder.start();
  } catch (error) {
    mediaRecorder = null;
    speechStatus.textContent =
      "Microphone recording could not start. Listening again...";
    console.error("Microphone recording could not start:", error);
  }
}

async function requestTranscription(audio) {
  const controller = trackRequest(new AbortController());
  let response;

  try {
    response = await fetch("/api/stt", {
      method: "POST",
      headers: {
        "Content-Type": audio.type || "audio/webm"
      },
      body: audio,
      signal: controller.signal
    });
  } finally {
    activeRequestControllers.delete(controller);
  }

  const responseText = await response.text();
  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Offline speech recognition returned an invalid response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error || "Offline speech recognition failed."
    );
  }

  return data;
}

async function transcribeRecording() {
  isListening = false;
  microphoneButton.classList.remove("listening");
  microphoneButton.setAttribute(
    "aria-label",
    "Speak your message"
  );
  microphoneButton.title = "Speak your message";

  if (discardCurrentRecording) {
    discardCurrentRecording = false;
    recordedAudio = [];
    mediaRecorder = null;
    return;
  }

  if (recordedAudio.length === 0) {
    recordedAudio = [];
    mediaRecorder = null;
    speechStatus.textContent = "Listening for speech...";
    return;
  }

  isTranscribing = true;
  const taskVersion = conversationTaskVersion;

  try {
    speechStatus.textContent = "Finalizing transcription...";

    const audio = new Blob(recordedAudio, {
      type: mediaRecorder?.mimeType || "audio/webm"
    });

    const data = await requestTranscription(audio);

    if (taskVersion !== conversationTaskVersion) return;

    if (data.text?.trim() && !isLoading) {
      input.value = data.text.trim();
      speechStatus.textContent = "Sending your message...";

      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });

      form.requestSubmit();
    } else {
      input.value = "";
      speechStatus.textContent =
        "No speech was detected. Listening again...";
    }
  } catch (error) {
    if (error.name === "AbortError") return;

    input.value = "";
    speechStatus.textContent = error.message;
    console.error("Offline speech transcription failed:", error);
  } finally {
    recordedAudio = [];
    mediaRecorder = null;
    isTranscribing = false;

    if (adaptiveListening && !isLoading) {
      speechStatus.textContent = "Listening for speech...";
    }
  }
}

function monitorMicrophone() {
  if (
    !audioAnalyser ||
    !voiceSessionEnabled ||
    !adaptiveListening
  ) {
    return;
  }

  const samples = new Float32Array(audioAnalyser.fftSize);
  audioAnalyser.getFloatTimeDomainData(samples);

  const volume = Math.sqrt(
    samples.reduce(
      (sum, sample) => sum + sample * sample,
      0
    ) / samples.length
  );

  const now = performance.now();

  if (volume >= SOUND_THRESHOLD) {
    silenceStartedAt = null;
    soundStartedAt ??= now;

    if (!isListening && !isTranscribing && !isLoading) {
      startRecording();
    }
  } else {
    soundStartedAt = null;

    if (
      isListening &&
      mediaRecorder?.state === "recording"
    ) {
      silenceStartedAt ??= now;

      if (now - silenceStartedAt >= SOUND_DURATION_MS) {
        mediaRecorder.stop();
        silenceStartedAt = null;
      }
    }
  }

  audioMonitorFrame =
    window.requestAnimationFrame(monitorMicrophone);
}

async function startMicrophoneMonitor() {
  if (microphoneStream || monitorStarting) {
    return Boolean(microphoneStream);
  }

  monitorStarting = true;

  try {
    microphoneStream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

    audioContext = new AudioContext();
    await audioContext.resume();

    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 1024;
    audioAnalyser.smoothingTimeConstant = 0.2;

    audioContext
      .createMediaStreamSource(microphoneStream)
      .connect(audioAnalyser);

    microphoneButton.classList.add("voice-ready");
    microphoneButton.title =
      "Microphone is ready. Speak to start recording.";

    monitorMicrophone();
    return true;
  } catch (error) {
    adaptiveListening = false;

    speechStatus.textContent =
      "Microphone access was denied. Allow microphone access to use voice detection.";

    console.error("Microphone monitoring could not start:", error);
    return false;
  } finally {
    monitorStarting = false;
  }
}

function stopMicrophoneMonitor() {
  window.cancelAnimationFrame(audioMonitorFrame);
  audioMonitorFrame = null;
  soundStartedAt = null;
  silenceStartedAt = null;

  microphoneStream?.getTracks().forEach((track) => track.stop());

  microphoneStream = null;
  audioAnalyser = null;

  microphoneButton.classList.remove("voice-ready");
  microphoneButton.classList.remove("listening");

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

// =========================
// REPLY BUBBLE AND AUDIO
// =========================

function showReplyBubble(
  text,
  messageId = null,
  sourceBubble = null,
  hasAudio = false
) {
  currentReply = text;
  currentReplyMessageId = messageId;
  currentReplyHasAudio = hasAudio;
  currentReplySourceBubble = sourceBubble;

  replyBubbleText.textContent = text;

  if (messageId) {
    replyBubble.dataset.messageId = String(messageId);
  } else {
    delete replyBubble.dataset.messageId;
  }

  replyBubble.hidden = false;

  replyBubble.classList.toggle(
    "audio-playing",
    currentAudioMessageId === messageId &&
      currentAudioBubbles.size > 0
  );
}

function toggleReplyAudio() {
  if (!currentReplyMessageId) {
    speakResponse(currentReply);
    return;
  }

  if (
    currentAudioMessageId === currentReplyMessageId &&
    (currentAudio || speechRequest)
  ) {
    stopSpeech();
    return;
  }

  if (currentReplyHasAudio) {
    playStoredSpeech(
      currentReplyMessageId,
      currentReplySourceBubble
    );
  } else {
    generateStoredSpeech(
      currentReplyMessageId,
      currentReplySourceBubble
    );
  }
}

replyBubble.addEventListener("click", toggleReplyAudio);

historyToggle.addEventListener("click", () => {
  const isHidden = historyPanel.classList.toggle("hidden");

  historyToggle.setAttribute(
    "aria-label",
    isHidden
      ? "Show conversation history"
      : "Hide conversation history"
  );

  historyToggle.title = isHidden
    ? "Show conversation history"
    : "Hide conversation history";
});

// Close the recent-conversation panel when the user clicks anywhere outside it.
document.addEventListener("click", (event) => {
  if (historyPanel.classList.contains("hidden")) return;

  const clickedInsideHistory = historyPanel.contains(event.target);
  const clickedToggle = historyToggle.contains(event.target);

  if (!clickedInsideHistory && !clickedToggle) {
    historyPanel.classList.add("hidden");
    historyToggle.setAttribute("aria-label", "Show conversation history");
    historyToggle.title = "Show conversation history";
  }
});

newChatButton.addEventListener("click", async () => {
  try {
    await createNewConversation();
    historyPanel.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    speechStatus.textContent =
      "The new conversation could not be created.";
  }
});

if (canRecognizeSpeech) {
  microphoneButton.addEventListener("click", () => {
    if (isListening) {
      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }
    } else if (adaptiveListening) {
      voiceSessionEnabled = true;
      speechStatus.textContent = "Listening for speech...";
      startMicrophoneMonitor();
    } else if (!isLoading) {
      voiceSessionEnabled = true;
      adaptiveListening = true;
      speechStatus.textContent = "Listening for speech...";

      startMicrophoneMonitor().then((microphoneReady) => {
        if (!microphoneReady) {
          voiceSessionEnabled = false;
          adaptiveListening = false;
        }
      });
    }
  });
} else {
  microphoneButton.disabled = true;
  microphoneButton.title =
    "Audio recording is not supported by this browser";
  microphoneButton.setAttribute(
    "aria-label",
    "Audio recording is not supported"
  );
}

// =========================
// RENDER CHAT MESSAGES
// =========================

function addMessage(text, sender, options = {}) {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (options.messageId) {
    bubble.dataset.messageId = String(options.messageId);
  }

  const messageText = document.createElement("span");
  messageText.textContent = text;

  bubble.appendChild(messageText);
  message.appendChild(bubble);

  if (sender === "bot") {
    bubble.addEventListener("click", () => {
      showReplyBubble(
        text,
        options.messageId,
        bubble,
        options.hasAudio
      );

      if (
        options.messageId &&
        currentAudioMessageId === options.messageId &&
        (currentAudio || speechRequest)
      ) {
        stopSpeech();
        return;
      }

      if (options.messageId && options.hasAudio) {
        playStoredSpeech(options.messageId, bubble);
      } else if (options.messageId) {
        generateStoredSpeech(options.messageId, bubble);
      } else {
        speakResponse(text);
      }
    });
  }

  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

// =========================
// PLAY SAVED AUDIO
// =========================

async function playStoredSpeech(messageId, bubble = null) {
  stopSpeech();

  currentAudioMessageId = messageId;
  syncAudioBubbles(bubble);

  const request = new AbortController();
  speechRequest = request;
  speechStatus.textContent = "Loading saved voice...";

  try {
    const response = await fetch(
      `/api/messages/${messageId}/audio`,
      { signal: request.signal }
    );

    if (!response.ok) {
      throw new Error("Saved audio was not found.");
    }

    const audioBlob = await response.blob();

    currentAudioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(currentAudioUrl);

    currentAudio.onplay = () => {
      updateCharacterState("speaking");
      speechStatus.textContent = "Playing saved reply...";
    };

    currentAudio.onended = () => {
      updateCharacterState("idle");
      speechStatus.textContent = "";
      cleanupAudio();
    };

    currentAudio.onerror = () => {
      updateCharacterState("idle");
      speechStatus.textContent =
        "The saved audio could not be played.";
      cleanupAudio();
    };

    await currentAudio.play();
  } catch (error) {
    if (error.name === "AbortError") return;

    updateCharacterState("idle");
    speechStatus.textContent = "Saved audio could not be loaded.";
    console.error(error);
  } finally {
    if (speechRequest === request) {
      speechRequest = null;
    }
  }
}

async function generateStoredSpeech(messageId, bubble = null) {
  stopSpeech();

  currentAudioMessageId = messageId;
  syncAudioBubbles(bubble);

  const request = new AbortController();
  speechRequest = request;
  speechStatus.textContent = "Generating fast KittenTTS audio...";

  try {
    const response = await fetch(
      `/api/messages/${messageId}/audio`,
      {
        method: "POST",
        signal: request.signal
      }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || "KittenTTS generation failed."
      );
    }

    const audioBlob = await response.blob();

    currentAudioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(currentAudioUrl);

    currentAudio.onplay = () => {
      updateCharacterState("speaking");
      speechStatus.textContent = "Playing saved reply...";
    };

    currentAudio.onended = () => {
      updateCharacterState("idle");
      speechStatus.textContent = "";
      cleanupAudio();
    };

    currentAudio.onerror = () => {
      updateCharacterState("idle");
      speechStatus.textContent =
        "The generated audio could not be played.";
      cleanupAudio();
    };

    await currentAudio.play();
  } catch (error) {
    if (error.name === "AbortError") return;

    updateCharacterState("idle");
    speechStatus.textContent =
      "KittenTTS audio could not be generated.";

    console.error(error);
  } finally {
    if (speechRequest === request) {
      speechRequest = null;
    }
  }
}

async function speakResponse(text) {
  stopSpeech();

  const request = new AbortController();
  speechRequest = request;
  speechStatus.textContent = "Generating voice...";

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text }),
      signal: request.signal
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || "KittenTTS failed."
      );
    }

    const audioBlob = await response.blob();

    currentAudioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(currentAudioUrl);

    currentAudio.onplay = () => {
      updateCharacterState("speaking");
      speechStatus.textContent = "Playing reply...";
    };

    currentAudio.onended = () => {
      updateCharacterState("idle");
      speechStatus.textContent = "";
      cleanupAudio();
    };

    currentAudio.onerror = () => {
      updateCharacterState("idle");
      speechStatus.textContent =
        "The generated audio could not be played.";
      cleanupAudio();
    };

    try {
      await currentAudio.play();
    } catch (error) {
      updateCharacterState("idle");
      speechStatus.textContent =
        "Audio is ready. Click Play to allow KittenTTS playback.";

      cleanupAudio();
      console.error("KittenTTS audio playback was blocked:", error);
    }
  } catch (error) {
    if (error.name === "AbortError") return;

    console.error(error);

    speechStatus.textContent =
      "KittenTTS could not generate audio. Start the local KittenTTS service and try again.";

    updateCharacterState("idle");
  } finally {
    if (speechRequest === request) {
      speechRequest = null;
    }
  }
}

function playGeneratedSpeech(
  base64Audio,
  contentType = "audio/wav"
) {
  stopSpeech();

  if (!base64Audio) {
    speechStatus.textContent =
      "The answer was generated, but KittenTTS returned no audio.";
    return;
  }

  const audioBytes = Uint8Array.from(
    atob(base64Audio),
    (character) => character.charCodeAt(0)
  );

  currentAudioUrl = URL.createObjectURL(
    new Blob([audioBytes], { type: contentType })
  );

  currentAudio = new Audio(currentAudioUrl);

  currentAudio.onplay = () => {
    updateCharacterState("speaking");
    speechStatus.textContent = "Playing reply...";
  };

  currentAudio.onended = () => {
    updateCharacterState("idle");
    speechStatus.textContent = "";
    cleanupAudio();
  };

  currentAudio.onerror = () => {
    updateCharacterState("idle");
    speechStatus.textContent =
      "The generated audio could not be played.";
    cleanupAudio();
  };

  currentAudio.play().catch((error) => {
    updateCharacterState("idle");
    speechStatus.textContent =
      "Audio is ready. Click Play to allow KittenTTS playback.";

    console.error("KittenTTS audio playback was blocked:", error);
    cleanupAudio();
  });
}

function cleanupAudio() {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
  }

  currentAudio = null;
  currentAudioUrl = null;
  currentAudioMessageId = null;

  currentAudioBubbles.forEach((bubble) => {
    bubble.classList.remove("audio-playing");
  });

  currentAudioBubbles.clear();
  replyBubble.classList.remove("audio-playing");
}

function syncAudioBubbles(sourceBubble) {
  currentAudioBubbles.clear();

  if (sourceBubble) {
    currentAudioBubbles.add(sourceBubble);
  }

  if (currentReplyMessageId === currentAudioMessageId) {
    currentAudioBubbles.add(replyBubble);
  }

  currentAudioBubbles.forEach((bubble) => {
    bubble.classList.add("audio-playing");
  });
}

function stopSpeech() {
  speechRequest?.abort();
  speechRequest = null;

  currentAudio?.pause();

  if (currentAudio) {
    currentAudio.currentTime = 0;
  }

  cleanupAudio();
  updateCharacterState("idle");
}

// =========================
// SEND CHAT MESSAGE
// =========================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = input.value.trim();

  if (!text || isLoading) return;

  const taskVersion = conversationTaskVersion;
  const controller = trackRequest(new AbortController());

  addMessage(text, "user");

  conversation.push({
    role: "user",
    content: text
  });

  input.value = "";
  input.disabled = true;
  isLoading = true;

  stopSpeech();
  updateCharacterState("thinking");

  sendButton.disabled = true;
  microphoneButton.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conversationId,
        message: text
      }),
      signal: controller.signal
    });

    const data = await response.json();

    if (taskVersion !== conversationTaskVersion) return;

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    addMessage(data.reply, "bot", {
      messageId: data.messageId,
      hasAudio: false
    });

    const bubble = messages.querySelector(
      `[data-message-id="${data.messageId}"]`
    );

    showReplyBubble(
      data.reply,
      data.messageId,
      bubble,
      false
    );

    if (data.messageId) {
      generateStoredSpeech(data.messageId, bubble);
    }

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    conversationId = data.conversationId;
    await refreshHistory();
  } catch (error) {
    if (
      error.name === "AbortError" ||
      taskVersion !== conversationTaskVersion
    ) {
      return;
    }

    addMessage(
      "Sorry, I couldn't connect to the AI. Please try again.",
      "bot"
    );

    console.error(error);
  } finally {
    activeRequestControllers.delete(controller);

    if (taskVersion !== conversationTaskVersion) return;

    input.disabled = false;
    sendButton.disabled = false;
    microphoneButton.disabled = !canRecognizeSpeech;
    isLoading = false;
    input.focus();

    if (
      adaptiveListening &&
      !isListening &&
      !isTranscribing
    ) {
      speechStatus.textContent = "Listening for speech...";
      startMicrophoneMonitor();
    }
  }
});

// =========================
// INITIALIZE CHAT
// =========================

async function initializeChat() {
  voiceSessionEnabled = canRecognizeSpeech;
  adaptiveListening = canRecognizeSpeech;

  if (canRecognizeSpeech) {
    speechStatus.textContent = "Starting microphone...";

    startMicrophoneMonitor().then((microphoneReady) => {
      if (microphoneReady) {
        speechStatus.textContent =
          "Microphone ready. Speak to start recording.";
      }
    });
  }

  try {
    const items = await refreshHistory();

    if (items.length > 0) {
      await selectConversation(items[0].id);
    } else {
      await createNewConversation();
    }
  } catch (error) {
    console.error(error);
    speechStatus.textContent =
      "Chat history could not be loaded.";
    renderMessages();
  }
}

initializeChat();
