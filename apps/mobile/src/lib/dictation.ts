import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = getSpeechRecognitionCtor() !== null;

/**
 * Wraps the browser's native Web Speech API directly, rather than a Capacitor
 * plugin — the obvious candidate, @capacitor-community/speech-recognition, ships
 * a web implementation where every method just throws "unimplemented on web",
 * so it can't be exercised at all under the browser-only testing this project
 * is doing before native shells exist. Swap to that plugin's start/stop/
 * partialResults API once `cap add ios`/`android` lands — neither WebView
 * exposes the Web Speech API this hook depends on, so this stops working the
 * moment the app runs natively rather than in a browser tab.
 */
export function useDictation(onFinalText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;
  // Mirrors interimText outside React state so onend can read the latest value without
  // putting a side effect inside a setState updater — React (StrictMode in dev, but the
  // rule holds in production too) is free to invoke updater functions more than once,
  // which double-committed the pending fragment the first time this used
  // `setInterimText(current => { onFinalTextRef.current(current); return ""; })`.
  const interimTextRef = useRef("");

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  useEffect(() => stop, [stop]); // stop listening if the component using this unmounts mid-dictation

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Voice dictation isn't supported in this browser.");
      return;
    }
    setError(null);
    interimTextRef.current = "";
    setInterimText("");

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) onFinalTextRef.current(transcript);
        else interim += transcript;
      }
      interimTextRef.current = interim;
      setInterimText(interim);
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(`Dictation stopped: ${event.error}`);
    };
    recognition.onend = () => {
      // The final interim fragment never arrives as a formal "isFinal" result
      // when recognition ends mid-phrase (stopped manually, or the browser
      // timed out on silence) — commit whatever's left so nothing is lost.
      if (interimTextRef.current.trim()) onFinalTextRef.current(interimTextRef.current);
      interimTextRef.current = "";
      setInterimText("");
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  return { supported: dictationSupported, listening, interimText, error, start, stop };
}
