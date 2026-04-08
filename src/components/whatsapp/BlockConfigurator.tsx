import { useMemo } from "react";
import { Layers, Clock, Zap, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BlockConfig } from "@/types/whatsapp";

interface BlockConfiguratorProps {
  config: BlockConfig;
  onConfigChange: (config: BlockConfig) => void;
  totalContacts: number;
  disabled?: boolean;
}

const BLOCK_SIZES = [10, 20, 30, 40, 50] as const;
const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hora" },
] as const;

const AVG_MSG_INTERVAL_S = 26.5; // avg of 18-35
const PROGRESSIVE_EXTRA_S = 5;

function estimateBlockTime(blockSize: number): number {
  let total = 0;
  for (let i = 0; i < blockSize - 1; i++) {
    total += AVG_MSG_INTERVAL_S + Math.floor(i / 10) * PROGRESSIVE_EXTRA_S;
  }
  return Math.round(total);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `${m}min`;
}

export function BlockConfigurator({ config, onConfigChange, totalContacts, disabled }: BlockConfiguratorProps) {
  const stats = useMemo(() => {
    if (totalContacts === 0) return { blocks: 0, lastBlockSize: 0, totalTime: 0 };
    const blocks = Math.ceil(totalContacts / config.blockSize);
    const lastBlockSize = totalContacts % config.blockSize || config.blockSize;
    const fullBlocks = blocks > 1 ? blocks - 1 : 0;
    const blockTime = estimateBlockTime(config.blockSize);
    const lastBlockTime = estimateBlockTime(lastBlockSize);
    const intervalTime = fullBlocks * config.intervalMinutes * 60;
    const totalTime = fullBlocks * blockTime + lastBlockTime + intervalTime;
    return { blocks, lastBlockSize, totalTime };
  }, [totalContacts, config]);

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/10 p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Layers className="w-4 h-4 text-primary" />
        Configuração dos Blocos
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" /> Contatos por bloco
          </label>
          <Select
            value={String(config.blockSize)}
            onValueChange={v => onConfigChange({ ...config, blockSize: Number(v) as BlockConfig["blockSize"] })}
            disabled={disabled}
          >
            <SelectTrigger className="rounded-lg h-9 text-sm bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_SIZES.map(s => (
                <SelectItem key={s} value={String(s)}>{s} contatos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Intervalo entre blocos
          </label>
          <Select
            value={String(config.intervalMinutes)}
            onValueChange={v => onConfigChange({ ...config, intervalMinutes: Number(v) as BlockConfig["intervalMinutes"] })}
            disabled={disabled}
          >
            <SelectTrigger className="rounded-lg h-9 text-sm bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalContacts > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Info className="w-3.5 h-3.5" /> Resumo do envio
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-lg font-bold text-foreground">{stats.blocks}</p>
              <p className="text-[10px] text-muted-foreground">blocos</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-lg font-bold text-foreground">{config.blockSize}</p>
              <p className="text-[10px] text-muted-foreground">por bloco</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-lg font-bold text-foreground">~{formatDuration(stats.totalTime)}</p>
              <p className="text-[10px] text-muted-foreground">tempo total</p>
            </div>
          </div>
          {stats.blocks > 1 && stats.lastBlockSize !== config.blockSize && (
            <p className="text-[11px] text-muted-foreground text-center">
              Último bloco: {stats.lastBlockSize} contatos
            </p>
          )}
        </div>
      )}
    </div>
  );
}
