import { useParams } from "react-router-dom";
import { useConsultant } from "@/hooks/useConsultant";
import { useTrackView } from "@/hooks/useTrackView";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Smartphone, Camera, FileText, CheckCircle2, Zap, Shield, Clock, Users, Printer, Sun, Leaf } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import SEOHead from "@/components/SEOHead";
import PixelInjector from "@/components/PixelInjector";
import { SolarPanelSVG, SunRaysSVG } from "@/components/SolarPanelDecoration";

const G_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="white"/><text x="20" y="28" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="26" font-weight="900" fill="#00B74F">G</text></svg>'
)}`;

const CadastroPage = () => {
  const { licenca } = useParams<{ licenca: string }>();
  const { data: consultant, isLoading } = useConsultant(licenca || "");
  const [isVisible, setIsVisible] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  useTrackView(consultant?.id, "cadastro");

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handlePrint = useCallback(() => {
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setShowPrintView(false), 500);
    }, 300);
  }, []);

  if (isLoading) return <LoadingScreen />;

  if (!consultant) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32 mx-auto mb-6 opacity-50" />
          <h1 className="text-3xl font-bold font-heading text-foreground mb-4">Consultor não encontrado</h1>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  const phoneMatch = consultant.phone?.match(/\d+/g)?.join('');
  const phoneNumber = phoneMatch ? `55${phoneMatch}` : "";

  const botMessage = encodeURIComponent(
    "Olá! Gostaria de fazer meu cadastro na iGreen Energy e enviar meus documentos."
  );

  const whatsappBotUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${botMessage}`;

  // Print view - A4 page for printing
  if (showPrintView) {
    return (
      <div className="print-page" ref={printRef}>
        <style>{`
          @media print {
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; }
            .print-page { width: 210mm; min-height: 297mm; }
          }
          .print-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: white;
            font-family: 'Arial', sans-serif;
            position: relative;
            overflow: hidden;
          }
        `}</style>
        
        <div style={{ 
          background: 'linear-gradient(135deg, #006B2D 0%, #00B74F 50%, #FFD700 100%)',
          padding: '40px 30px',
          textAlign: 'center',
          position: 'relative'
        }}>
          {/* Solar decorations on print */}
          <div style={{ position: 'absolute', top: 10, left: 10, opacity: 0.1, fontSize: '80px' }}>☀️</div>
          <div style={{ position: 'absolute', top: 10, right: 10, opacity: 0.1, fontSize: '60px' }}>🌿</div>
          
          <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy" style={{ height: '60px', margin: '0 auto 20px' }} />
          <h1 style={{ color: 'white', fontSize: '36px', fontWeight: 900, margin: '0 0 10px', lineHeight: 1.2 }}>
            Economize de 8% a 20%
          </h1>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 400, margin: 0, opacity: 0.9 }}>
            na sua conta de luz!
          </h2>
        </div>

        <div style={{ padding: '30px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: '#333', marginBottom: '20px', fontWeight: 600 }}>
            📱 Escaneie o QR Code e cadastre-se em 3 minutos
          </p>
          
          <div style={{ display: 'inline-block', padding: '15px', border: '4px solid #00B74F', borderRadius: '20px', marginBottom: '20px' }}>
            <QRCodeSVG
              value={whatsappBotUrl}
              size={280}
              level="H"
              includeMargin={true}
              fgColor="#1a1a1a"
              imageSettings={{
                src: G_LOGO_DATA_URI,
                height: 50,
                width: 50,
                excavate: true,
              }}
            />
          </div>

          <p style={{ fontSize: '14px', color: '#666', marginBottom: '30px' }}>
            Aponte a câmera do celular para o QR Code acima
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginBottom: '30px' }}>
            {[
              { icon: '📷', title: '1. Escaneie', desc: 'QR Code' },
              { icon: '📄', title: '2. Envie', desc: 'Documentos' },
              { icon: '✅', title: '3. Pronto!', desc: 'Cadastro feito' },
            ].map((s) => (
              <div key={s.title} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '5px' }}>{s.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#00B74F' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ 
            background: '#f0fdf4', 
            border: '2px solid #00B74F', 
            borderRadius: '12px', 
            padding: '15px', 
            marginBottom: '20px' 
          }}>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#00B74F', margin: '0 0 5px' }}>
              ✨ Sem instalar placas • Sem obras • Sem custos
            </p>
            <p style={{ fontSize: '14px', color: '#333', margin: 0 }}>
              Energia solar por assinatura - economia garantida todos os meses!
            </p>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '15px', marginTop: '15px' }}>
            <p style={{ fontSize: '12px', color: '#999', margin: '0 0 5px' }}>Atendimento com</p>
            <p style={{ fontSize: '18px', fontWeight: 700, color: '#333', margin: '0 0 3px' }}>
              {consultant.name}
            </p>
            {consultant.igreen_id && (
              <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>ID iGreen: {consultant.igreen_id}</p>
            )}
            <p style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>📞 {consultant.phone}</p>
          </div>
        </div>

        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          background: '#006B2D', 
          padding: '15px', 
          textAlign: 'center' 
        }}>
          <p style={{ color: 'white', fontSize: '12px', margin: 0, opacity: 0.8 }}>
            🔒 Cadastro seguro e automatizado • iGreen Energy © 2026
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PixelInjector 
        facebookPixelId={consultant.facebook_pixel_id} 
        googleAnalyticsId={consultant.google_analytics_id} 
      />
      <SEOHead
        title={`Economize até 20% na Conta de Luz - ${consultant.name} | iGreen Energy`}
        description={`Cadastre-se e tenha de 8% a 20% de desconto na conta de luz. Cadastro rápido em 3 minutos via WhatsApp com ${consultant.name}.`}
      />

      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <img 
              src="/images/logo-colorida-igreen.png" 
              alt="iGreen Energy" 
              className="h-10 md:h-12"
            />
            <div className="text-right">
              <p className="text-sm text-white/60">Seu consultor</p>
              <p className="font-bold text-white">{consultant.name}</p>
            </div>
          </div>
        </header>

        {/* Hero Section - QR Code centralizado */}
        <section 
          className={`relative overflow-hidden transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          {/* Background with solar panels */}
          <div className="absolute inset-0" style={{ 
            background: 'linear-gradient(160deg, #001a0d 0%, #003d1a 30%, #006B2D 60%, #004d1a 100%)',
          }} />
          
          {/* Decorations */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <SolarPanelSVG className="absolute -top-8 -right-8 w-56 h-56 text-white opacity-[0.04] rotate-12 animate-[float_8s_ease-in-out_infinite]" />
            <SolarPanelSVG className="absolute -bottom-12 -left-12 w-72 h-72 text-white opacity-[0.03] -rotate-12 animate-[float_10s_ease-in-out_infinite_1s]" />
            <SolarPanelSVG className="absolute top-20 -left-6 w-36 h-36 text-white opacity-[0.03] rotate-45 animate-[float_12s_ease-in-out_infinite_2s]" />
            <SunRaysSVG className="absolute -top-16 left-1/2 -translate-x-1/2 w-[600px] h-[600px] text-emerald-400 opacity-[0.08]" />
            
            {/* Glow orbs */}
            <div className="absolute top-20 right-[10%] w-80 h-80 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, #00B74F, transparent 70%)' }}
            />
            <div className="absolute bottom-10 left-[5%] w-60 h-60 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #FFD700, transparent 70%)' }}
            />
          </div>

          <div className="container mx-auto px-4 py-16 md:py-24 relative z-10">
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 backdrop-blur-md px-5 py-2.5 rounded-full border border-emerald-400/30">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                </span>
                <span className="text-emerald-100 text-sm font-semibold tracking-wide">ECONOMIA GARANTIDA</span>
              </div>
            </div>

            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy" className="h-16 md:h-20" />
            </div>

            {/* Title */}
            <h1 className="text-center mb-3">
              <span className="block text-3xl md:text-5xl lg:text-6xl font-black text-white font-heading leading-tight">
                Cadastre-se e tenha{" "}
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #FF8C00, #FFD700, #FF8C00)' }}>
                  8% a 20% de desconto
                </span>
              </span>
              <span className="block text-2xl md:text-4xl lg:text-5xl font-black text-white font-heading mt-2">
                na sua conta de luz
              </span>
            </h1>

            <p className="text-white/70 text-center text-base md:text-lg max-w-2xl mx-auto mb-10">
              Sem instalar placas solares, sem obras, sem custos — energia solar por assinatura com cadastro em 3 minutos
            </p>

            {/* QR Code Card - Centralizado como hero principal */}
            <div className="max-w-md mx-auto mb-10">
              <div className="relative bg-white rounded-3xl p-6 md:p-8 shadow-2xl"
                style={{
                  boxShadow: '0 0 60px rgba(0, 183, 79, 0.25), 0 25px 80px rgba(0,0,0,0.3)'
                }}
              >
                {/* Glow border */}
                <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-emerald-400/40 via-transparent to-yellow-400/30 -z-10 blur-sm" />

                <div className="flex flex-col items-center">
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 font-heading">
                    📱 Escaneie o QR Code
                  </h2>
                  <p className="text-gray-500 text-sm mb-5">
                    Aponte a câmera do celular e cadastre-se agora
                  </p>

                  {/* QR Code */}
                  <div className="relative bg-white p-3 rounded-2xl shadow-inner mb-5 border-4 border-emerald-100">
                    <QRCodeSVG
                      value={whatsappBotUrl}
                      size={typeof window !== 'undefined' && window.innerWidth < 768 ? 200 : 240}
                      level="H"
                      includeMargin={true}
                      fgColor="#1a1a1a"
                      imageSettings={{
                        src: G_LOGO_DATA_URI,
                        height: 45,
                        width: 45,
                        excavate: true,
                      }}
                    />
                  </div>

                  {/* Mobile WhatsApp button */}
                  <a
                    href={whatsappBotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lg:hidden w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-3"
                  >
                    <Smartphone className="w-5 h-5" />
                    Abrir WhatsApp Agora
                  </a>

                  {/* Desktop link */}
                  <div className="hidden lg:block text-center mb-4">
                    <p className="text-gray-400 text-xs mb-1">Ou acesse pelo celular:</p>
                    <a href={whatsappBotUrl} className="text-[#25D366] hover:text-[#20BA5A] font-semibold text-sm underline inline-flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5" />
                      Clique aqui para abrir
                    </a>
                  </div>

                  {/* Consultant info */}
                  <div className="pt-4 border-t border-gray-100 w-full text-center">
                    <p className="text-gray-400 text-xs">Consultor(a)</p>
                    <p className="text-gray-900 font-bold">{consultant.name}</p>
                    {consultant.igreen_id && (
                      <p className="text-gray-400 text-xs">ID: {consultant.igreen_id}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Botão Gerar PDF */}
            <div className="flex justify-center mb-8">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-semibold py-3 px-6 rounded-full border border-white/20 transition-all hover:scale-105"
              >
                <Printer className="w-5 h-5" />
                Gerar PDF para Imprimir
              </button>
            </div>

            {/* 3 Steps inline */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
              {[
                { icon: Camera, num: "1", title: "Escaneie o QR Code", desc: "Use a câmera do celular" },
                { icon: FileText, num: "2", title: "Envie Documentos", desc: "RG ou CNH + conta de luz" },
                { icon: CheckCircle2, num: "3", title: "Pronto!", desc: "Cadastro em 3 minutos" },
              ].map((step) => (
                <div key={step.num} className="flex flex-col items-center text-center bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 border border-emerald-400/30">
                    <step.icon className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-white font-bold text-sm mb-1">{step.title}</h3>
                  <p className="text-white/60 text-xs">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex justify-center gap-8 md:gap-16">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white">600mil+</div>
                <div className="text-white/50 text-xs uppercase tracking-wider">Clientes</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white">500+</div>
                <div className="text-white/50 text-xs uppercase tracking-wider">Usinas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white">27</div>
                <div className="text-white/50 text-xs uppercase tracking-wider">Estados</div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 md:py-20 bg-[#0f0f0f]">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-4xl font-black text-white text-center mb-3 font-heading">
              Por que fazer seu cadastro agora?
            </h2>
            <p className="text-white/50 text-center text-base mb-12 max-w-2xl mx-auto">
              Junte-se a mais de 600 mil clientes que já economizam na conta de luz
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
              {[
                { icon: Zap, title: "Economia Garantida", desc: "De 8% a 20% de desconto todo mês na sua conta de luz" },
                { icon: Clock, title: "Rápido e Fácil", desc: "Cadastro completo em 3 minutos pelo WhatsApp" },
                { icon: Shield, title: "100% Seguro", desc: "Dados protegidos com criptografia de ponta" },
                { icon: Users, title: "600mil+ Clientes", desc: "Maior rede de energia solar do Brasil" },
              ].map((b) => (
                <div key={b.title} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.07] transition-all group">
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <b.icon className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-white text-lg mb-2">{b.title}</h3>
                  <p className="text-white/50 text-sm">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works - detailed steps */}
        <section className="py-16 md:py-20 bg-[#0a0a0a]">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-4xl font-black text-white text-center mb-3 font-heading">
              Como funciona o processo?
            </h2>
            <p className="text-white/50 text-center text-base mb-12 max-w-2xl mx-auto">
              Passo a passo do seu cadastro
            </p>

            <div className="max-w-3xl mx-auto space-y-4">
              {[
                { step: "1", title: "Escaneie o QR Code", description: "Use a câmera do celular para escanear. O WhatsApp abre automaticamente." },
                { step: "2", title: "Converse com o Bot", description: "Nosso assistente virtual vai te guiar em cada etapa do cadastro." },
                { step: "3", title: "Envie RG ou CNH", description: "RG: frente e verso. CNH: apenas a frente. O sistema extrai os dados automaticamente." },
                { step: "4", title: "Envie a Conta de Energia", description: "Foto da última fatura. Extraímos endereço, consumo e distribuidora." },
                { step: "5", title: "Confirme os Dados", description: "Revise as informações extraídas e confirme." },
                { step: "6", title: "Receba o Link", description: "Em minutos você recebe o link para assinar e ativar seu desconto!" },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 items-start bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-emerald-500/20 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base mb-1">{item.title}</h3>
                    <p className="text-white/50 text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-16 md:py-20 relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, #003d1a 0%, #006B2D 50%, #004d1a 100%)'
        }}>
          <SolarPanelSVG className="absolute -bottom-10 -right-10 w-48 h-48 text-white opacity-[0.04] rotate-12" />
          
          <div className="container mx-auto px-4 text-center relative z-10">
            <h2 className="text-2xl md:text-4xl font-black text-white mb-4 font-heading">
              Pronto para economizar?
            </h2>
            <p className="text-white/70 text-base mb-8 max-w-xl mx-auto">
              Escaneie o QR Code agora e comece a ter desconto na sua conta de luz
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-8 rounded-xl transition-colors shadow-lg"
              >
                <Camera className="w-5 h-5" />
                Voltar ao QR Code
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-4 px-8 rounded-xl border border-white/20 transition-all"
              >
                <Printer className="w-5 h-5" />
                Imprimir QR Code
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#050505] py-10 text-center border-t border-white/5">
          <img 
            src="/images/logo-colorida-igreen.png" 
            alt="iGreen Energy" 
            className="mx-auto mb-4 w-36" 
          />
          <p className="text-white/40 text-sm tracking-wider">
            {consultant.name.toUpperCase()} | CONSULTOR(A) IGREEN ENERGY
            {consultant.igreen_id && ` ID ${consultant.igreen_id}`}
          </p>
          <p className="text-white/20 text-xs mt-2">
            © 2026 iGreen Energy. Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </>
  );
};

export default CadastroPage;
