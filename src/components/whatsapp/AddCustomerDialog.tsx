import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Check } from "lucide-react";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  name: string | null;
  onAdded: () => void;
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  phone,
  name: initialName,
  onAdded,
}: AddCustomerDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  const [form, setForm] = useState({
    cpf: "",
    data_nascimento: "",
    name: "",
    email: "",
    phone_whatsapp: "",
    cep: "",
    address_street: "",
    address_neighborhood: "",
    address_complement: "",
    address_city: "",
    address_state: "",
    address_number: "",
    numero_instalacao: "",
    media_consumo: "",
    desconto_cliente: "",
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        cpf: "",
        data_nascimento: "",
        name: initialName || "",
        email: "",
        phone_whatsapp: phone,
        cep: "",
        address_street: "",
        address_neighborhood: "",
        address_complement: "",
        address_city: "",
        address_state: "",
        address_number: "",
        numero_instalacao: "",
        media_consumo: "",
        desconto_cliente: "",
      });
    }
  }, [open, phone, initialName]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Auto-fill address from CEP
  const fetchCep = useCallback(async () => {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address_street: data.logradouro || prev.address_street,
          address_neighborhood: data.bairro || prev.address_neighborhood,
          address_city: data.localidade || prev.address_city,
          address_state: data.uf || prev.address_state,
          address_complement: data.complemento || prev.address_complement,
        }));
      }
    } catch {
      // silent fail
    } finally {
      setLoadingCep(false);
    }
  }, [form.cep]);

  // CEP mask
  const handleCepChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    update("cep", masked);
  };

  // CPF mask
  const handleCpfChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    let masked = digits;
    if (digits.length > 9) masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    else if (digits.length > 6) masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    else if (digits.length > 3) masked = `${digits.slice(0, 3)}.${digits.slice(3)}`;
    update("cpf", masked);
  };

  // Phone mask
  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 13);
    update("phone_whatsapp", digits);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const insertData: any = {
        phone_whatsapp: form.phone_whatsapp || phone,
      };

      // Only include non-empty fields
      if (form.name) insertData.name = form.name;
      if (form.cpf) insertData.cpf = form.cpf.replace(/\D/g, "");
      if (form.data_nascimento) insertData.data_nascimento = form.data_nascimento;
      if (form.email) insertData.email = form.email;
      if (form.cep) insertData.cep = form.cep.replace(/\D/g, "");
      if (form.address_street) insertData.address_street = form.address_street;
      if (form.address_neighborhood) insertData.address_neighborhood = form.address_neighborhood;
      if (form.address_complement) insertData.address_complement = form.address_complement;
      if (form.address_city) insertData.address_city = form.address_city;
      if (form.address_state) insertData.address_state = form.address_state;
      if (form.address_number) insertData.address_number = form.address_number;
      if (form.numero_instalacao) insertData.numero_instalacao = form.numero_instalacao;
      if (form.media_consumo) insertData.electricity_bill_value = parseFloat(form.media_consumo);
      if (form.desconto_cliente) insertData.media_consumo = parseFloat(form.desconto_cliente);

      const { error } = await supabase.from("customers").insert(insertData);

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Este contato já é um cliente" });
        } else {
          throw error;
        }
      } else {
        toast({ title: "✅ Cliente adicionado com sucesso!" });
      }
      onAdded();
      onOpenChange(false);
    } catch {
      toast({ title: "Erro ao adicionar cliente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Adicionar Cliente</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {/* Name */}
          <div className="col-span-2">
            <Label className="text-[11px] text-muted-foreground">Nome Completo</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Nome do cliente"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* CPF */}
          <div>
            <Label className="text-[11px] text-muted-foreground">CPF</Label>
            <Input
              value={form.cpf}
              onChange={(e) => handleCpfChange(e.target.value)}
              placeholder="000.000.000-00"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Data Nascimento */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Data de Nascimento</Label>
            <Input
              type="date"
              value={form.data_nascimento}
              onChange={(e) => update("data_nascimento", e.target.value)}
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Email */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="email@exemplo.com"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Phone */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Celular</Label>
            <Input
              value={form.phone_whatsapp}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="5511999999999"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Divider */}
          <div className="col-span-2 border-t border-border my-1" />

          {/* CEP */}
          <div>
            <Label className="text-[11px] text-muted-foreground">CEP</Label>
            <div className="flex gap-1 mt-1">
              <Input
                value={form.cep}
                onChange={(e) => handleCepChange(e.target.value)}
                placeholder="00000-000"
                className="h-8 text-xs flex-1"
                onBlur={fetchCep}
              />
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                onClick={fetchCep}
                disabled={loadingCep}
              >
                {loadingCep ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Street */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Rua</Label>
            <Input
              value={form.address_street}
              onChange={(e) => update("address_street", e.target.value)}
              placeholder="Rua / Av."
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Number */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Número</Label>
            <Input
              value={form.address_number}
              onChange={(e) => update("address_number", e.target.value)}
              placeholder="Nº"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Neighborhood */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Bairro</Label>
            <Input
              value={form.address_neighborhood}
              onChange={(e) => update("address_neighborhood", e.target.value)}
              placeholder="Bairro"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Complement */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Complemento</Label>
            <Input
              value={form.address_complement}
              onChange={(e) => update("address_complement", e.target.value)}
              placeholder="Apto, Bloco..."
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* City + State */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Cidade / UF</Label>
            <div className="flex gap-1 mt-1">
              <Input
                value={form.address_city}
                onChange={(e) => update("address_city", e.target.value)}
                placeholder="Cidade"
                className="h-8 text-xs flex-1"
              />
              <Input
                value={form.address_state}
                onChange={(e) => update("address_state", e.target.value)}
                placeholder="UF"
                className="h-8 text-xs w-14"
                maxLength={2}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="col-span-2 border-t border-border my-1" />

          {/* Numero Instalacao */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Nº Instalação</Label>
            <Input
              value={form.numero_instalacao}
              onChange={(e) => update("numero_instalacao", e.target.value)}
              placeholder="Número da instalação"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Media Consumo */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Média de Consumo (R$)</Label>
            <Input
              type="number"
              value={form.media_consumo}
              onChange={(e) => update("media_consumo", e.target.value)}
              placeholder="0,00"
              className="h-8 text-xs mt-1"
            />
          </div>

          {/* Desconto */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Desconto do Cliente (%)</Label>
            <Input
              type="number"
              value={form.desconto_cliente}
              onChange={(e) => update("desconto_cliente", e.target.value)}
              placeholder="0"
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Salvar Cliente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
