import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Image, Mic, Video, Send, X, MoveRight } from "lucide-react";

const REJECTION_REASONS = [
  { value: "baixa_renda", label: "Baixa renda" },
  { value: "icms_baixo", label: "ICMS baixo" },
  { value: "emprestimo_conta", label: "Empréstimo na conta de energia" },
  { value: "outro", label: "Outro" },
];

interface AutoMessagePreview {
  message_type: string;
  message_text: string | null;
  media_url: string | null;
  image_url: string | null;
  delay_seconds: number;
  rejection_reason: string | null;
  deal_origin: string | null;
}

interface DropConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (sendMessages: boolean, rejectionReason?: string) => void;
  stageLabel: string;
  stageKey: string;
  stageId: string;
  consultantId: string;
  dealName: string;
  dealOrigin?: string | null;
}

export function DropConfirmDialog({
  open,
  onClose,
  onConfirm,
  stageLabel,
  stageKey,
  stageId,
  consultantId,
  dealName,
  dealOrigin,
}: DropConfirmDialogProps) {
  const [allMessages, setAllMessages] = useState<AutoMessagePreview[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const isReprovado = stageKey === "reprovado";

  useEffect(() => {
    if (!open) return;
    setRejectionReason("");
    (async () => {
      const { data } = await supabase
        .from("stage_auto_messages")
        .select("message_type, message_text, media_url, image_url, delay_seconds, rejection_reason")
        .eq("stage_id", stageId)
        .eq("consultant_id", consultantId)
        .order("position", { ascending: true });
      setAllMessages((data as AutoMessagePreview[]) || []);
    })();
  }, [open, stageId, consultantId]);

  // Filter messages based on rejection reason for reprovado
  const filteredMessages = (() => {
    let msgs = allMessages;
    // Filter by rejection reason for reprovado
    if (isReprovado && rejectionReason) {
      msgs = msgs.filter((m) => !m.rejection_reason || m.rejection_reason === rejectionReason);
    } else if (isReprovado) {
      msgs = msgs.filter((m) => !m.rejection_reason);
    } else {
      msgs = msgs.filter((m) => !m.rejection_reason);
    }
    // Filter by deal_origin for time-based stages
    if (dealOrigin) {
      msgs = msgs.filter((m) => !m.deal_origin || m.deal_origin === dealOrigin);
    } else {
      msgs = msgs.filter((m) => !m.deal_origin);
    }
    return msgs;
  })();

  const typeIcon = (t: string) => {
    switch (t) {
      case "image": return <Image className="h-3 w-3 text-blue-400" />;
      case "video": return <Video className="h-3 w-3 text-purple-400" />;
      case "audio": return <Mic className="h-3 w-3 text-orange-400" />;
      default: return <MessageSquare className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const canConfirm = !isReprovado || rejectionReason;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <MoveRight className="h-4 w-4" />
            Mover para
            <Badge variant="secondary" className="text-[10px]">{stageLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground">
          Lead: <span className="font-medium text-foreground">{dealName}</span>
        </p>

        {/* Rejection reason selector */}
        {isReprovado && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Motivo da reprovação <span className="text-destructive">*</span>
            </label>
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Message preview */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-foreground">
            Mensagens automáticas ({filteredMessages.length}):
          </p>
          {filteredMessages.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic py-2">
              {isReprovado && !rejectionReason
                ? "Selecione o motivo para ver as mensagens"
                : "Nenhuma mensagem configurada para esta coluna"}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {filteredMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-secondary/50 border border-border">
                  <div className="mt-0.5">{typeIcon(msg.message_type)}</div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {msg.image_url && msg.message_type !== "image" && (
                      <p className="text-[9px] text-blue-400">📷 Imagem anexada</p>
                    )}
                    {msg.media_url && (
                      <p className="text-[9px] text-muted-foreground truncate">
                        🔗 {msg.media_url.split("/").pop()}
                      </p>
                    )}
                    {msg.message_text && (
                      <p className="text-[10px] text-foreground whitespace-pre-wrap line-clamp-3">
                        {msg.message_text}
                      </p>
                    )}
                    {i > 0 && msg.delay_seconds > 0 && (
                      <p className="text-[9px] text-muted-foreground">⏱ {msg.delay_seconds}s delay</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onClose}>
            <X className="h-3 w-3" />
            Cancelar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => onConfirm(false, isReprovado ? rejectionReason : undefined)}
            disabled={!canConfirm}
          >
            <MoveRight className="h-3 w-3" />
            Sem mensagem
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => onConfirm(true, isReprovado ? rejectionReason : undefined)}
            disabled={!canConfirm || filteredMessages.length === 0}
          >
            <Send className="h-3 w-3" />
            Confirmar e Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { REJECTION_REASONS };
