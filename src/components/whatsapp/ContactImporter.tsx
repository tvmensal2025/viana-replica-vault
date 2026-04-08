import { useState, useMemo, useCallback } from "react";
import { Users, ClipboardPaste, FileSpreadsheet, Download, Search, X, CheckSquare, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import * as XLSX from "xlsx";
import type { BulkContact } from "@/types/whatsapp";

interface Customer {
  id: string; name: string; phone_whatsapp: string; electricity_bill_value?: number;
  status?: string; devolutiva?: string | null; registered_by_name?: string | null;
}

interface ContactImporterProps {
  customers: Customer[];
  contacts: BulkContact[];
  onContactsChange: (contacts: BulkContact[]) => void;
  disabled?: boolean;
}

function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  if (/sem_celular/i.test(phone)) return false;
  return phone.replace(/\D/g, "").length >= 10;
}

type StatusFilter = "all" | "approved" | "rejected" | "pending";

const DEVOLUTIVA_CATEGORIES = [
  { key: "fatura_ilegivel", label: "Fatura Ilegível", match: ["fatura ilegível", "fatura ilegivel"] },
  { key: "sem_fatura", label: "Sem Fatura de Energia", match: ["sem anexo de fatura", "fatura de energia não anexada", "fatura não anexada"] },
  { key: "distribuidora_diferente", label: "Distribuidora Diferente", match: ["distribuidora da fatura diferente"] },
  { key: "sem_documento", label: "Sem Documento Pessoal", match: ["sem anexo de documento pessoal"] },
  { key: "documento_ilegivel", label: "Documento Ilegível", match: ["ilegível no anexo de rg", "ilegível no anexo de cnh"] },
  { key: "debito_aberto", label: "Débito em Aberto", match: ["débito em aberto", "débitos em aberto", "debito em aberto"] },
  { key: "fatura_desatualizada", label: "Fatura Desatualizada", match: ["fatura desatualizada"] },
  { key: "cancelado", label: "Cancelado", match: ["cancelado"] },
  { key: "consumo_inferior", label: "Consumo Inferior", match: ["consumo inferior"] },
];

function matchDevolutiva(devolutiva: string | null | undefined, categoryKey: string): boolean {
  if (!devolutiva) return false;
  const lower = devolutiva.toLowerCase();
  const cat = DEVOLUTIVA_CATEGORIES.find(c => c.key === categoryKey);
  if (!cat) return false;
  return cat.match.some(m => lower.includes(m));
}

