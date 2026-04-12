import { useParams } from "react-router-dom";
import { useConsultant } from "@/hooks/useConsultant";
import { useTrackView } from "@/hooks/useTrackView";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";
import { Smartphone, Camera, FileText, CheckCircle2, Zap, Shield, Clock, Users } from "lucide-react";
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
  
  useTrackView(consultant?.id, "cadastro");

  useEffect(() => {
    setIsVisible(true);
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

  return (
    <>
      <PixelInjector 
        facebookPixelId={consultant.facebook_pixel_id} 
        googleAnalyticsId={consultant.google_analytics_id} 
      />
      <SEOHead
        title={`Cadastro Rápido - ${consultant.name} | iGreen Energy`}
        description={`Faça seu cadastro em 3 minutos via WhatsApp com ${consultant.name}. Envie seus documentos e comece a economizar na conta de luz!`}
      />

      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <img 
              src="/images/logo-colorida-igreen.png" 
              alt="iGreen Energy" 
              className="h-10 md:h-12"
            />
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Seu consultor</p>
              <p className="font-bold text-foreground">{consultant.name}</p>
            </div>
          </div>
        </header>

        {/* Hero Section com QR Code + Solar Decorations */}
        <section 
          className={`relative overflow-hidden transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
          style={{ 
            background: 'linear-gradient(135deg, hsl(130, 100%, 20%) 0%, hsl(130, 90%, 32%) 40%, hsl(45, 100%, 50%) 100%)',
          }}
        >
          {/* Solar panel decorations */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Top-right solar panel */}
            <SolarPanelSVG className="absolute -top-10 -right-10 w-64 h-64 text-white opacity-[0.07] rotate-12 animate-[float_8s_ease-in-out_infinite]" />
            {/* Bottom-left solar panel */}
            <SolarPanelSVG className="absolute -bottom-16 -left-16 w-80 h-80 text-white opacity-[0.05] -rotate-12 animate-[float_10s_ease-in-out_infinite_1s]" />
            {/* Mid-right small panel */}
            <SolarPanelSVG className="absolute top-1/2 -right-8 w-40 h-40 text-white opacity-[0.04] rotate-45 animate-[float_12s_ease-in-out_infinite_2s]" />
            {/* Sun rays center-top */}
            <SunRaysSVG className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] text-yellow-300 opacity-[0.15]" />
            {/* Radial glows */}
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-15" 
              style={{ background: 'radial-gradient(circle, hsl(45, 100%, 60%), transparent 70%)' }} 
            />
            <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-10" 
              style={{ background: 'radial-gradient(circle, hsl(130, 100%, 50%), transparent 70%)' }} 
            />
            {/* Grid pattern overlay */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px'
              }}
            />
          </div>

          <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/25 shadow-lg shadow-black/10">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-300"></span>
                </span>
                <span className="text-white text-sm font-semibold tracking-wide">Cadastro 100% Automático</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white text-center mb-4 font-heading drop-shadow-lg">
              ⚡ Cadastro em 3 Minutos
            </h1>
            <p className="text-white/90 text-center text-lg md:text-xl max-w-3xl mx-auto mb-12 drop-shadow">
              Escaneie o QR Code, envie seus documentos pelo WhatsApp e pronto!<br />
              Nosso sistema automatizado cuida de tudo para você.
            </p>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-2 gap-8 md:gap-12 max-w-6xl mx-auto items-start">
              {/* QR Code Card */}
              <div className="order-2 lg:order-1">
                <div className="relative bg-white/95 backdrop-blur-sm rounded-3xl p-6 md:p-8 shadow-2xl transform hover:scale-[1.03] transition-all duration-300 border border-white/50"
                  style={{
                    boxShadow: '0 0 40px rgba(0, 183, 79, 0.2), 0 20px 60px rgba(0,0,0,0.15)'
                  }}
                >
                  {/* Glow border effect */}
                  <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-[#00B74F]/30 via-transparent to-yellow-400/20 -z-10 blur-sm" />
                  
                  <div className="flex flex-col items-center">
                    <div className="mb-6 text-center">
                      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 font-heading">
                        📱 Escaneie Agora
                      </h2>
                      <p className="text-gray-600 text-sm md:text-base">
                        Aponte a câmera do seu celular para o QR Code
                      </p>
                    </div>

                    {/* QR Code with green border glow */}
                    <div className="relative bg-white p-4 rounded-2xl shadow-inner mb-6 border-4 border-[#00B74F]/15">
                      <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-[#00B74F]/10 to-yellow-400/10 -z-10 blur-md" />
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

                    {/* Mobile button */}
                    <a
                      href={whatsappBotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lg:hidden w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg mb-4"
                    >
                      <Smartphone className="w-5 h-5" />
                      Abrir WhatsApp Agora
                    </a>

                    {/* Desktop info */}
                    <div className="hidden lg:block text-center">
                      <p className="text-gray-500 text-sm mb-2">
                        Ou acesse pelo celular:
                      </p>
                      <a
                        href={whatsappBotUrl}
                        className="text-[#25D366] hover:text-[#20BA5A] font-semibold text-sm underline inline-flex items-center gap-1"
                      >
                        <Smartphone className="w-4 h-4" />
                        Clique aqui para abrir
                      </a>
                    </div>

                    {/* Consultant info */}
                    <div className="mt-6 pt-6 border-t border-gray-200 w-full text-center">
                      <p className="text-gray-500 text-sm mb-1">
                        Atendimento personalizado com
                      </p>
                      <p className="text-gray-900 font-bold text-lg">
                        {consultant.name}
                      </p>
                      {consultant.igreen_id && (
                        <p className="text-gray-400 text-xs mt-1">
                          ID iGreen: {consultant.igreen_id}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="order-1 lg:order-2 space-y-6">
                <div className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border-2 border-white/30 group-hover:scale-110 group-hover:bg-white/25 transition-all shadow-lg">
                    <Camera className="w-7 h-7 text-white drop-shadow" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading drop-shadow">
                      1. Escaneie o QR Code
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      Use a câmera do seu celular para escanear o código. O WhatsApp abrirá automaticamente com uma mensagem pronta.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border-2 border-white/30 group-hover:scale-110 group-hover:bg-white/25 transition-all shadow-lg">
                    <FileText className="w-7 h-7 text-white drop-shadow" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading drop-shadow">
                      2. Envie seus Documentos
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      Tire fotos do seu <strong>RG (frente e verso)</strong> ou <strong>CNH (apenas frente)</strong> e da <strong>conta de energia</strong>. Nosso bot extrai os dados automaticamente.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border-2 border-white/30 group-hover:scale-110 group-hover:bg-white/25 transition-all shadow-lg">
                    <CheckCircle2 className="w-7 h-7 text-white drop-shadow" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading drop-shadow">
                      3. Pronto! Cadastro Completo
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      Em poucos minutos você receberá o link para finalizar e começar a economizar até 20% na sua conta de luz!
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-8 pt-8 border-t border-white/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-lg">
                      <div className="text-4xl font-black text-white mb-1 drop-shadow">100%</div>
                      <div className="text-white/80 text-sm uppercase tracking-wider">Automático</div>
                    </div>
                    <div className="text-center bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-lg">
                      <div className="text-4xl font-black text-white mb-1 drop-shadow">3min</div>
                      <div className="text-white/80 text-sm uppercase tracking-wider">Tempo médio</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Security badge */}
            <div className="mt-12 flex justify-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-lg">
                <Shield className="w-5 h-5 text-white" />
                <span className="text-white text-sm">
                  🔒 Seus dados estão seguros e protegidos
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4 font-heading">
                Por que fazer seu cadastro agora?
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Junte-se a mais de 600 mil clientes que já economizam na conta de luz
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              <div className="glass-card text-center p-6 hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2 font-heading">Economia Garantida</h3>
                <p className="text-muted-foreground text-sm">
                  Até 20% de desconto na sua conta de luz todos os meses
                </p>
              </div>

              <div className="glass-card text-center p-6 hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2 font-heading">Rápido e Fácil</h3>
                <p className="text-muted-foreground text-sm">
                  Cadastro completo em apenas 3 minutos pelo WhatsApp
                </p>
              </div>

              <div className="glass-card text-center p-6 hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2 font-heading">100% Seguro</h3>
                <p className="text-muted-foreground text-sm">
                  Seus dados protegidos com criptografia de ponta
                </p>
              </div>

              <div className="glass-card text-center p-6 hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2 font-heading">600mil+ Clientes</h3>
                <p className="text-muted-foreground text-sm">
                  Faça parte da maior rede de energia solar do Brasil
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4 font-heading">
                Como funciona o processo?
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Veja o passo a passo completo do seu cadastro
              </p>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
              {[
                { step: "1", title: "Escaneie o QR Code", description: "Use a câmera do celular para escanear. O WhatsApp abre automaticamente." },
                { step: "2", title: "Converse com o Bot", description: "Nosso assistente virtual vai te guiar em cada etapa do cadastro." },
                { step: "3", title: "Envie RG ou CNH", description: "RG: frente e verso. CNH: apenas a frente. O sistema extrai os dados automaticamente." },
                { step: "4", title: "Envie a Conta de Energia", description: "Foto da última fatura. Extraímos endereço, consumo e distribuidora." },
                { step: "5", title: "Confirme os Dados", description: "Revise as informações extraídas e confirme se está tudo correto." },
                { step: "6", title: "Receba o Link", description: "Em minutos você recebe o link para assinar e ativar seu desconto!" },
              ].map((item) => (
                <div key={item.step} className="glass-card p-6 flex gap-4 items-start hover:shadow-lg transition-shadow">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xl">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 font-heading">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4 font-heading">
              Pronto para economizar?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Escaneie o QR Code agora e comece seu cadastro em 3 minutos
            </p>
            <a
              href="#top"
              className="btn-cta-lg inline-flex items-center gap-2 animate-pulse-green"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <Camera className="w-5 h-5" />
              Voltar ao QR Code
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-card/50 py-10 text-center border-t border-border">
          <img 
            src="/images/logo-colorida-igreen.png" 
            alt="iGreen Energy" 
            className="mx-auto mb-4 w-36" 
          />
          <p className="text-muted-foreground font-heading text-sm tracking-wider">
            {consultant.name.toUpperCase()} | CONSULTOR(A) IGREEN ENERGY
            {consultant.igreen_id && ` ID ${consultant.igreen_id}`}
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            © 2026 iGreen Energy. Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </>
  );
};

export default CadastroPage;
