import { ExternalLink } from "lucide-react";

interface PreviewTabProps {
  slug: string;
  baseUrl: string;
}

export function PreviewTab({ slug, baseUrl }: PreviewTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href={`https://${baseUrl}/${slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition-opacity">
          <ExternalLink className="w-4 h-4" /> Página de Cliente
        </a>
        <a href={`https://${baseUrl}/licenciada/${slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-3 rounded-xl hover:bg-primary/10 transition-colors">
          <ExternalLink className="w-4 h-4" /> Página de Licenciado
        </a>
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="bg-secondary px-4 py-2.5 flex items-center gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-primary/60" />
          </div>
          <span className="text-xs text-muted-foreground ml-2 truncate">{baseUrl}/{slug}</span>
        </div>
        <iframe
          key={`preview-${slug}`}
          src={`https://${baseUrl}/${slug}`}
          className="w-full border-0"
          style={{ height: "70vh", minHeight: "400px" }}
          title="Preview da landing page"
          loading="lazy"
        />
      </div>
    </div>
  );
}
