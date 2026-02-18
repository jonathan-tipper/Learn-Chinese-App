"use client";

import { useEffect, useMemo, useState } from "react";
import { VENICE_MODEL_OPTIONS } from "@/lib/venice";

type Structured = {
  answer: string;
  keyPoints: string[];
  examples: string[];
  microExercise: string;
  suggestedReviewItems: string[];
};

type ChatTurn = {
  user: string;
  assistant: Structured | null;
};

function parseSse(raw: string) {
  const events = raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/, ""));

  const parsed = events
    .map((event) => {
      try {
        return JSON.parse(event);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const finalEvent = parsed.find((event: { type?: string }) => event.type === "final");
  return finalEvent?.structured ?? null;
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState("Teach me how to order tea politely.");
  const [verifyMode, setVerifyMode] = useState(false);
  const [modelSelectionMode, setModelSelectionMode] = useState<"auto" | "simple" | "complex" | "custom">("auto");
  const [customModel, setCustomModel] = useState("zai-org-glm-5");
  const [modelOptions, setModelOptions] = useState<string[]>([...VENICE_MODEL_OPTIONS]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState("Start a session to begin.");

  const canSend = useMemo(() => sessionId && input.trim().length > 0, [input, sessionId]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/models");
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModelOptions(data.models);
        }
      } catch {
        // Keep local fallback model list if the models endpoint fails.
      }
    })();
  }, []);

  async function startSession() {
    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "daily" })
    });
    const data = await response.json();
    setSessionId(data.sessionId);
    setStatus(`Session started: ${data.sessionId}`);
  }

  async function endSession() {
    if (!sessionId) return;
    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, durationSec: Math.max(60, turns.length * 90), summary: "Session complete" })
    });

    localStorage.setItem("lastSessionDate", new Date().toISOString().slice(0, 10));
    setStatus("Session ended. Great work today.");
    setSessionId("");
  }

  async function send(intent?: "more_examples" | "quiz_me", saveToReview = false) {
    if (!canSend) return;

    const userMessage = input;
    setStatus("Coach is responding...");
    const payload = {
      sessionId,
      message: userMessage,
      verifyMode,
      intent,
      saveToReview,
      modelSelectionMode,
      customModel: modelSelectionMode === "custom" ? customModel : undefined
    };
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) {
      setStatus(`Error: ${text}`);
      return;
    }
    const structured = parseSse(text);

    setTurns((prev) => [...prev, { user: userMessage, assistant: structured }]);
    setStatus("Response received.");
  }

  return (
    <section>
      <h2>Daily Coach Chat</h2>
      <div className="card">
        <div className="row">
          <button onClick={startSession} type="button">Start session</button>
          <button onClick={endSession} type="button" disabled={!sessionId}>End session</button>
          <label className="row">
            <input type="checkbox" checked={verifyMode} onChange={(e) => setVerifyMode(e.target.checked)} />
            Verify mode
          </label>
          <label className="row">
            Model mode
            <select value={modelSelectionMode} onChange={(e) => setModelSelectionMode(e.target.value as "auto" | "simple" | "complex" | "custom")}>
              <option value="auto">Auto</option>
              <option value="simple">Simple (zai-org-glm-4.7)</option>
              <option value="complex">Complex (zai-org-glm-5)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        {modelSelectionMode === "custom" ? (
          <div className="row">
            <label>Custom model</label>
            <input list="venice-model-options" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
            <datalist id="venice-model-options">
              {modelOptions.map((model) => <option key={model} value={model} />)}
            </datalist>
          </div>
        ) : null}
        <p>Session: {sessionId || "Not started"}</p>
        <p>{status}</p>
      </div>

      <div className="card">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} style={{ width: "100%" }} />
        <div className="row">
          <button onClick={() => send()} type="button" disabled={!canSend}>Send message</button>
          <button onClick={() => send("more_examples")} type="button" disabled={!canSend}>More examples</button>
          <button onClick={() => send("quiz_me")} type="button" disabled={!canSend}>Quiz me</button>
          <button onClick={() => send(undefined, true)} type="button" disabled={!canSend}>Save to review</button>
          <button onClick={() => setTurns([])} type="button">Clear</button>
        </div>
      </div>

      <div className="card">
        <h3>Conversation</h3>
        {turns.length === 0 ? <p>No messages yet.</p> : null}
        {turns.map((turn, index) => (
          <div key={`${turn.user}-${index}`} className="card">
            <p><strong>You:</strong> {turn.user}</p>
            <p><strong>Coach:</strong> {turn.assistant?.answer ?? "No structured response"}</p>
            {turn.assistant?.keyPoints?.length ? <p><strong>Key points:</strong> {turn.assistant.keyPoints.join(" • ")}</p> : null}
            {turn.assistant?.examples?.length ? (
              <ul>
                {turn.assistant.examples.map((example) => <li key={example}>{example}</li>)}
              </ul>
            ) : null}
            {turn.assistant?.microExercise ? <p><strong>Micro-exercise:</strong> {turn.assistant.microExercise}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
