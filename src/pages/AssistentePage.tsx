import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Como funciona a Conexão Green?",
  "Quais as comissões de cada produto?",
  "Explique o plano de carreira",
  "Funciona na minha cidade?",
  "Qual a diferença entre Green e Solar?",
  "Como funciona o Telecom?",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function AssistentePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Olá! 👋 Sou a assistente virtual da iGreen Energy. Posso te ajudar com dúvidas sobre produtos, economia na conta de luz, plano de carreira e muito mais. Como posso te ajudar?" },
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
    setMessages(prev => [...prev, { role: "user", text: text.trim() }]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }));
      const res = await fetch(`${SUPABASE_URL}/functions/v1/igreen-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.reply || "Desculpe, não consegui responder." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Erro de conexão. Tente novamente. 💚" }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#111] px-4 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-base">Assistente iGreen</h1>
          <p className="text-white/40 text-[11px]">Powered by Google AI • Verificação em tempo real</p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-green-400" />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-green-500 text-white rounded-br-md"
                : "bg-white/[0.06] text-white/90 rounded-bl-md border border-white/10"
            }`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-4 w-4 text-white/50" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-green-400" />
            </div>
            <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3 border border-white/10">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)}
                className="text-left text-[13px] px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/70 hover:text-white transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 bg-[#111] p-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua dúvida..."
            disabled={loading}
            className="flex-1 h-11 px-4 text-sm bg-white/[0.06] border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-green-500/50 text-white placeholder:text-white/30 disabled:opacity-50"
          />
          <Button
            className="h-11 w-11 p-0 rounded-xl bg-green-500 hover:bg-green-600 text-white"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