export function ContactImporter({ customers, contacts, onContactsChange, disabled }: ContactImporterProps) {
  const [activeTab, setActiveTab] = useState("database");
  const [pasteText, setPasteText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [devolutivaFilter, setDevolutivaFilter] = useState("all");
  const [licenciadoFilter, setLicenciadoFilter] = useState<Set<string>>(new Set());
  const [selectedDbIds, setSelectedDbIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const licenciadoOptions = useMemo(() => {
    const names = new Set<string>();
    customers.forEach(c => { if (c.registered_by_name) names.add(c.registered_by_name); });
    return Array.from(names).sort();
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (statusFilter !== "all") list = list.filter(c => c.status === statusFilter);
    if (devolutivaFilter !== "all") list = list.filter(c => matchDevolutiva(c.devolutiva, devolutivaFilter));
    if (licenciadoFilter.size > 0) list = list.filter(c => c.registered_by_name != null && licenciadoFilter.has(c.registered_by_name));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || c.phone_whatsapp.toLowerCase().includes(q));
    }
    return list;
  }, [customers, statusFilter, devolutivaFilter, licenciadoFilter, searchQuery]);

  const validDbCount = useMemo(() => filteredCustomers.filter(c => isValidPhone(c.phone_whatsapp)).length, [filteredCustomers]);

  const allValidSelected = useMemo(() => {
    const valid = filteredCustomers.filter(c => isValidPhone(c.phone_whatsapp));
    return valid.length > 0 && valid.every(c => selectedDbIds.has(c.id));
  }, [filteredCustomers, selectedDbIds]);

  const toggleAll = useCallback(() => {
    if (allValidSelected) {
      setSelectedDbIds(prev => {
        const n = new Set(prev);
        filteredCustomers.filter(c => isValidPhone(c.phone_whatsapp)).forEach(c => n.delete(c.id));
        return n;
      });
    } else {
      setSelectedDbIds(prev => {
        const n = new Set(prev);
        filteredCustomers.filter(c => isValidPhone(c.phone_whatsapp)).forEach(c => n.add(c.id));
        return n;
      });
    }
  }, [allValidSelected, filteredCustomers]);

  const addFromDatabase = useCallback(() => {
    const selected = customers.filter(c => selectedDbIds.has(c.id) && isValidPhone(c.phone_whatsapp));
    const existing = new Set(contacts.map(c => c.phone));
    const newContacts: BulkContact[] = selected
      .filter(c => !existing.has(c.phone_whatsapp))
      .map(c => ({
        id: c.id,
        name: c.name || c.phone_whatsapp,
        phone: c.phone_whatsapp,
        electricity_bill_value: c.electricity_bill_value,
        source: "database" as const,
      }));
    onContactsChange([...contacts, ...newContacts]);
    setSelectedDbIds(new Set());
    toast({ title: `${newContacts.length} contatos adicionados`, description: `Total: ${contacts.length + newContacts.length}` });
  }, [customers, selectedDbIds, contacts, onContactsChange, toast]);

  const parsePastedContacts = useCallback(() => {
    const lines = pasteText.trim().split("\n").filter(l => l.trim());
    const existing = new Set(contacts.map(c => c.phone));
    const parsed: BulkContact[] = [];
    for (const line of lines) {
      const parts = line.split(/[;,\t]/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 1) continue;
      let name = "", phone = "";
      if (parts.length === 1) {
        phone = parts[0].replace(/\D/g, "");
        name = phone;
      } else {
        // Detect which part is the phone
        const first = parts[0].replace(/\D/g, "");
        if (first.length >= 10) {
          phone = first;
          name = parts[1];
        } else {
          name = parts[0];
          phone = parts[1].replace(/\D/g, "");
        }
      }
      if (phone.length >= 10 && !existing.has(phone)) {
        existing.add(phone);
        parsed.push({ id: `paste-${phone}`, name, phone, source: "pasted" });
      }
    }
    onContactsChange([...contacts, ...parsed]);
    setPasteText("");
    toast({ title: `${parsed.length} contatos colados`, description: `Total: ${contacts.length + parsed.length}` });
  }, [pasteText, contacts, onContactsChange, toast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
        const existing = new Set(contacts.map(c => c.phone));
        const parsed: BulkContact[] = [];
        for (const row of rows) {
          const name = (row.nome || row.Nome || row.name || row.Name || "").toString().trim();
          const rawPhone = (row.telefone || row.Telefone || row.phone || row.Phone || row.celular || row.Celular || "").toString().trim();
          const phone = rawPhone.replace(/\D/g, "");
          if (phone.length >= 10 && !existing.has(phone)) {
            existing.add(phone);
            parsed.push({ id: `import-${phone}`, name: name || phone, phone, source: "imported" });
          }
        }
        onContactsChange([...contacts, ...parsed]);
        toast({ title: `${parsed.length} contatos importados`, description: `Total: ${contacts.length + parsed.length}` });
      } catch {
        toast({ title: "Erro ao ler arquivo", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }, [contacts, onContactsChange, toast]);

  const downloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["nome", "telefone"],
      ["João Silva", "5511999998888"],
      ["Maria Souza", "5521988887777"],
    ]);
    ws["!cols"] = [{ wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, "modelo_importacao.xlsx");
  }, []);

  const removeContact = useCallback((id: string) => {
    onContactsChange(contacts.filter(c => c.id !== id));
  }, [contacts, onContactsChange]);

  const clearAll = useCallback(() => {
    onContactsChange([]);
  }, [onContactsChange]);

  const validContacts = useMemo(() => contacts.filter(c => isValidPhone(c.phone)), [contacts]);
  const invalidContacts = contacts.length - validContacts.length;

  return (
    <div className="space-y-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="database" className="text-xs gap-1.5" disabled={disabled}>
            <Users className="w-3.5 h-3.5" /> Base
          </TabsTrigger>
          <TabsTrigger value="paste" className="text-xs gap-1.5" disabled={disabled}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Colar
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs gap-1.5" disabled={disabled}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Importar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-2 mt-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "approved", "rejected", "pending"] as const).map(f => (
              <button key={f} onClick={() => { setStatusFilter(f); setDevolutivaFilter("all"); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  statusFilter === f ? "bg-primary/20 border-primary/40 text-primary" : "bg-secondary/40 border-border/50 text-muted-foreground hover:bg-secondary/60"
                }`}>
                {f === "all" ? "Todos" : f === "approved" ? "Aprovado" : f === "rejected" ? "Reprovado" : "Pendente"}
              </button>
            ))}
          </div>

          {statusFilter === "rejected" && (
            <Select value={devolutivaFilter} onValueChange={setDevolutivaFilter}>
              <SelectTrigger className="rounded-lg bg-secondary/50 border-border/50 h-8 text-xs">
                <SelectValue placeholder="Filtrar devolutiva..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as devolutivas</SelectItem>
                {DEVOLUTIVA_CATEGORIES.map(cat => (
                  <SelectItem key={cat.key} value={cat.key}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {licenciadoOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 rounded-lg bg-secondary/50 border border-border/50 text-xs px-3 py-1.5 text-left hover:bg-secondary/70">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="flex-1 truncate text-muted-foreground">
                    {licenciadoFilter.size === 0 ? "Todos os licenciados" : `${licenciadoFilter.size} selecionados`}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="max-h-44 overflow-y-auto p-1.5 space-y-0.5">
                  {licenciadoOptions.map(name => (
                    <label key={name} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-secondary/50 text-xs">
                      <Checkbox checked={licenciadoFilter.has(name)} onCheckedChange={(checked) => {
                        setLicenciadoFilter(prev => { const n = new Set(prev); checked ? n.add(name) : n.delete(name); return n; });
                      }} />
                      <span className="truncate">{name}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs rounded-lg bg-secondary/50 border-border/50" />
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Checkbox checked={allValidSelected} onCheckedChange={toggleAll} />
              <CheckSquare className="w-3 h-3 text-muted-foreground" /> Selecionar válidos ({validDbCount})
            </label>
            <span className="text-[11px] text-primary font-bold">{selectedDbIds.size} marcados</span>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/30">
            {filteredCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum cliente encontrado</p>
            ) : filteredCustomers.map(c => {
              const valid = isValidPhone(c.phone_whatsapp);
              return (
                <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${!valid ? "opacity-40" : ""} ${selectedDbIds.has(c.id) ? "bg-primary/5" : ""}`}>
                  <Checkbox checked={selectedDbIds.has(c.id)} onCheckedChange={() => {
                    setSelectedDbIds(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
                  }} />
                  <span className="flex-1 truncate text-foreground">{c.name}</span>
                  <span className="text-muted-foreground shrink-0">{c.phone_whatsapp}</span>
                  {!valid && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          <Button size="sm" onClick={addFromDatabase} disabled={selectedDbIds.size === 0}
            className="w-full gap-1.5 rounded-lg h-8 text-xs">
            <Users className="w-3.5 h-3.5" /> Adicionar {selectedDbIds.size} contatos à lista
          </Button>
        </TabsContent>

        <TabsContent value="paste" className="space-y-3 mt-2">
          <p className="text-xs text-muted-foreground">
            Cole os contatos, um por linha, no formato: <code className="px-1 py-0.5 bg-secondary rounded text-primary">nome;telefone</code> ou <code className="px-1 py-0.5 bg-secondary rounded text-primary">telefone;nome</code>
          </p>
          <Textarea
            placeholder={"João Silva;5511999998888\nMaria Souza;5521988887777\n5531977776666;Carlos"}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={6}
            className="rounded-lg bg-secondary/30 border-border/40 resize-none text-xs font-mono"
          />
          <Button size="sm" onClick={parsePastedContacts} disabled={!pasteText.trim()}
            className="w-full gap-1.5 rounded-lg h-8 text-xs">
            <ClipboardPaste className="w-3.5 h-3.5" /> Adicionar contatos colados
          </Button>
        </TabsContent>

        <TabsContent value="import" className="space-y-3 mt-2">
          <p className="text-xs text-muted-foreground">
            Importe um arquivo Excel ou CSV com as colunas <strong>nome</strong> e <strong>telefone</strong>.
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 rounded-lg h-8 text-xs">
            <Download className="w-3.5 h-3.5" /> Baixar modelo de planilha
          </Button>
          <div>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload}
              className="text-xs rounded-lg h-8 file:text-xs file:mr-2" />
          </div>
        </TabsContent>
      </Tabs>

      {/* Contact summary */}
      {contacts.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-secondary/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">
              📋 {contacts.length} contatos na lista
            </span>
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={disabled}
              className="h-6 px-2 text-[10px] text-destructive hover:text-destructive gap-1">
              <Trash2 className="w-3 h-3" /> Limpar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="text-green-400">✓ {validContacts.length} válidos</span>
            {invalidContacts > 0 && <span className="text-red-400">✗ {invalidContacts} inválidos</span>}
            {contacts.filter(c => c.source === "database").length > 0 && (
              <span className="text-muted-foreground">Base: {contacts.filter(c => c.source === "database").length}</span>
            )}
            {contacts.filter(c => c.source === "pasted").length > 0 && (
              <span className="text-muted-foreground">Colados: {contacts.filter(c => c.source === "pasted").length}</span>
            )}
            {contacts.filter(c => c.source === "imported").length > 0 && (
              <span className="text-muted-foreground">Importados: {contacts.filter(c => c.source === "imported").length}</span>
            )}
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded hover:bg-secondary/40">
                <span className="flex-1 truncate text-foreground">{c.name}</span>
                <span className="text-muted-foreground shrink-0">{c.phone}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  c.source === "database" ? "bg-blue-500/15 text-blue-400" :
                  c.source === "pasted" ? "bg-purple-500/15 text-purple-400" :
                  "bg-green-500/15 text-green-400"
                }`}>{c.source === "database" ? "Base" : c.source === "pasted" ? "Colado" : "Importado"}</span>
                {!disabled && (
                  <button onClick={() => removeContact(c.id)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
