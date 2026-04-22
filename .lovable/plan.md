

## Gerar panfleto pronto + remover número pessoal do fallback

### 1. Salvar o "G verde" como asset do projeto

Copiar o arquivo enviado (`Cópia de G - Verde-3.png`) para `public/images/g-verde.png`. Vai ser usado tanto no centro do QR quanto no panfleto.

### 2. Remover número pessoal do fallback do `qr-redirect`

Hoje a edge function `supabase/functions/qr-redirect/index.ts` tem:
```ts
const FALLBACK_PHONE = "5511989000650"; // ← seu número pessoal, marcado erradamente como "iGreen oficial"
```

Trocar a lógica de fallback final: se não houver `connected_phone` nem `consultants.phone`, em vez de mandar pra um número fixo, redirecionar pra **landing page do consultor** (`https://igreen.institutodossonhos.com.br/{licenca}`) — assim o cliente vê a página com formulário/contato e o panfleto continua sem quebrar, **sem expor número pessoal de ninguém**.

Caso a licença nem exista no banco (panfleto antigo de licença removida), redirecionar pro site institucional `https://igreen.institutodossonhos.com.br/`.

### 3. Novo botão "📄 Panfleto" no painel `/admin` aba **Links**

Em `src/components/admin/LinksTab.tsx`, no card "Página de Cadastro" (que já é o fluxo do QR pro WhatsApp), adicionar um botão **"📄 Panfleto"** ao lado de "QR Code" e "Copiar".

Ao clicar, abre um novo modal `PanfletoModal` (componente novo, em `src/components/admin/PanfletoModal.tsx`) que:

**Renderiza o panfleto completo em um `<canvas>` 1240x1748px (A5 a 300dpi, pronto pra gráfica):**

```text
┌───────────────────────────────────────┐
│   [G verde]  iGreen Energy            │ ← topo verde com logo
│                                       │
│   Economize de 8% a 20%               │ ← headline
│   na sua conta de luz                 │
│                                       │
│   ✓ Sem obra, sem instalação          │
│   ✓ Sem mudar de distribuidora        │
│   ✓ Energia 100% limpa                │
│                                       │
│         ┌─────────────┐               │
│         │  ▓▓ QR ▓▓  │               │ ← QR com G verde no centro
│         │  ▓▓ ▓G▓ ▓▓ │               │
│         │  ▓▓▓▓▓▓▓▓▓ │               │
│         └─────────────┘               │
│                                       │
│   Aponte a câmera e fale agora        │
│   com {nomeDoConsultor}               │
│                                       │
│   www.igreen.institutodossonhos...    │
└───────────────────────────────────────┘
```

**O QR aponta pra:**
```
https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/qr-redirect?l={licenca_do_consultor}
```

Gerado com `qrcode` (lib que já tá no projeto via `qrcode.react`) em **error correction H** (~30%), com o `g-verde.png` desenhado no centro ocupando ~22% da área (margem branca redonda atrás pra contraste).

**Modal tem 3 botões:**
- **Baixar PNG** (1240x1748, pronto pra WhatsApp/redes)
- **Baixar PDF A5** (mesmo conteúdo, vetor — ideal pra gráfica imprimir milhares)
- **Copiar link do redirect** (caso queira compartilhar só o link)

### 4. Detalhes técnicos

- Lib nova: `jspdf` (PDF) e `qrcode` (gerar QR como dataURL pra desenhar no canvas, em vez de SVG). `qrcode.react` continua sendo usado nos QRs avulsos.
- Cores: verde primário `#16a34a` (já no design system), texto `#0F172A`, fundo branco.
- Fontes: Montserrat Bold pra títulos, Inter regular pro corpo (já carregadas no projeto).
- Nome do consultor vem de `form.name` (já disponível no `Admin.tsx` via `useAdminAuth`).
- Licença vem de `slug` (já calculado no `Admin.tsx`).
- O modal recebe `{ licenca, nomeConsultor }` por props.

### 5. O que NÃO muda

- Mensagem pré-salva (`DEFAULT_MESSAGE`) — mantida.
- QR Code padrão dos outros links (UTM, landing) — continua funcionando como antes.
- Lógica de redirect dinâmico (`connected_phone` → `consultants.phone` → fallback) — só muda o **fallback final**, que sai de "número pessoal" pra "landing page do consultor / site institucional".
- IDs de tracking (`page_events` continua registrando `qr_scan`).

### Arquivos afetados

| # | Arquivo | Ação |
|---|---------|------|
| 1 | `public/images/g-verde.png` | Novo (cópia do upload) |
| 2 | `supabase/functions/qr-redirect/index.ts` | Trocar fallback final pra landing page; remover `FALLBACK_PHONE` |
| 3 | `src/components/admin/PanfletoModal.tsx` | Novo componente — gera panfleto em canvas + exporta PNG/PDF |
| 4 | `src/components/admin/LinksTab.tsx` | Adicionar botão "📄 Panfleto" no card de Cadastro + prop nova |
| 5 | `src/pages/Admin.tsx` | Estado `panfletoOpen` + render do modal + passar `nomeConsultor` pra `LinksTab` |
| 6 | `package.json` | Adicionar `jspdf` e `qrcode` |

### Após salvar

- Frontend (itens 3-6): entram no próximo build automático.
- Edge function `qr-redirect` (item 2): redeploy automático ao salvar.
- Você abre `/admin` → aba **Links** → card "Página de Cadastro" → botão **📄 Panfleto** → baixa PNG ou PDF e manda pra gráfica.

