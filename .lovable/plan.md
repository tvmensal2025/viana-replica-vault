

# Plano: Template de impressão "Mutirão Lei 14.300" com QR dinâmico

## O que muda

Substituir a tela atual de impressão (`CadastroPage.tsx` no modo `showPrintView`) por um novo layout baseado na imagem de referência **ENERGIA-QRCODE.png** (Mutirão de Desconto na Fatura de Energia – Lei 14.300), onde:

1. A imagem original é usada como **fundo de página inteira A4**
2. O QR code "fake" que aparece na imagem original (canto inferior esquerdo) é **coberto** por um QR code branco real, gerado dinamicamente para o WhatsApp/instância de cada consultor
3. O nome e telefone do licenciado também ficam dinâmicos no rodapé (sobre a faixa "LICENCIADO: ...")

Resultado: cada consultor clica em **"Imprimir QR Code"** no `/cadastro/{licenca}` e gera um PDF A4 personalizado com o QR apontando pro WhatsApp da instância dele — quando o cliente escaneia, cai direto no bot que dispara a automação.

## Passos de implementação

### 1. Adicionar a imagem como asset
- Copiar `user-uploads://ENERGIA-QRCODE.png` para `public/images/mutirao-lei-14300.jpg` (uso direto via `<img src="...">` na tela de print, sem bundling)

### 2. Refatorar o bloco `if (showPrintView)` em `src/pages/CadastroPage.tsx`

Substituir todo o conteúdo atual do print view (linhas ~64-260) por um layout novo:

```tsx
<div className="print-page">
  {/* Fundo: imagem do mutirão ocupando A4 inteiro */}
  <img src="/images/mutirao-lei-14300.jpg" 
       style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />

  {/* Bloco branco que cobre o QR antigo (canto inf. esquerdo da imagem) */}
  <div style={{
    position:'absolute',
    left:'4.5%',          // posição calibrada sobre o QR fake
    bottom:'12%',
    width:'24%',          // ~140px no A4 a 96dpi
    aspectRatio:'1/1',
    background:'white',
    borderRadius:'6px',
    padding:'8px',
    boxShadow:'0 4px 16px rgba(0,0,0,0.4)'
  }}>
    <QRCodeSVG value={whatsappBotUrl} size={500} level="H" includeMargin={false}
               style={{ width:'100%', height:'100%' }} />
  </div>

  {/* Cobertura branca/escura sobre nome + telefone do rodapé, com dados do consultor */}
  <div style={{
    position:'absolute', left:'5%', bottom:'5.5%', width:'90%',
    display:'flex', justifyContent:'space-between', alignItems:'center',
    color:'white', fontFamily:'Arial Black', fontSize:'14px'
  }}>
    <span>LICENCIADO: {consultant.full_name?.toUpperCase()}</span>
    <span>WHATSAPP: {formatPhone(phoneNumber)}</span>
  </div>
</div>
```

### 3. Calibrar posição do QR
Os valores `left/bottom/width` serão ajustados visualmente após o primeiro render pra alinhar exatamente sobre o QR fake da imagem original (que fica em ~5% left, ~13% bottom, ~22% width na arte).

### 4. Garantir CSS de impressão A4
Manter o `@media print` existente (`@page { size: A4; margin: 0 }`) e `print-color-adjust: exact` pra preservar cores.

### 5. URL do QR (já existe, sem mudanças)
```
https://api.whatsapp.com/send?phone={phoneNumber}&text=Olá! Gostaria de fazer meu cadastro...
```
Onde `phoneNumber` vem de `useInstancePhone(consultant.id)` (telefone real da instância Evolution conectada do consultor). Quando o cliente escaneia → abre o WhatsApp → manda mensagem → cai no `evolution-webhook` daquela instância → bot inicia automação.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `public/images/mutirao-lei-14300.jpg` | **Novo** (copiado do upload) |
| `src/pages/CadastroPage.tsx` | Substituir bloco `showPrintView` (~200 linhas → ~80 linhas) |

## Comportamento

- A tela web (`/cadastro/{licenca}`) **continua igual** — a imagem do mutirão só aparece quando o usuário clica em **"Imprimir QR Code"**
- Cada consultor gera um PDF único com seu próprio QR
- QR aponta pra instância WhatsApp dele → automação inicia ao escanear

## Risco

Baixo. Mudança isolada no print view de uma única página. Tela normal e fluxo de automação não tocados.

