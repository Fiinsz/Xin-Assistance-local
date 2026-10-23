import { execFileSync } from "node:child_process";

const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434);
export const MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";
export const OLLAMA_TIMEOUT_MS = Number(
  process.env.OLLAMA_TIMEOUT_MS || 120000
);

function getWslIpAddress() {
  try {
    const output = execFileSync("wsl.exe", ["hostname", "-I"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    const ipAddress = output.trim().split(/\s+/)[0];

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress)) {
      return ipAddress;
    }
  } catch (error) {
    console.warn(`Unable to discover the WSL IP address: ${error.message}`);
  }

  return null;
}

export function resolveOllamaBaseUrl() {
  if (process.env.OLLAMA_URL) {
    return process.env.OLLAMA_URL.replace(/\/+$/, "");
  }

  if (process.platform === "win32") {
    const wslIpAddress = getWslIpAddress();

    if (wslIpAddress) {
      return `http://${wslIpAddress}:${OLLAMA_PORT}`;
    }

    console.warn(
      "WSL IP address was not found. Set OLLAMA_URL manually if Ollama runs in WSL."
    );
  }

  return `http://127.0.0.1:${OLLAMA_PORT}`;
}

export function getOllamaErrorMessage(error, ollamaBaseUrl) {
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return "Ollama took too long to respond. Check that the model is available.";
  }

  if (
    error.cause?.code === "ECONNREFUSED" ||
    error.cause?.code === "ENETUNREACH"
  ) {
    return `Cannot connect to Ollama at ${ollamaBaseUrl}. Start Ollama in WSL with "ollama serve" or update OLLAMA_URL.`;
  }

  const cause = error.cause?.message ? ` (${error.cause.message})` : "";
  return `Unable to reach Ollama at ${ollamaBaseUrl}${cause}`;
}
