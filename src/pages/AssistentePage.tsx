import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, User, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import igreenLogo from "@/assets/igreen-logo.png";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Como funciona o desconto na conta de luz?",
  "Quais produtos a iGreen oferece?",
  "Como é o plano de carreira?",
  "Atende na minha cidade?",
  "Diferença entre Green e Solar?",
  "Como funciona o Telecom?",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const STORAGE_KEY = "igreen-chat-history";

function loadSavedMessages(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [
    {
      role: "assistant",
      text: "Olá! 👋 Sou a assistente virtual da **iGreen Energy**.\n\nPosso te ajudar com dúvidas sobre:\n- 💡 Economia na conta de luz\n- 🌱 Nossos produtos e serviços\n- 📈 Plano de carreira\n- 📍 Cobertura na sua região\n\nComo posso te ajudar hoje?",
    },
  ];
}

export default function AssistentePage() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadSavedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const clean = text.trim();
      setMessages((prev) => [...prev, { role: "user", text: clean }]);
      setInput("");
      setLoading(true);

      try {
        const history = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          text: m.text,
        }));
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/igreen-chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY,
            },
            body: JSON.stringify({ message: clean, history }),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.reply || "Desculpe, não consegui responder.",
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Erro de conexão. Tente novamente em instantes.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="h-[100dvh] bg-[#080d09] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-white/[0.06] bg-[#0c120e]/90 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <img
          src={igreenLogo}
          alt="iGreen Energy"
          className="h-9 w-9 object-contain"
        />
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-sm leading-tight">
            Assistente iGreen
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400/70 text-[11px]">Online</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3"
      >
        <div className="max-w-xl mx-auto space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              } animate-in fade-in slide-in-from-bottom-1 duration-200`}
            >
              {/* Avatar */}
              {msg.role === "assistant" ? (
                <img
                  src={igreenLogo}
                  alt=""
                  className="h-7 w-7 rounded-full object-contain shrink-0 bg-emerald-500/10 p-0.5"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-white/50" />
                </div>
              )}

              {/* Bubble */}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-emerald-500 text-white rounded-br-md"
                    : "bg-white/[0.06] text-white/90 rounded-bl-md border border-white/[0.05]"
                }`}
              >
                <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0 prose-strong:text-white prose-headings:text-white">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        if (href && /\.(mp4|webm|mov)(\?|$)/i.test(href)) {
                          return (
                            <video
                              controls
                              playsInline
                              className="rounded-lg max-w-full mt-2 mb-1"
                              preload="metadata"
                            >
                              <source src={href} type="video/mp4" />
                            </video>
                          );
                        }
                        const ytMatch = href?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
                        if (ytMatch) {
                          return (
                            <iframe
                              src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                              title={typeof children === 'string' ? children : 'YouTube video'}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="rounded-lg w-full aspect-video mt-2 mb-1"
                            />
                          );
                        }
                        return (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex items-end gap-2 animate-in fade-in duration-200">
              <img
                src={igreenLogo}
                alt=""
                className="h-7 w-7 rounded-full object-contain shrink-0 bg-emerald-500/10 p-0.5"
              />
              <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3 border border-white/[0.05]">
                <div className="flex gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {messages.length === 1 && !loading && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left text-[12.5px] px-3 py-2.5 rounded-xl
                    bg-white/[0.04] hover:bg-emerald-500/15
                    border border-white/[0.06] hover:border-emerald-500/25
                    text-white/55 hover:text-white/90
                    transition-all duration-200 active:scale-[0.97]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#0c120e]/90 backdrop-blur-xl px-3 py-3 safe-area-pb">
        <div className="max-w-xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre a iGreen..."
            disabled={loading}
            className="flex-1 h-11 px-4 text-sm bg-white/[0.05] border border-white/[0.08] rounded-full
              focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/20
              text-white placeholder:text-white/30 disabled:opacity-40 transition-all"
          />
          <Button
            className="h-11 w-11 p-0 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/20 transition-all disabled:opacity-30"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-center text-[10px] text-white/20 mt-2">
          iGreen Energy © 2026 · As respostas são baseadas em dados verificados
        </p>
      </div>
    </div>
  );
}
