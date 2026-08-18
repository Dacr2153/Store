import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}

function getSR(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Props {
  onTranscript: (text: string) => void;
  onCommit?: (text: string) => void; // called on final result (e.g. submit search)
  className?: string;
}

export const VoiceSearchButton: React.FC<Props> = ({ onTranscript, onCommit, className = "" }) => {
  const { i18n, t } = useTranslation();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = typeof window !== "undefined" && !!getSR();

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening && recRef.current) {
      recRef.current.stop();
      return;
    }
    const SR = getSR();
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = i18n.resolvedLanguage?.startsWith("es") ? "es-ES" : "en-US";

    rec.onresult = (ev) => {
      let text = "";
      let final = false;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        text += ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final = true;
      }
      onTranscript(text.trim());
      if (final && onCommit) onCommit(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={t("nav.voiceSearch")}
      aria-label={t("nav.voiceSearch")}
      className={`px-3 transition-colors ${
        listening
          ? "bg-red-500 text-white"
          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:text-brand-500 dark:hover:text-blue-400"
      } ${className}`}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
};
