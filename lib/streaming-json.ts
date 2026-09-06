/**
 * Incrementally extracts the value of one string field from a JSON document that is
 * still being streamed. This lets the chat UI show the tutor's `answer` token by token
 * while the rest of the structured payload (key points, examples, review items) is
 * still being generated, all from a single model call.
 */
export interface JsonStringFieldStreamer {
  /** Feed the next raw chunk of the JSON text. */
  push(chunk: string): void;
  /** True once the closing quote of the target field has been seen. */
  readonly done: boolean;
  /** Everything emitted so far. */
  readonly value: string;
}

type Phase = "seekKey" | "seekColon" | "seekQuote" | "inString" | "done";

export function createJsonStringFieldStreamer(
  field: string,
  onText: (delta: string) => void
): JsonStringFieldStreamer {
  const keyToken = `"${field}"`;
  let phase: Phase = "seekKey";
  let pending = "";
  let value = "";
  let escaping = false;
  let unicodeBuffer: string | null = null;

  function emit(text: string) {
    if (!text) return;
    value += text;
    onText(text);
  }

  function consumeString(text: string) {
    let out = "";
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      if (unicodeBuffer !== null) {
        unicodeBuffer += char;
        i++;
        if (unicodeBuffer.length === 4) {
          const code = Number.parseInt(unicodeBuffer, 16);
          out += Number.isNaN(code) ? "" : String.fromCharCode(code);
          unicodeBuffer = null;
        }
        continue;
      }

      if (escaping) {
        escaping = false;
        i++;
        switch (char) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "u": unicodeBuffer = ""; break;
          default: out += char; // covers \" \\ \/
        }
        continue;
      }

      if (char === "\\") {
        escaping = true;
        i++;
        continue;
      }

      if (char === "\"") {
        phase = "done";
        emit(out);
        return;
      }

      out += char;
      i++;
    }

    emit(out);
  }

  return {
    push(chunk: string) {
      if (phase === "done" || !chunk) return;

      if (phase === "inString") {
        consumeString(chunk);
        return;
      }

      pending += chunk;

      // `consumeString` mutates `phase` through the closure, so read it through a helper
      // to keep TypeScript's control-flow narrowing honest.
      const current = () => phase as Phase;
      while (current() !== "done" && current() !== "inString") {
        if (phase === "seekKey") {
          const index = pending.indexOf(keyToken);
          if (index < 0) {
            // Keep a tail long enough to complete a split key token on the next chunk.
            pending = pending.slice(-keyToken.length);
            return;
          }
          pending = pending.slice(index + keyToken.length);
          phase = "seekColon";
        } else if (phase === "seekColon") {
          const trimmed = pending.replace(/^\s+/, "");
          if (!trimmed) { pending = ""; return; }
          if (trimmed[0] !== ":") {
            // Not actually the key we wanted (e.g. it appeared inside a value). Keep searching.
            pending = trimmed;
            phase = "seekKey";
            continue;
          }
          pending = trimmed.slice(1);
          phase = "seekQuote";
        } else if (phase === "seekQuote") {
          const trimmed = pending.replace(/^\s+/, "");
          if (!trimmed) { pending = ""; return; }
          if (trimmed[0] !== "\"") {
            // Non-string value; nothing to stream.
            phase = "done";
            return;
          }
          pending = "";
          phase = "inString";
          consumeString(trimmed.slice(1));
          return;
        }
      }
    },
    get done() {
      return phase === "done";
    },
    get value() {
      return value;
    }
  };
}
