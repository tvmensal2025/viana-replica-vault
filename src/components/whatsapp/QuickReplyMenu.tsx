import { useEffect, useRef } from "react";
import type { MessageTemplate } from "@/types/whatsapp";

interface QuickReplyMenuProps {
  templates: MessageTemplate[];
  search: string;
  onSelect: (template: MessageTemplate) => void;
  onClose: () => void;
}

export function QuickReplyMenu({ templates, search, onSelect, onClose }: QuickReplyMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50"
    >
      <div className="p-1">
        <p className="text-[10px] text-muted-foreground px-2 py-1">Respostas rápidas</p>
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="w-full text-left px-3 py-2 hover:bg-secondary rounded transition-colors"
          >
            <span className="text-xs font-medium text-foreground">{t.name}</span>
            <p className="text-[10px] text-muted-foreground truncate">{t.content}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
