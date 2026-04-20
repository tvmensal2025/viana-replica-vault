

# Plano: Organização hierárquica MinIO por consultor + cliente

## Estrutura atual (problema)

```
igreen/
└── documentos/
    └── 124661/                                    ← só ID, sem nome
        ├── joao_silva_19930720_conta.pdf          ← arquivos soltos
        ├── joao_silva_19930720_doc_frente.jpg     ← misturados na raiz
        ├── joao_silva_19930720_doc_verso.jpg
        ├── maria_santos_19850315_conta.pdf
        └── maria_santos_19850315_doc_frente.jpg
```

## Estrutura nova (proposta)

```
igreen/
└── documentos/
    ├── 124661_joao_consultor/                     ← ID + nome do consultor
    │   ├── joao_silva_19930720/                   ← pasta por cliente (nome + nascimento)
    │   │   ├── conta.pdf                          ← tipo do doc como nome
    │   │   ├── doc_frente.jpg
    │   │   └── doc_verso.jpg
    │   └── maria_santos_19850315/
    │       ├── conta.pdf
    │       └── doc_frente.jpg
    └── 124662_pedro_consultor/
        └── ana_costa_19880225/
            ├── conta.pdf
            └── doc_frente.jpg
```

**Ganhos**: navegar no MinIO fica intuitivo, vê o nome do consultor sem precisar consultar banco, e cada cliente tem uma pastinha própria fácil de baixar/zipar inteira.

## Mudanças no código

### 1. `supabase/functions/upload-documents-minio/index.ts`

Trocar a montagem do caminho:

```ts
// ANTES
const baseFileName = `${firstNameNorm}_${lastNameNorm}_${dateFormatted}`;
const folderPath = `documentos/${consultantId}`;
const objectKey = `${folderPath}/${baseFileName}_conta.${ext}`;
// → documentos/124661/joao_silva_19930720_conta.pdf

// DEPOIS
const consultantFolder = `${consultantId}_${normalizeFileName(consultantName)}`;
const customerFolder = `${firstNameNorm}_${lastNameNorm}_${dateFormatted}`;
const folderPath = `documentos/${consultantFolder}/${customerFolder}`;
const objectKey = `${folderPath}/conta.${ext}`;
// → documentos/124661_joao_consultor/joao_silva_19930720/conta.pdf
```

Mesmo padrão pros 3 uploads (conta, doc_frente, doc_verso).

### 2. `supabase/functions/_shared/minio-upload.ts`

Atualizar a interface `MinioUploadInput` pra aceitar `consultantName` e ajustar a montagem do `objectKey`:

```ts
export interface MinioUploadInput {
  bytes: Uint8Array;
  contentType: string;
  consultantFolder: string;     // igreen_id ou uuid
  consultantName?: string;       // NOVO: nome do consultor pra pasta
  customerName: string;
  customerBirth?: string | null;
  kind: "conta" | "doc_frente" | "doc_verso";
}

// montagem
const consultantSlug = `${normalizeName(input.consultantFolder)}_${normalizeName(input.consultantName || "")}`.replace(/_+$/, "");
const customerSlug = `${first}_${last}_${dateStr}`;
const folder = `documentos/${consultantSlug}/${customerSlug}`;
const objectKey = `${folder}/${input.kind}.${ext}`;
```

### 3. `supabase/functions/evolution-webhook/` (chamadores)

Procurar onde `uploadBytesToMinio` é chamado e passar `consultantName` (já temos `nomeRepresentante` no `BotContext`). Pequeno ajuste em 2-3 chamadas.

## Compatibilidade com arquivos antigos

Arquivos já enviados no formato antigo (`documentos/124661/joao_silva_..._conta.pdf`) **continuam acessíveis** pelas URLs salvas no banco — nada quebra. A nova estrutura só vale pra uploads novos a partir do deploy.

Não vou migrar arquivos antigos automaticamente (risco alto, sem ganho funcional). Se quiser organizar o histórico depois, fazemos um script separado.

## Resumo

| Item | Antes | Depois |
|---|---|---|
| Pasta do consultor | `124661/` | `124661_joao_consultor/` |
| Arquivos do cliente | soltos na raiz | dentro de `joao_silva_19930720/` |
| Nome do arquivo | `joao_silva_19930720_conta.pdf` | `conta.pdf` |
| Encontrar consultor sem banco | impossível | nome na pasta |
| Baixar todos docs de 1 cliente | filtrar por prefixo | baixar pasta inteira |

**Risco**: baixo. Só muda nomenclatura, mesma API MinIO, mesmas credenciais, URLs antigas preservadas.

