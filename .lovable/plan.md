

## Problemas Identificados e Plano de Correção

### Problema 1: GP e GI somando errado

**Causa raiz**: O código atual soma o GP e GI de TODOS os membros da rede, incluindo o Rafael (nível 0). Mas os valores de GI já são cumulativos na API -- o GI do Rafael (74.928) já inclui toda a rede abaixo dele. Somar tudo duplica/triplica os valores.

**Dados reais do Excel**:
- Rafael (nível 0): GP=13.144, GI=49.632, Bonificável=62.776
- Total correto para exibir nos cards: GP do Rafael = 13.144, GI do Rafael = 49.632

**Correção**: Os cards de resumo devem mostrar apenas os valores do membro raiz (nível 0), pois ele já consolida toda a rede. Alternativamente, mostrar "GP Rede" como a soma dos GP individuais de cada membro (excluindo o raiz) e "GI Rede" como o GI do raiz.

### Problema 2: Visualização em árvore

Atualmente é uma tabela plana. O usuário quer ver a hierarquia como árvore, usando `sponsor_id` para construir os relacionamentos pai-filho.

**Implementação**: Componente de árvore colapsável onde cada nó mostra o licenciado com seus dados (GP, GI, clientes, cidade). Os filhos ficam indentados abaixo do pai. Cada nível terá uma cor/indentação visual distinta.

```text
Rafael Ferreira Dias (124170) — GP: 13.144 | GI: 49.632 | 53 cli
├── Leonardo Santana (125283) — GP: 859 | GI: 31.714 | 5 cli
│   └── Nilma Tavares (125483) — GP: 18.550 | GI: 25.602 | 59 cli
│       ├── Sueli Carseti (126629) ...
│       ├── Edson Francischinelli (128188) ...
│       └── Alessandro Ferraz (129414) ...
├── Oseias de Souza (124657) — GP: 5.138 | GI: 7.366 | 15 cli
│   └── Edina Gomes (127391) ...
│       └── Michel Alessandro (127950) ...
├── Sirlene Correa (124661) — GP: 5.860 | GI: 3.014 | 11 cli
│   ├── Valdemir Celestiano (134933) ...
│   └── Leandro Severiano (132644) ...
...
```

### Problema 3: Clicar para enviar mensagem

Ao clicar no nome ou num botão de WhatsApp ao lado do licenciado, abre `https://wa.me/55XXXXXXXXXXX` em nova aba (mesmo padrão usado no `CustomerManager.tsx`).

---

### Alterações técnicas

**Arquivo: `src/components/admin/NetworkPanel.tsx`** (reescrever)

1. **Corrigir cálculo dos cards de resumo**:
   - GP Total = valor do membro raiz (nível 0)
   - GI Total = valor do membro raiz (nível 0)
   - Clientes Ativos = soma de todos os membros
   - Licenciados = total de membros (excluindo o raiz)

2. **Adicionar visualização em árvore**:
   - Função `buildTree(members)` que constrói a hierarquia usando `sponsor_id` → `igreen_id`
   - Componente recursivo `TreeNode` que renderiza cada membro com indentação visual
   - Cada nó é colapsável (usando Collapsible do Radix)
   - Indentação visual com linhas conectoras via CSS (border-left + padding-left por nível)

3. **Adicionar ação de clique para WhatsApp**:
   - Ícone de WhatsApp (MessageCircle) ao lado de cada nome
   - `onClick` → `window.open("https://wa.me/{phone}", "_blank")`
   - Só exibe o ícone se o membro tiver telefone

4. **Toggle entre visualização tabela e árvore**:
   - Dois botões (Tabela / Árvore) no header
   - Estado `viewMode: "tree" | "table"`
   - Árvore como padrão

