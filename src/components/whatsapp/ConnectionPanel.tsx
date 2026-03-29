import { Smartphone, Wifi, WifiOff, Loader2, QrCode, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectionStatus } from "@/types/whatsapp";

interface ConnectionPanelProps {
  connectionStatus: ConnectionStatus;
  qrCode: string | null;
  instanceName: string | null;
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onReconnect: () => Promise<void>;
}

export function ConnectionPanel({
  connectionStatus,
  qrCode,
  instanceName,
  phoneNumber,
  isLoading,
  error,
  onConnect,
  onDisconnect,
  onReconnect,
}: ConnectionPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-green-950/20">
      {/* Glow effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />

      <div className="relative p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
            <Zap className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-foreground text-lg">Conexão WhatsApp</h3>
            <p className="text-xs text-muted-foreground">Conecte seu celular para enviar mensagens</p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/15 to-green-600/5 flex items-center justify-center border border-green-500/10">
              <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">Verificando conexão...</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-8 gap-5">
            <div className="w-full rounded-xl bg-red-500/5 border border-red-500/20 px-5 py-4 text-center backdrop-blur-sm">
              <p className="text-sm text-red-400 font-medium">{error}</p>
            </div>
            <Button onClick={onReconnect} variant="outline" className="gap-2 rounded-xl border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all">
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </Button>
          </div>
        )}

        {/* Disconnected — no instance */}
        {!isLoading && !error && connectionStatus === "disconnected" && !instanceName && (
          <div className="flex flex-col items-center justify-center py-10 gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center border border-border/50">
                <WifiOff className="w-9 h-9 text-muted-foreground/60" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-heading font-bold text-foreground">WhatsApp desconectado</p>
              <p className="text-sm text-muted-foreground max-w-xs">Conecte seu WhatsApp para começar a enviar mensagens personalizadas</p>
            </div>
            <Button onClick={onConnect} className="gap-2 rounded-xl px-6 h-11 text-sm font-bold shadow-lg shadow-green-500/10 hover:shadow-green-500/20 transition-all" style={{ background: "var(--gradient-green)" }}>
              <QrCode className="w-4 h-4" /> Conectar WhatsApp
            </Button>
          </div>
        )}

        {/* Disconnected — instance exists */}
        {!isLoading && !error && connectionStatus === "disconnected" && instanceName && (
          <div className="flex flex-col items-center justify-center py-10 gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center border border-border/50">
                <WifiOff className="w-9 h-9 text-muted-foreground/60" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-heading font-bold text-foreground">Conexão perdida</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sua sessão expirou. Reconecte para continuar enviando mensagens.</p>
            </div>
            <Button onClick={onReconnect} variant="outline" className="gap-2 rounded-xl px-6 h-11 border-primary/30 hover:bg-primary/5 hover:border-primary/50 transition-all">
              <RefreshCw className="w-4 h-4" /> Reconectar
            </Button>
          </div>
        )}

        {/* Connecting — QR code */}
        {!isLoading && !error && connectionStatus === "connecting" && qrCode && (
          <div className="flex flex-col items-center justify-center py-8 gap-5">
            <div className="relative rounded-2xl border-2 border-green-500/20 bg-white p-4 shadow-xl shadow-green-500/5">
              <img
                src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code WhatsApp"
                className="w-56 h-56 sm:w-64 sm:h-64"
              />
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-green-500/15 border border-green-500/25 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Escaneie</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <p className="text-sm text-muted-foreground font-medium">Aguardando leitura do QR Code...</p>
            </div>
            <p className="text-xs text-muted-foreground/70 text-center max-w-[280px] leading-relaxed">
              Abra o WhatsApp → Configurações → Dispositivos Conectados → Conectar Dispositivo
            </p>
          </div>
        )}

        {/* Connected */}
        {!isLoading && !error && connectionStatus === "connected" && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 rounded-xl bg-green-500/5 border border-green-500/15">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
                  <Wifi className="w-6 h-6 text-green-400" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-card flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Conectado
                  </span>
                </div>
                {phoneNumber && <p className="text-sm text-muted-foreground mt-1">{phoneNumber}</p>}
              </div>
            </div>
            <Button onClick={onDisconnect} variant="outline" size="sm" className="gap-2 rounded-xl text-red-400 border-red-500/20 hover:bg-red-500/5 hover:border-red-500/30 hover:text-red-400 transition-all">
              <WifiOff className="w-4 h-4" /> Desconectar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
