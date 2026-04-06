import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, CheckCircle2, XCircle } from "lucide-react";

interface LogEntry {
  id: string;
  deal_id: string;
  stage_key: string;
  remote_jid: string | null;
  customer_name: string | null;
  message_preview: string | null;
  status: string;
  created_at: string;
}

interface AutoMessageLogProps {
  consultantId: string;
}

export function AutoMessageLog({ consultantId }: AutoMessageLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const { data } = await supabase
        .from("crm_auto_message_log")
        .select("*")
        .eq("consultant_id", consultantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setLogs(data as LogEntry[]);
      setLoading(false);
    }
    fetchLogs();
  }, [consultantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Carregando histórico...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <History className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma mensagem automática enviada ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Histórico de Mensagens Automáticas</h3>
        <Badge variant="secondary" className="text-[9px]">{logs.length}</Badge>
      </div>
      <ScrollArea className="max-h-[500px]">
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
              {log.status === "sent" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground">
                    {log.customer_name || log.remote_jid?.split("@")[0] || "Desconhecido"}
                  </span>
                  <Badge variant="secondary" className="text-[9px]">{log.stage_key}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                {log.message_preview && (
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{log.message_preview}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
