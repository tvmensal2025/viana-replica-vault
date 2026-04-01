

## Plano: Migrar upload de mídias de mensagens do MinIO para Supabase Storage

### Decisao
- **Landing page** (vídeos de notícias, imagens, depoimentos) → continua no MinIO, sem mudanças
- **Mídias de mensagens WhatsApp** (áudios, imagens, documentos dos templates/chat) → migra para Supabase Storage

### O que muda

#### 1. Reescrever a Edge Function `upload-media`
Trocar toda a lógica de AWS Signature V4 / MinIO por um simples upload ao Supabase Storage usando o SDK do Supabase (service role key). Usar o bucket existente `IMAGE` (já público) ou criar um bucket dedicado `whatsapp-media`.

- Recebe o arquivo via FormData (igual hoje)
- Valida tipo e tamanho (igual hoje)
- Faz upload via `supabase.storage.from('whatsapp-media').upload(key, fileBytes)`
- Retorna a URL pública do Supabase Storage

#### 2. Criar bucket `whatsapp-media` (público)
Migração SQL para criar o bucket e política de leitura pública.

#### 3. Atualizar `src/services/minioUpload.ts`
Renomear/atualizar comentários para refletir que agora usa Supabase Storage. A interface `UploadResult` e a função `uploadMedia` mantêm a mesma assinatura — apenas o backend muda (a edge function).

**Nenhum componente frontend precisa mudar** — todos já usam `uploadMedia()` que chama a edge function. A mudança é transparente.

### Arquivos afetados
| Arquivo | Ação |
|---------|------|
| `supabase/functions/upload-media/index.ts` | Reescrever (MinIO → Supabase Storage) |
| Nova migração SQL | Criar bucket `whatsapp-media` público |
| `src/services/minioUpload.ts` | Atualizar comentários/nome do logger |

### Benefícios
- Upload e download mais rápidos (mesmo datacenter Supabase)
- Sem problemas de SSL/timeout do MinIO
- Sem necessidade de AWS Signature V4

