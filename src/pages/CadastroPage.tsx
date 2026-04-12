import { useParams } from "react-router-dom";
import { useConsultant } from "@/hooks/useConsultant";
import { useTrackView } from "@/hooks/useTrackView";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";
import { Smartphone, Camera, FileText, CheckCircle2, Zap, Shield, Clock, Users } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import SEOHead from "@/components/SEOHead";
import PixelInjector from "@/components/PixelInjector";

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

  // Extrair número do WhatsApp
  const phoneMatch = consultant.phone?.match(/\d+/g)?.join('');
  const phoneNumber = phoneMatch ? `55${phoneMatch}` : "";

  // Mensagem inicial para o bot
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

        {/* Hero Section com QR Code */}
        <section 
          className={`relative overflow-hidden transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
          style={{ 
            background: 'linear-gradient(135deg, hsl(130, 100%, 36%) 0%, hsl(130, 80%, 28%) 100%)',
          }}
        >
          {/* Decorative elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10" 
              style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} 
            />
            <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-10" 
              style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} 
            />
          </div>

          <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <span className="text-white text-sm font-semibold">Cadastro 100% Automático</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white text-center mb-4 font-heading">
              ⚡ Cadastro em 3 Minutos
            </h1>
            <p className="text-white/90 text-center text-lg md:text-xl max-w-3xl mx-auto mb-12">
              Escaneie o QR Code, envie seus documentos pelo WhatsApp e pronto!<br />
              Nosso sistema automatizado cuida de tudo para você.
            </p>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-2 gap-8 md:gap-12 max-w-6xl mx-auto items-start">
              {/* QR Code Card */}
              <div className="order-2 lg:order-1">
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  <div className="flex flex-col items-center">
                    <div className="mb-6 text-center">
                      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 font-heading">
                        📱 Escaneie Agora
                      </h2>
                      <p className="text-gray-600 text-sm md:text-base">
                        Aponte a câmera do seu celular para o QR Code
                      </p>
                    </div>

                    {/* QR Code */}
                    <div className="bg-white p-4 rounded-2xl shadow-inner mb-6 border-4 border-primary/10">
                      <QRCodeSVG
                        value={whatsappBotUrl}
                        size={window.innerWidth < 768 ? 200 : 240}
                        level="H"
                        includeMargin={true}
                        imageSettings={{
                          src: "/images/logo-colorida-igreen.png",
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
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                    <Camera className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading">
                      1. Escaneie o QR Code
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      Use a câmera do seu celular para escanear o código. O WhatsApp abrirá automaticamente com uma mensagem pronta.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                    <FileText className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading">
                      2. Envie seus Documentos
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      Tire fotos do seu <strong>RG (frente e verso)</strong> e da <strong>conta de energia</strong>. Nosso bot extrai os dados automaticamente usando OCR.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-2 font-heading">
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
                    <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <div className="text-4xl font-black text-white mb-1">100%</div>
                      <div className="text-white/80 text-sm uppercase tracking-wider">Automático</div>
                    </div>
                    <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <div className="text-4xl font-black text-white mb-1">3min</div>
                      <div className="text-white/80 text-sm uppercase tracking-wider">Tempo médio</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Security badge */}
            <div className="mt-12 flex justify-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full border border-white/20">
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
                {
                  step: "1",
                  title: "Escaneie o QR Code",
                  description: "Use a câmera do celular para escanear. O WhatsApp abre automaticamente.",
                },
                {
                  step: "2",
                  title: "Converse com o Bot",
                  description: "Nosso assistente virtual vai te guiar em cada etapa do cadastro.",
                },
                {
                  step: "3",
                  title: "Envie RG (frente e verso)",
                  description: "Tire fotos claras do seu documento. O sistema extrai os dados automaticamente.",
                },
                {
                  step: "4",
                  title: "Envie a Conta de Energia",
                  description: "Foto da última fatura. Extraímos endereço, consumo e distribuidora.",
                },
                {
                  step: "5",
                  title: "Confirme os Dados",
                  description: "Revise as informações extraídas e confirme se está tudo correto.",
                },
                {
                  step: "6",
                  title: "Receba o Link",
                  description: "Em minutos você recebe o link para assinar e ativar seu desconto!",
                },
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
