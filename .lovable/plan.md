

# Substituir vídeo do topo (Conta de Energia) — usar MinIO

## O que será feito

Trocar o vídeo do hero da landing page principal para apontar para o MinIO, usando a mesma base URL já utilizada na `NewsSection`.

## Etapa única

| Arquivo | Mudança |
|---------|---------|
| `src/components/HeroSection.tsx` | Trocar `"/videos/igreen-energy.mp4"` por `"https://igreen-minio.b099mi.easypanel.host/igreen/Green_Energy.mp4"` |

O usuário precisa primeiro fazer upload do arquivo `Green_Energy.mp4` no bucket `igreen` do MinIO. Após isso, basta atualizar a URL no componente.

## Pré-requisito

- O arquivo `Green_Energy.mp4` deve estar disponível no MinIO em `https://igreen-minio.b099mi.easypanel.host/igreen/Green_Energy.mp4`. Se o nome do arquivo for diferente, a URL será ajustada conforme necessário.

