

## Plan: Integrar MinIO para Upload de Arquivos (Imagens, Áudio, Vídeos, Documentos)

### Problema
Atualmente, os templates de mídia pedem uma URL manual. Queremos permitir **upload direto de arquivos** para o MinIO (S3-compatible) e usar a URL gerada automaticamente.

### Arquitetura

```text
┌─────────────┐     POST /upload-media     ┌──────────────────┐     PUT (S3)     ┌─────────┐
│  Frontend    │ ──────────────────────────▶│  Edge Function   │───────────────▶  │  MinIO  │
│  (file pick) │ ◀──────────────────────────│  upload-media    │◀───────────────  │  bucket │
│              │     { publicUrl }          └──────────────────┘                  └─────────┘
└─────────────┘
```

> As credenciais do MinIO ficam como **secrets** na Edge Function (nunca expostas no frontend).

### Etapas

**1. Adicionar secrets do MinIO ao projeto**
- `MINIO_SERVER_URL` = `https://yolo-service-minio.0sw627.easypanel.host`
- `MINIO_ROOT_USER` = `testando200`
- `MINIO_ROOT_PASSWORD` = `200400500600`

**2. Criar Edge Function `upload-media`**
- Recebe `multipart/form-data` com o arquivo
- Usa a API S3 (PutObject via fetch com assinatura AWS Signature V4) para fazer upload ao MinIO
- Cria o bucket `media-templates` automaticamente se não existir
- Retorna a URL pública do arquivo: `https://yolo-service-minio.0sw627.easypanel.host/media-templates/{uuid}.{ext}`
- Suporta tipos: `image/*`, `audio/*`, `video/*`, `application/pdf`, `application/msword`, etc.

**3. Criar serviço frontend `src/services/minioUpload.ts`**
- Função `uploadMedia(file: File): Promise<string>` que chama a Edge Function e retorna a URL pública

**4. Atualizar `TemplateManager.tsx`**
- Adicionar botão de **upload de arquivo** ao lado do campo de URL para cada tipo de mídia
- Ao selecionar arquivo, faz upload via `uploadMedia()`, mostra progresso, e preenche o campo `mediaUrl` automaticamente
- Manter opção de colar URL manualmente como alternativa
- Preview inline do arquivo selecionado (thumbnail para imagem, player para áudio)

**5. Atualizar `MessageComposer.tsx`** (opcional mas útil)
- Permitir anexar arquivos diretamente no chat via upload MinIO

### Detalhes Técnicos

- **Edge Function**: Usará `aws4fetch` (biblioteca leve de assinatura S3) para autenticar com MinIO — compatível com Deno
- **Bucket público**: O bucket `media-templates` será configurado com policy pública de leitura para que as URLs funcionem diretamente com a Evolution API
- **Nomeação**: Arquivos salvos como `{uuid}-{timestamp}.{ext}` para evitar colisões
- **Limite de tamanho**: 25MB por arquivo (suficiente para áudio, imagens e PDFs)

