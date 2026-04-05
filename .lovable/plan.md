

# Trocar vídeo do topo da seção "Como Funciona"

## O que será feito

Substituir o vídeo atual (`/videos/como-funciona-cliente.mp4`) pelo vídeo `casasustentavel.mp4` servido via MinIO, no topo da seção "Como funciona a energia solar da iGreen Energy".

## Mudança

### `src/components/HowItWorksSection.tsx`

- Linha 19: trocar o `src` do `<source>` de `/videos/como-funciona-cliente.mp4` para `https://igreen-minio.b099mi.easypanel.host/igreen/casasustentavel.mp4`
- Isso segue o mesmo padrão já usado no HeroSection (vídeo servido via MinIO)

Nenhuma outra alteração necessária -- o layout, estilo e estrutura permanecem iguais.

