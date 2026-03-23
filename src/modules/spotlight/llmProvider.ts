import { getPref } from "../../utils/prefs";

function getRawPref(
  key: "aiProvider" | "aiApiKey" | "aiBaseUrl" | "aiModel",
): string {
  return String(getPref(key) || "");
}

function getBoolPref(key: "aiEnabled"): boolean {
  return !!getPref(key);
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  stream(
    messages: LLMMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
  ): Promise<void>;
}

class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async stream(
    messages: LLMMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
      }),
      signal,
    });
    if (!response.ok) {
      let errorDetail = response.statusText;
      try {
        errorDetail = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`LLM API error ${response.status}: ${errorDetail}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") {
          continue;
        }
        if (!trimmed.startsWith("data: ")) {
          continue;
        }
        try {
          const json = JSON.parse(trimmed.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            onChunk(delta);
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }
}

export function getActiveProvider(): LLMProvider {
  const provider = getRawPref("aiProvider") || "openai";
  const apiKey = getRawPref("aiApiKey");
  const model = getRawPref("aiModel");
  const baseUrl = getRawPref("aiBaseUrl");

  if (provider === "ollama") {
    return new OpenAICompatibleProvider(
      "ollama",
      "Ollama",
      baseUrl || "http://localhost:11434/v1",
      apiKey || "ollama",
      model || "llama3.2",
    );
  }
  // Default: OpenAI-compatible (covers OpenAI, Azure OpenAI, etc.)
  return new OpenAICompatibleProvider(
    provider || "openai",
    provider === "openai" ? "OpenAI" : provider,
    baseUrl || "https://api.openai.com/v1",
    apiKey,
    model || "gpt-4o-mini",
  );
}

export function isAIEnabled(): boolean {
  return getBoolPref("aiEnabled");
}

export function isAIConfigured(): boolean {
  if (!isAIEnabled()) {
    return false;
  }
  const provider = getRawPref("aiProvider") || "openai";
  if (provider === "ollama") {
    return true; // Ollama runs locally, no API key required
  }
  return getRawPref("aiApiKey").length > 0;
}

export function getProviderLabel(): string {
  const provider = getRawPref("aiProvider") || "openai";
  const model = getRawPref("aiModel");
  const modelLabel = model || (provider === "ollama" ? "llama3.2" : "gpt-4o-mini");
  const providerLabel =
    provider === "openai"
      ? "OpenAI"
      : provider === "ollama"
        ? "Ollama"
        : provider;
  return `${modelLabel} · ${providerLabel}`;
}
