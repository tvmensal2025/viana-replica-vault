

# Plano: Melhorias no Envio em Massa + Exportação de Contatos + Auditoria de Agendamentos

## Diagnóstico

### Envio em Massa
- A lista de contatos já mostra nome e telefone, mas de forma **muito compacta** (texto 11px, difícil de ler)
- Na lista de seleção do banco, nome e telefone aparecem em uma única linha sem destaque
- Falta formatação visual profissional (avatar, badges de status, telefone formatado)

### Exportação de Contatos
- **Não existe** funcionalidade para extrair contatos de grupos do WhatsApp
- **Não existe** funcionalidade para exportar contatos do celular (via Evolution API `findContacts`)
- A API Evolution já possui o endpoint `findContacts` e `findChats` que retorna grupos (`@g.us`)

### Agendamentos
- O sistema está **funcional**: 2 enviadas com sucesso, 1 falha (número incorreto)
- Edge function `send-scheduled-messages` está correta
- O cron job executa a cada 5 minutos via `pg_cron`

---

## Mudanças Planejadas

### 1. Redesign profissional da lista de contatos no Envio em Massa
**Arquivo:** `src/components/whatsapp/ContactImporter.tsx`

- Exibir **nome em negrito + telefone formatado** com layout claro em cada linha
- Adicionar ícone de avatar (iniciais coloridas) para cada contato
- Mostrar badge de status (aprovado/pendente/reprovado) na lista do banco
- Telefones inválidos com destaque visual (ícone de alerta + texto riscado)
- Lista final de contatos selecionados com nome, telefone formatado e fonte de origem

### 2. Nova aba "Extrair Contatos" no ContactImporter
**Arquivo:** `src/components/whatsapp/ContactImporter.tsx`

Adicionar uma **4a aba** com duas seções:

**a) Contatos do Celular:**
- Busca via `findContacts` da Evolution API (já existe)
- Lista todos os contatos salvos no celular conectado
- Nome + telefone formatado
- Checkbox para selecionar e adicionar à lista de envio
- Botão "Exportar para Excel" com nome, telefone, pushName

**b) Contatos de Grupos:**
- Busca via Evolution API endpoint `group/fetchAllGroups/{instance}` para listar grupos
- Para cada grupo selecionado, busca participantes via `group/participants/{instance}?groupJid=xxx`
- Exibe participantes com nome + telefone
- Exportar para Excel organizado por grupo (cada grupo = uma aba)

### 3. Novos endpoints na Evolution API service
**Arquivo:** `src/services/evolutionApi.ts`

- `fetchAllGroups(instanceName)` — lista todos os grupos
- `getGroupParticipants(instanceName, groupJid)` — participantes de um grupo

### 4. Agendamentos — sem mudanças necessárias
O sistema está funcionando corretamente. A falha registrada foi por número errado, não por bug.

---

## Detalhes Técnicos

### Novo componente de exportação Excel
- Utiliza a lib `xlsx` já instalada no projeto
- Contatos do celular: uma planilha com colunas Nome, Telefone, PushName
- Contatos de grupos: uma aba por grupo com colunas Nome, Telefone, Admin (sim/não)

### Evolution API endpoints utilizados
```
POST /chat/findContacts/{instance}  → contatos do celular (já existe)
GET  /group/fetchAllGroups/{instance} → lista de grupos  
GET  /group/participants/{instance}?groupJid=xxx → membros do grupo
```

### Formatação de telefone profissional
```
5511990092401 → (11) 99009-2401
5521988887777 → (21) 98888-7777
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/components/whatsapp/ContactImporter.tsx` | Redesign visual + nova aba "Extrair" |
| `src/services/evolutionApi.ts` | Novos endpoints grupos |
| `src/components/whatsapp/BulkBlockSendPanel.tsx` | Ajustes menores de layout |

