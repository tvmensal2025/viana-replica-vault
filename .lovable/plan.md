

# Redesign da Página de Cadastro

## Resumo
Redesenhar a CadastroPage para ficar visualmente premium com decorações de painéis solares, trocar o logo no centro do QR Code por apenas a letra "G" estilizada, e garantir que o QR Code aponte para a instância WhatsApp conectada do consultor.

## Mudanças Visuais

### 1. Decoração com painéis solares no background
- Adicionar SVGs decorativos de painéis solares nos cantos e laterais da hero section
- Painel solar estilizado no canto superior direito e inferior esquerdo com opacidade baixa
- Raios de sol sutis irradiando do centro
- Padrão de grid solar semi-transparente no fundo

### 2. QR Code com "G" no centro
- Trocar `imageSettings.src` de `/images/logo-colorida-igreen.png` para um SVG inline com a letra "G" em verde (#00B74F) sobre fundo branco, estilo bold/arredondado
- Criar um componente SVG simples com a letra "G" para usar como data URI no QR Code

### 3. QR Code dinâmico por instância conectada
- Buscar a `whatsapp_instance` do consultor no Supabase (tabela `whatsapp_instances` onde `consultant_id = consultant.id`)
- Se existir instância conectada, gerar o QR URL usando o número da instância
- Fallback para o telefone do consultor se não houver instância

### 4. Melhorias visuais gerais
- Fundo com gradiente mais rico (verde escuro para verde claro com textura)
- Cards com glassmorphism mais pronunciado
- Animações sutis nos painéis solares decorativos (float/rotate lento)
- Border glow no card do QR Code

## Arquivos Modificados
- `src/pages/CadastroPage.tsx` — redesign completo da hero + decorações solares + QR com "G" + busca de instância WhatsApp
- `src/components/QRCodeSection.tsx` — mesmas melhorias (este componente é usado em outras páginas)

## Detalhes Técnicos

### SVG "G" para o QR Code
```typescript
// Data URI com letra G estilizada
const gLogoDataUri = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="white"/><text x="20" y="28" text-anchor="middle" font-family="Arial Black" font-size="28" font-weight="900" fill="#00B74F">G</text></svg>'
)}`;
```

### Busca da instância WhatsApp
```typescript
const { data: instance } = await supabase
  .from("whatsapp_instances")
  .select("phone_number, instance_name")
  .eq("consultant_id", consultant.id)
  .eq("status", "connected")
  .maybeSingle();

const phoneNumber = instance?.phone_number || fallbackPhone;
```

### Decorações SVG de painéis solares
Painéis solares como elementos SVG absolutos posicionados nos cantos com `opacity-10` a `opacity-20`, com animação CSS `animate-float` sutil.

