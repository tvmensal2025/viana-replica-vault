import { ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LinkCardProps {
  emoji: string;
  title: string;
  description: string;
  url: string;
  onCopy: (url: string) => void;
  previewUrl: string;
}

export function LinkCard({ emoji, title, description, url, onCopy, previewUrl }: LinkCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading font-bold text-foreground flex items-center gap-2">
            <span>{emoji}</span> {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-secondary px-3 py-2.5 rounded-xl text-primary text-sm break-all font-mono">
          {url.replace("https://", "")}
        </code>
        <Button size="sm" variant="outline" onClick={() => onCopy(url)} className="gap-1.5 shrink-0 rounded-xl">
          <Copy className="w-3.5 h-3.5" /> Copiar
        </Button>
      </div>
    </div>
  );
}
