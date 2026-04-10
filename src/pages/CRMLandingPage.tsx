import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  LayoutDashboard,
  Users,
  Clock,
  Send,
  BarChart3,
  Zap,
  Shield,
  Headphones,
  ChevronRight,
  Play,
  CheckCircle2,
} from "lucide-react";

const WHATSAPP_CTA = "https://api.whatsapp.com/send?phone=5500000000000&text=Ol%C3%A1,%20quero%20conhecer%20o%20CRM%20iGreen";

/* ── Animated Counter ── */
const AnimatedCounter = ({ target, suffix = "" }: { target: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    const start = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      if (isMobile) { setCount(target); return; }
      let s = 0;
      const dur = 2000;
      const step = (ts: number) => {
        if (!s) s = ts;
        const p = Math.min((ts - s) / dur, 1);
        setCount(Math.floor(p * target));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === "undefined" || isMobile) { start(); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { start(); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return <div ref={ref}><span className="stat-number">{count.toLocaleString("pt-BR")}{suffix}</span></div>;
};

/* ── Feature data ── */
const features = [
  {
    icon: MessageSquare,
    title: "WhatsApp Integrado",
    desc: "Envie e receba mensagens direto do CRM, com templates prontos, respostas rápidas e gravação de áudio. Tudo em uma única tela.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-whatsapp.mp3",
  },
  {
    icon: LayoutDashboard,
    title: "Kanban de Vendas",
    desc: "Pipeline visual com drag-and-drop para acompanhar cada negociação do primeiro contato até o fechamento.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-kanban.mp3",
  },
  {
    icon: Users,
    title: "Gestão de Clientes",
    desc: "Cadastro completo, importação em massa via planilha, histórico de conversas e segmentação por tags.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-clientes.mp3",
  },
  {
    icon: Clock,
    title: "Mensagens Agendadas",
    desc: "Programe follow-ups automáticos e sequências de mensagens para nunca perder o timing da venda.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-agendadas.mp3",
  },
  {
    icon: Send,
    title: "Mensagens em Massa",
    desc: "Envio em lote com templates personalizados, incluindo imagens e áudios para toda a sua base de contatos.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-massa.mp3",
  },
  {
    icon: BarChart3,
    title: "Dashboard de Métricas",
    desc: "Gráficos de performance, taxa de resposta, conversão por etapa e ranking de consultores em tempo real.",
    audio: "https://igreen-minio.b099mi.easypanel.host/igreen/crm-audio-dashboard.mp3",
  },
];

const steps = [
  { num: "01", title: "Crie sua conta", desc: "Cadastro rápido e seguro em menos de 2 minutos." },
  { num: "02", title: "Conecte seu WhatsApp", desc: "Escaneie o QR Code e comece a atender pelo CRM." },
  { num: "03", title: "Comece a vender", desc: "Gerencie clientes, automatize mensagens e acompanhe resultados." },
];

const differentials = [
  { icon: Zap, title: "Integração Nativa", desc: "Conecta direto com a plataforma iGreen Energy sem configurações extras." },
  { icon: Shield, title: "Sem Custo Extra", desc: "Incluído no seu plano de licenciado. Sem mensalidades adicionais." },
  { icon: Headphones, title: "Suporte Dedicado", desc: "Equipe pronta para te ajudar a tirar o máximo do CRM." },
];

/* ── Page ── */
const CRMLandingPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, hsl(130,100%,36%), transparent 70%)" }} />
          <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, hsl(130,100%,36%), transparent 70%)" }} />
        </div>

        <div className="section-container text-center py-10 md:py-20 relative z-10">
          <div className="flex flex-col items-center gap-3 mb-6 md:mb-8">
            <div className="badge-green animate-fade-in !py-1.5 !px-4">
              <span className="glow-dot" />
              <span className="text-xs">CRM iGreen Energy</span>
            </div>
            <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy Logo" width={300} height={92} className="w-32 md:w-56 animate-fade-in" />
          </div>

          <h1 className="font-heading font-black mb-4 md:mb-6 text-[1.5rem] sm:text-3xl md:text-4xl lg:text-[3rem] leading-[1.15] max-w-5xl mx-auto px-4">
            Gerencie seus clientes, automatize vendas e{" "}
            <span className="relative inline" style={{ color: "hsl(var(--primary))" }}>feche mais negócios</span>
          </h1>

          <p className="hidden sm:block text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto mb-8 md:mb-12 leading-relaxed">
            O CRM completo com WhatsApp integrado, Kanban de vendas, mensagens automáticas e dashboard de métricas — tudo em um só lugar.
          </p>

          {/* Video */}
          <div className="max-w-4xl mx-auto mb-8 md:mb-12 rounded-xl md:rounded-2xl overflow-hidden relative" style={{ boxShadow: "var(--shadow-green-lg)" }}>
            <div className="absolute inset-0 rounded-xl md:rounded-2xl border border-primary/20 z-10 pointer-events-none" />
            <video controls playsInline className="w-full aspect-video relative z-0" poster="">
              <source src="https://igreen-minio.b099mi.easypanel.host/igreen/Green_Energy.mp4" type="video/mp4" />
              Seu navegador não suporta vídeos.
            </video>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
            <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green !py-3 sm:!py-4 !px-8 !text-base sm:!text-lg">
              ⚡ Quero conhecer o CRM
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-3xl mx-auto mt-12 md:mt-16 pt-8 border-t border-border">
            <div className="text-center">
              <AnimatedCounter target={6} suffix="+" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Módulos integrados</p>
            </div>
            <div className="text-center">
              <AnimatedCounter target={100} suffix="%" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Automatizado</p>
            </div>
            <div className="text-center">
              <AnimatedCounter target={24} suffix="/7" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Disponível</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FUNCIONALIDADES ═══ */}
      <section className="section-gradient">
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Funcionalidades</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Tudo que você precisa para vender mais
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Cada módulo foi pensado para simplificar sua rotina e aumentar suas conversões.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {features.map((f) => (
              <div key={f.title} className="glass-card group cursor-default">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-primary/15 text-primary group-hover:bg-primary/25 transition-colors">
                  <f.icon size={24} />
                </div>
                <h3 className="font-heading font-bold text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{f.desc}</p>
                <audio controls preload="none" className="w-full h-10 rounded-lg [&::-webkit-media-controls-panel]:bg-secondary [&::-webkit-media-controls-current-time-display]:text-foreground [&::-webkit-media-controls-time-remaining-display]:text-foreground">
                  <source src={f.audio} type="audio/mpeg" />
                  Seu navegador não suporta áudio.
                </audio>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMO FUNCIONA ═══ */}
      <section>
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Como funciona</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Comece em 3 passos simples
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                <div className="product-number mx-auto mb-5 text-2xl">{s.num}</div>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%]">
                    <div className="border-t-2 border-dashed border-primary/30" />
                  </div>
                )}
                <h3 className="font-heading font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DIFERENCIAIS ═══ */}
      <section className="section-gradient">
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Diferenciais</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Por que escolher o CRM iGreen?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {differentials.map((d) => (
              <div key={d.title} className="glass-card text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-primary/15 text-primary">
                  <d.icon size={28} />
                </div>
                <h3 className="font-heading font-bold text-lg mb-2">{d.title}</h3>
                <p className="text-sm text-muted-foreground">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, hsl(130 100% 36% / 0.08), transparent 70%)" }} />
        <div className="section-container text-center relative z-10">
          <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl mb-4">
            Pronto para transformar suas vendas?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8 text-lg">
            Junte-se aos consultores que já estão fechando mais negócios com o CRM iGreen Energy.
          </p>
          <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green !py-4 !px-10 !text-lg">
            💬 Falar com um especialista
          </a>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Sem cartão de crédito</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Setup em minutos</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Suporte incluso</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} iGreen Energy — Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
};

export default CRMLandingPage;
