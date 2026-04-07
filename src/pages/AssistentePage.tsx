import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, User, Loader2, Leaf } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "💡 Como funciona o desconto na conta de luz?",
  "🌱 Quais produtos a iGreen oferece?",
  "📈 Como é o plano de carreira?",
  "📍 Atende na minha cidade?",
  "☀️ Diferença entre Green e Solar?",
  "📱 Como funciona o Telecom?",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function AssistentePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Olá! 👋 Sou a assistente da iGreen Energy.\n\nPosso te ajudar com dúvidas sobre economia na conta de luz, produtos, plano de carreira e muito mais.\n\nComo posso te ajudar?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const clean = text.replace(/^[💡🌱📈📍☀️📱]\s*/, "").trim();
    setMessages(prev => [...prev, { role: "user", text: clean }]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }));
      const res = await fetch(`${SUPABASE_URL}/functions/v1/igreen-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ message: clean, history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.reply || "Desculpe, não consegui responder." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Erro de conexão. Tente novamente em instantes. 💚" }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1a0f] via-[#0d1510] to-[#080e0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-emerald-500/10 bg-[#0d1510]/80 backdrop-blur-md px-4 py-4 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-[15px] tracking-tight">Assistente iGreen</h1>
          <p className="text-emerald-400/50 text-[11px] font-medium">Inteligência Artificial • Dados em tempo real</p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-5 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-1">
                <Leaf className="h-3.5 w-3.5 text-emerald-400" />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[13.5px] leading-[1.7] ${
              msg.role === "user"
                ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-br-lg shadow-lg shadow-emerald-500/15"
                : "bg-white/[0.05] text-white/85 rounded-bl-lg border border-white/[0.06]"
            }`}>
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-white prose-headings:text-white">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center shrink-0 mt-1">
                <User className="h-3.5 w-3.5 text-white/40" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 justify-start animate-in fade-in duration-200">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Leaf className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            </div>
            <div className="bg-white/[0.05] rounded-2xl rounded-bl-lg px-5 py-3.5 border border-white/[0.06]">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)}
                className="text-left text-[13px] px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-emerald-500/10
                  border border-white/[0.06] hover:border-emerald-500/20
                  text-white/60 hover:text-white transition-all duration-200">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-emerald-500/10 bg-[#0d1510]/80 backdrop-blur-md p-3 sm:p-4">
        <div className="max-w-2xl mx-auto flex gap-2.5">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre a iGreen..."
            disabled={loading}
            className="flex-1 h-12 px-4 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl
              focus:outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500/30
              text-white placeholder:text-white/25 disabled:opacity-50 transition-all"
          />
          <Button
            className="h-12 w-12 p-0 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-lg shadow-emerald-500/20 transition-all"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-[10px] text-white/15 mt-2 max-w-2xl mx-auto">
          iGreen Energy © 2026 • As respostas são baseadas em dados verificados
        </p>
      </div>
    </div>
  );
}
