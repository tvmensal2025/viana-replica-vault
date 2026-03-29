import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Trash2, Plus, Send } from "lucide-react";

interface ScheduledMessage {
  id: string;
  remote_jid: string;
  message_text: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
}

interface SchedulePanelProps {
  consultantId: string;
  instanceName: string;
}

export function SchedulePanel({ consultantId, instanceName }: SchedulePanelProps) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("scheduled_at", { ascending: true });
    if (data) setMessages(data as ScheduledMessage[]);
  }, [consultantId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleCreate = async () => {
    if (!phone.trim() || !text.trim() || !scheduledAt) return;
    setSaving(true);
    try {
      const remoteJid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
      const { error } = await supabase.from("scheduled_messages").insert({
        consultant_id: consultantId,
        instance_name: instanceName,
        remote_jid: remoteJid,
        message_text: text,
        scheduled_at: new Date(scheduledAt).toISOString(),
      });
      if (error) throw error;
      toast({ title: "Mensagem agendada!" });
      setPhone("");
      setText("");
      setScheduledAt("");
      setShowForm(false);
      fetchMessages();
    } catch {
      toast({ title: "Erro ao agendar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("scheduled_messages").delete().eq("id", id);
    fetchMessages();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 text-[10px]">Pendente</Badge>;
      case "sent":
        return <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-[10px]">Enviada</Badge>;
      case "failed":
        return <Badge variant="secondary" className="bg-red-500/20 text-red-400 text-[10px]">Falhou</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Mensagens Agendadas
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agendar
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              placeholder="Texto da mensagem..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="text-xs min-h-[60px]"
            />
          </div>
          <div>
            <Label className="text-xs">Data e hora</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {saving ? "Agendando..." : "Agendar Envio"}
          </Button>
        </div>
      )}

      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhuma mensagem agendada
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-card border border-border rounded-lg p-3 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">
                    {msg.remote_jid.split("@")[0]}
                  </span>
                  {statusBadge(msg.status)}
                </div>
                <p className="text-xs text-muted-foreground truncate">{msg.message_text}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.scheduled_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
              {msg.status === "pending" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDelete(msg.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
