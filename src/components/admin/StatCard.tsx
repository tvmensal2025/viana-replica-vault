interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: "primary" | "accent";
  subtitle?: string;
}

export function StatCard({ icon, label, value, color, subtitle }: StatCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-primary/30 transition-colors">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
        color === "primary" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold font-heading text-foreground truncate">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
        <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
