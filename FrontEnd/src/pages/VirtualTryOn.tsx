import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Send, Image as ImageIcon, Camera, Mic, MicOff, X, Loader2, ShoppingBag } from "lucide-react";
import {
  type ChatMessage,
  type ChatSession,
  type AssistantPayload,
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  sendChatMessage,
} from "../api/chat";
import { dominantColorFromFile, dominantColorFromVideo } from "../utils/colorAnalysis";
import { useAuth } from "../store/AuthContext";

// ----- small helpers -----

function isAssistantPayload(p: ChatMessage["payload"]): p is AssistantPayload {
  return !!p && typeof p === "object" && "products" in p;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// ----- Web Speech API typing -----

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
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

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ============================================================================

export const VirtualTryOn: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingImage, setPendingImage] = useState<{ url: string; hint: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    listChatSessions()
      .then((s) => {
        setSessions(s);
        if (s.length > 0) setActiveId((cur) => cur ?? s[0].id);
      })
      .catch((e) => setError(String(e)));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    listChatMessages(activeId)
      .then(setMessages)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e) => setError("Camera: " + String(e)));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      recogRef.current?.abort();
      recogRef.current = null;
    };
  }, []);

  async function ensureSession(): Promise<string> {
    if (activeId) return activeId;
    const s = await createChatSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    return s.id;
  }

  async function handleNewChat() {
    try {
      const s = await createChatSession();
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      setMessages([]);
      setPendingImage(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && !pendingImage) return;
    setSending(true);
    setError(null);
    try {
      const sid = await ensureSession();
      const optimisticUser: ChatMessage = {
        id: "tmp-" + Date.now(),
        role: "user",
        content: text,
        payload: pendingImage ? { image_url: pendingImage.url } : null,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimisticUser]);
      setInput("");
      const imgHint = pendingImage?.hint ?? "";
      const imgUrl = pendingImage?.url ?? "";
      setPendingImage(null);

      const res = await sendChatMessage(sid, text, { imageHint: imgHint, imageUrl: imgUrl });
      setMessages((m) => {
        const filtered = m.filter((msg) => msg.id !== optimisticUser.id);
        return [...filtered, res.user, res.assistant];
      });
      setSessions((prev) => {
        const found = prev.find((s) => s.id === sid);
        if (!found) return prev;
        const updated: ChatSession = {
          ...found,
          updated_at: new Date().toISOString(),
          title:
            found.title === "New chat" || !found.title
              ? text.slice(0, 60) || "New chat"
              : found.title,
        };
        return [updated, ...prev.filter((s) => s.id !== sid)];
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  async function handlePickImage(file: File) {
    try {
      const hint = await dominantColorFromFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImage({ url: String(reader.result), hint });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleCaptureFromCamera() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const W = 480;
    const H = (v.videoHeight / Math.max(v.videoWidth, 1)) * 480 || 360;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, W, H);
    const url = c.toDataURL("image/jpeg", 0.85);
    const hint = dominantColorFromVideo(v);
    setPendingImage({ url, hint });
    setCameraOpen(false);
  }

  function toggleVoice() {
    const SR = getSpeechRecognition();
    if (!SR) {
      setError("Tu navegador no soporta reconocimiento de voz.");
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "es-ES";
    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      let txt = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        txt += ev.results[i][0].transcript;
      }
      setInput((prev) => (prev ? prev + " " + txt : txt));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recogRef.current = rec;
    setListening(true);
  }

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <h1 className="text-3xl font-bold mb-3 text-gray-900 dark:text-gray-100">Asistente AI de compras</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Inicia sesión para chatear con la IA, subir fotos o usar la cámara y encontrar
          productos al instante.
        </p>
        <button
          className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          onClick={() => navigate("/login")}
        >
          Ingresar
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus size={16} /> Nuevo chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No hay chats todavía.</p>
          ) : (
            <ul>
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={classNames(
                    "group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-800 dark:text-gray-200",
                    activeId === s.id && "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-200"
                  )}
                  onClick={() => setActiveId(s.id)}
                >
                  <span className="truncate flex-1">{s.title || "New chat"}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(s.id);
                    }}
                    aria-label="Delete chat"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <section className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold truncate text-gray-900 dark:text-gray-100">
            {activeSession?.title || "Asistente AI de compras"}
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">
            Texto · Imagen · Cámara · Voz
          </span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {!activeSession && messages.length === 0 && (
            <EmptyHero onExample={(t) => setInput(t)} />
          )}
          {loadingMsgs && (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onShop={(url) => navigate(url)} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-gray-500 text-sm pl-4">
              <Loader2 className="animate-spin" size={16} /> Pensando…
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm border-t border-red-200 dark:border-red-800">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              cerrar
            </button>
          </div>
        )}

        {pendingImage && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-3">
            <img
              src={pendingImage.url}
              alt="adjunto"
              className="w-12 h-12 object-cover rounded"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Color detectado: <strong>{pendingImage.hint || "—"}</strong>
            </span>
            <button
              onClick={() => setPendingImage(null)}
              className="ml-auto text-gray-400 hover:text-red-600"
              aria-label="Quitar imagen"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-end gap-2">
            <label className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-600 dark:text-gray-300" title="Subir imagen">
              <ImageIcon size={20} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePickImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Usar cámara"
              onClick={() => setCameraOpen(true)}
            >
              <Camera size={20} />
            </button>
            <button
              className={classNames(
                "p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700",
                listening ? "text-red-600" : "text-gray-600 dark:text-gray-300"
              )}
              title={listening ? "Detener" : "Hablar"}
              onClick={toggleVoice}
            >
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder="Pregúntame por un producto, una marca, o describe lo que buscas…"
              className="flex-1 resize-none border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              title="Enviar"
            >
              {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </section>

      {cameraOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden max-w-2xl w-full">
            <div className="p-3 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cámara en vivo</h3>
              <button onClick={() => setCameraOpen(false)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] bg-black" />
            <div className="p-3 flex justify-end gap-2">
              <button
                onClick={() => setCameraOpen(false)}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleCaptureFromCamera}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Capturar y analizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================

const EmptyHero: React.FC<{ onExample: (t: string) => void }> = ({ onExample }) => {
  const examples = [
    "Quiero una camisa blanca talla M de la marca Adidas",
    "Muéstrame zapatillas Nike por menos de $100",
    "Busco un vestido rojo para una fiesta",
  ];
  return (
    <div className="max-w-2xl mx-auto text-center pt-12">
      <h2 className="text-2xl font-bold mb-2">¿Qué estás buscando hoy?</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Describe lo que quieres, sube una foto o activa la cámara — encontraré los mejores
        productos del catálogo para ti.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="p-3 border border-gray-200 dark:border-gray-600 rounded-md text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-indigo-400"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================

const MessageBubble: React.FC<{ msg: ChatMessage; onShop: (url: string) => void }> = ({
  msg,
  onShop,
}) => {
  const isUser = msg.role === "user";
  const navigate = useNavigate();

  const userImage =
    !isAssistantPayload(msg.payload) && msg.payload && "image_url" in msg.payload
      ? msg.payload.image_url
      : undefined;

  return (
    <div className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={classNames(
          "max-w-2xl rounded-lg px-4 py-3 text-sm whitespace-pre-wrap",
          isUser ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
        )}
      >
        {userImage && (
          <img src={userImage} alt="adjunto" className="mb-2 max-h-48 rounded" />
        )}
        {msg.content && <p>{msg.content}</p>}

        {isAssistantPayload(msg.payload) && msg.payload.products.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {msg.payload.products.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/products/${p.id}`)}
                className="text-left border rounded-md overflow-hidden hover:shadow bg-white"
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
                    <ShoppingBag size={28} />
                  </div>
                )}
                <div className="p-2 text-xs">
                  <div className="font-medium text-gray-900 line-clamp-2">{p.name}</div>
                  <div className="text-gray-600 mt-0.5">${p.price.toFixed(2)}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {isAssistantPayload(msg.payload) && msg.payload.shop_url && (
          <button
            onClick={() => {
              const url =
                isAssistantPayload(msg.payload) && msg.payload.shop_url
                  ? msg.payload.shop_url
                  : "/shop";
              onShop(url);
            }}
            className="mt-3 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700"
          >
            <ShoppingBag size={14} /> Ver todos en Shop
          </button>
        )}
      </div>
    </div>
  );
};

export default VirtualTryOn;
