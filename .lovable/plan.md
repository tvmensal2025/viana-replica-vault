

## Diagnóstico: Imagens dos templates não foram salvas

### Problema encontrado
Consultei o banco de dados e confirmei: **todos os 4 templates de áudio têm `image_url = NULL`**.

| Template | media_type | image_url |
|----------|-----------|-----------|
| Cadastrado reprovado | audio | NULL |
| Cadastro aprovado | audio | NULL |
| Fatura Ilegível | audio | NULL |
| Fatura com Débito | audio | NULL |

As imagens foram enviadas ao Supabase Storage com sucesso (o upload funcionou), mas o **update no banco foi bloqueado pela política de RLS** que estava incorreta na hora em que você tentou salvar. 

A correção de RLS que acabamos de aplicar já está ativa no banco. Porém as imagens que você adicionou antes dessa correção **não foram gravadas**.

### Plano

#### Opção A — Você re-adiciona as imagens (recomendado)
Basta clicar em "Adicionar imagem" em cada um dos 4 templates novamente. Agora o sistema vai:
1. Fazer upload → funciona (já funcionava)
2. Salvar `image_url` no banco → **agora funciona** com a RLS corrigida
3. Se falhar, mostrar um erro visível (toast vermelho)

#### Opção B — Corrigir via SQL (automático)
Se você souber quais imagens foram para quais templates, posso rodar um UPDATE direto no banco para preencher os `image_url` dos 4 templates. Mas como os uploads anteriores geraram URLs que não sabemos qual é qual, é mais seguro re-adicionar manualmente.

### Melhoria adicional no código
Adicionar um **toast de sucesso** quando a imagem for salva com sucesso no `AddImageToTemplate`, para dar feedback claro ao usuário de que a operação completou.

