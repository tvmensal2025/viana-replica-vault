const steps = [
  { icon: "☀️", text: "Nossas usinas produzem energia solar, a energia é injetada na rede da distribuidora, que envia para sua casa ou empresa — você economiza de forma gratuita sem investimentos" },
  { icon: "💰", text: "Como a nossa energia solar é mais barata do que a energia hidrelétrica normalmente utilizada pelas distribuidoras, nós conseguimos oferecer um desconto de até 20% por mês para nossos clientes" },
  { icon: "🚫", text: "Você não paga nenhum centavo para ter acesso a esses descontos. Sem placas solares, sem obras, sem taxa de adesão, sem mensalidade, sem fidelidade. Cadastro 100% online e gratuito" },
  { icon: "🏠", text: "Atendemos casas, apartamentos, prédios, condomínios, fazendas, comércios e empresas em 27 estados" },
  { icon: "📜", text: "Regulamentado pela Lei Federal 14.300 de 6 de Janeiro de 2022 — os consumidores já podem escolher energia solar renovável e mais barata" },
];

const HowItWorksSection = () => (
  <section className="section-gradient relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(circle at 80% 50%, hsl(130, 100%, 36%), transparent 60%)' }} />
    <div className="section-container relative z-10">
      <div className="badge-green mx-auto mb-6">Entenda</div>
      <h2 className="section-heading mb-10">Como funciona a energia solar da iGreen</h2>

      <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden relative mb-12" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
        <div className="absolute inset-0 rounded-2xl border border-primary/20 z-10 pointer-events-none" />
        <video controls className="w-full aspect-video relative z-0">
          <source src="https://igreen-minio.b099mi.easypanel.host/igreen/casasustentavel.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
        {steps.map((step, i) => (
          <div key={i} className="glass-card !p-4 !rounded-xl flex items-start gap-3">
            <span className="text-2xl shrink-0">{step.icon}</span>
            <span className="text-foreground/90 leading-relaxed">{step.text}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorksSection;
