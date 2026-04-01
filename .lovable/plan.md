

## Problemas Identificados

**1. Templates "publicos" sumiram** — A tabela `message_templates` tem a policy `Owner select templates` com `USING (consultant_id = auth.uid())`, impedindo que outros consultores vejam templates criados por voce. Na conversa anterior foi proposta uma migracao para corrigir isso mas ela nao foi aplicada (ou foi revertida).

**2. Videos do MinIO nao carregam** — O screenshot mostra um video vazio na landing page (`igreen.institutodossonhos.com.br/elisa-silva`). Os videos sao servidos diretamente do MinIO (`igreen-minio.b099mi.easypanel.host/igreen/*.mp4`). Isso e um problema de rede/CORS/SSL do servidor MinIO, nao do codigo do app. Os arquivos do Supabase Storage (buckets `whatsapp-media`, `IMAGE`, etc.) sao todos publicos e devem estar acessiveis.

## Plano

### Passo 1: Corrigir RLS dos templates (migracao SQL)

Dropar a policy `Owner select templates` e criar uma nova que permite leitura para todos os autenticados:

```sql
DROP POLICY IF EXISTS "Owner select templates" ON public.message_templates;

CREATE POLICY "Authenticated read all templates"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (true);
```

As policies de INSERT, UPDATE e DELETE continuam restritas ao owner — ninguem edita ou exclui templates alheios.

### Passo 2: Verificar MinIO

O problema do video vazio no screenshot e externo ao app. Os videos sao carregados diretamente do MinIO via URL publica. Possiveis causas:
- Servidor MinIO offline ou lento
- Certificado SSL invalido
- CORS bloqueando o dominio `institutodossonhos.com.br`

Nenhuma alteracao de codigo e necessaria — o problema esta na infraestrutura do EasyPanel/MinIO.

### Resumo

| Alteracao | Tipo |
|-----------|------|
| Nova policy RLS `Authenticated read all templates` | Migracao SQL |
| Verificar servidor MinIO | Acao manual (infra) |

