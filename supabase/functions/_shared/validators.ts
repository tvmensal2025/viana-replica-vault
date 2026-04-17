import { isCNH } from "./document-type.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCPF(cpf: string): boolean {
  if (!cpf) return false;
  const cpfClean = cpf.replace(/\D/g, "");
  if (cpfClean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpfClean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpfClean.charAt(i)) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpfClean.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpfClean.charAt(i)) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpfClean.charAt(10))) return false;
  return true;
}

export function validatePhone(phone: string): boolean {
  if (!phone) return false;
  const phoneClean = phone.replace(/\D/g, "");
  if (phoneClean.length < 10) return false;
  const ddd = phoneClean.startsWith("55") ? phoneClean.substring(2, 4) : phoneClean.substring(0, 2);
  const dddNum = parseInt(ddd);
  return dddNum >= 11 && dddNum <= 99;
}

export function validateCustomerForPortal(customer: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!customer.email || customer.email.trim().length === 0) {
    warnings.push("Email não informado - será gerado automaticamente");
  }
  if (!customer.name || customer.name.trim().length < 3) errors.push("Nome inválido ou muito curto");
  if (!validateCPF(customer.cpf || "")) errors.push("CPF inválido");
  if (!customer.rg || customer.rg.trim().length < 4) errors.push("RG inválido");
  const cepClean = (customer.cep || "").replace(/\D/g, "");
  if (cepClean.length !== 8) errors.push("CEP inválido (deve ter 8 dígitos)");
  if (!customer.address_street || customer.address_street.trim().length < 3) errors.push("Endereço (rua) inválido");
  if (!customer.address_number || customer.address_number.trim().length === 0) errors.push("Número do endereço é obrigatório");
  if (!customer.address_neighborhood || customer.address_neighborhood.trim().length < 2) errors.push("Bairro inválido");
  if (!customer.address_city || customer.address_city.trim().length < 2) errors.push("Cidade inválida");
  if (!customer.address_state || customer.address_state.trim().length !== 2) errors.push("Estado (UF) inválido");
  if (!validatePhone(customer.phone_whatsapp || "")) errors.push("Telefone inválido");
  const billValue = typeof customer.electricity_bill_value === "string"
    ? parseFloat(customer.electricity_bill_value)
    : customer.electricity_bill_value;
  if (isNaN(billValue) || billValue <= 0) errors.push("Valor da conta inválido");
  if (!customer.electricity_bill_photo_url || customer.electricity_bill_photo_url.trim().length === 0) errors.push("Foto da conta de luz é obrigatória");
  if (!customer.document_front_url || customer.document_front_url.trim().length === 0) errors.push("Documento (frente) é obrigatório");
  // CNH não tem verso — só exigir para RG (uso normalizado para evitar variações de caixa/texto)
  if (!isCNH(customer.document_type)) {
    const verso = (customer.document_back_url || "").trim();
    if (!verso || verso === "nao_aplicavel") errors.push("Documento (verso) é obrigatório");
  }
  if (customer.name && customer.name.trim().split(/\s+/).length < 2) warnings.push("Nome parece incompleto (sem sobrenome)");
  if (billValue < 50) warnings.push("Valor da conta parece muito baixo");

  return { valid: errors.length === 0, errors, warnings };
}

export function sanitizeCustomerData(customer: any): any {
  const sanitized: any = { ...customer };
  if (sanitized.name) {
    sanitized.name = sanitized.name.trim().split(/\s+/)
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
  if (sanitized.cpf) {
    const cpfClean = sanitized.cpf.replace(/\D/g, "");
    if (cpfClean.length === 11) sanitized.cpf = cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (sanitized.cep) {
    const cepClean = sanitized.cep.replace(/\D/g, "");
    if (cepClean.length === 8) sanitized.cep = cepClean.replace(/(\d{5})(\d{3})/, "$1-$2");
  }
  if (sanitized.phone_whatsapp) {
    const phoneClean = sanitized.phone_whatsapp.replace(/\D/g, "");
    sanitized.phone_whatsapp = phoneClean.startsWith("55") ? phoneClean : "55" + phoneClean;
  }
  if (sanitized.address_street) sanitized.address_street = sanitized.address_street.trim();
  if (sanitized.address_number) sanitized.address_number = sanitized.address_number.trim();
  if (sanitized.address_complement) sanitized.address_complement = sanitized.address_complement.trim();
  if (sanitized.address_neighborhood) sanitized.address_neighborhood = sanitized.address_neighborhood.trim();
  if (sanitized.address_city) sanitized.address_city = sanitized.address_city.trim();
  if (sanitized.address_state) sanitized.address_state = sanitized.address_state.trim().toUpperCase();
  if (!sanitized.email && sanitized.phone_whatsapp) {
    const phoneClean = sanitized.phone_whatsapp.replace(/\D/g, "");
    sanitized.email = `${phoneClean}@lead.igreen`;
  }
  if (sanitized.rg) sanitized.rg = sanitized.rg.trim();
  return sanitized;
}
