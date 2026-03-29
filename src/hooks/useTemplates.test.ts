import { describe, it, expect } from "vitest";
import { applyTemplate } from "./useTemplates";
import type { MessageTemplate } from "@/types/whatsapp";

function makeTemplate(content: string): MessageTemplate {
  return {
    id: "t1",
    consultant_id: "c1",
    name: "Test",
    content,
    media_type: "text",
    media_url: null,
    created_at: new Date().toISOString(),
  };
}

describe("applyTemplate", () => {
  it("replaces {{nome}} with customer name", () => {
    const result = applyTemplate(makeTemplate("Olá {{nome}}!"), {
      name: "Maria",
    });
    expect(result).toBe("Olá Maria!");
  });

  it("replaces {{valor_conta}} with electricity bill value", () => {
    const result = applyTemplate(
      makeTemplate("Sua conta: R${{valor_conta}}"),
      { name: "João", electricity_bill_value: 250.5 }
    );
    expect(result).toBe("Sua conta: R$250.5");
  });

  it("replaces {{valor_conta}} with empty string when undefined", () => {
    const result = applyTemplate(
      makeTemplate("Conta: {{valor_conta}}"),
      { name: "Ana" }
    );
    expect(result).toBe("Conta: ");
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    const result = applyTemplate(
      makeTemplate("{{nome}}, olá {{nome}}!"),
      { name: "Carlos" }
    );
    expect(result).toBe("Carlos, olá Carlos!");
  });

  it("replaces both placeholders in the same template", () => {
    const result = applyTemplate(
      makeTemplate("Olá {{nome}}, sua conta é R${{valor_conta}}."),
      { name: "Lucia", electricity_bill_value: 180 }
    );
    expect(result).toBe("Olá Lucia, sua conta é R$180.");
  });

  it("returns content unchanged when no placeholders exist", () => {
    const result = applyTemplate(
      makeTemplate("Mensagem sem placeholders"),
      { name: "Test" }
    );
    expect(result).toBe("Mensagem sem placeholders");
  });
});
