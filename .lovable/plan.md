

# Melhorias no Painel de Envio em Massa

## Analise do estado atual

O painel atual tem: filtros por status (Todos/Aprovado/Reprovado/Pendente), filtro por licenciado, seletor de template, textarea de mensagem, e lista de clientes com checkboxes. Funciona, mas falta refinamento em areas-chave comparado com ferramentas como WATI, Interakt, e Brevo.

## Melhorias propostas (baseadas em analise de mercado)

### 1. Barra de busca na lista de clientes
Todas as ferramentas de mercado tem busca por nome/telefone na lista. Hoje o usuario precisa rolar a lista inteira para encontrar alguem.

### 2. Preview da mensagem antes de enviar
Ferramentas como WATI mostram um "preview do WhatsApp" com a mensagem renderizada (com variaveis substituidas) antes do envio. Adicionar um mockup de celular ou card mostrando como a mensagem final ficara com os dados do primeiro cliente selecionado.

### 3. Contador de clientes validos vs invalidos
Na screenshot, varios clientes tem "sem_celular_XXXXX". O sistema ja filtra na hora do envio, mas o usuario nao sabe quantos vao falhar. Mostrar: "9 filtrados (6 validos, 3 sem numero)".

### 4. Agendamento de envio
Permitir agendar o envio em massa para uma data/hora futura em vez de enviar imediatamente. Muito comum em WATI e Interakt.

### 5. Filtro por devolutiva visivel
O filtro de devolutiva existe no codigo mas nao aparece na UI quando status = "rejected". Tornar visivel.

### 6. Excluir automaticamente numeros invalidos da selecao
Quando o usuario clica "Selecionar Todos", excluir automaticamente clientes com telefone invalido (sem_celular, etc). Hoje eles sao selecionados mas falham silenciosamente.

### 7. Estimativa de tempo de envio
Mostrar antes de enviar: "Tempo estimado: ~8 minutos" baseado na quantidade selecionada e nos intervalos anti-bloqueio.

### 8. Historico de envios em massa
Registrar cada campanha (data, template, qtd enviada, qtd falha) para consulta posterior.

## Prioridade de implementacao

| # | Melhoria | Impacto | Esforco |
|---|----------|---------|---------|
| 1 | Busca na lista | Alto | Baixo |
| 2 | Excluir invalidos do "Selecionar Todos" | Alto | Baixo |
| 3 | Contador validos/invalidos | Alto | Baixo |
| 4 | Estimativa de tempo | Medio | Baixo |
| 5 | Preview da mensagem | Alto | Medio |
| 6 | Filtro devolutiva visivel | Medio | Baixo |
| 7 | Agendamento | Alto | Alto |
| 8 | Historico de campanhas | Medio | Alto |

## Plano de implementacao (itens 1-6, rapidos)

### Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| `BulkSendPanel.tsx` | Busca, contador, filtro invalidos, estimativa de tempo, filtro devolutiva, preview |

### Detalhes tecnicos

- **Busca**: Input com `useState<string>` filtrando `filteredCustomers` por nome ou telefone
- **Invalidos**: Funcao `isValidPhone(phone)` que exclui "sem_celular" e telefones < 10 digitos; badge mostrando quantos sao invalidos; "Selecionar Todos" ignora invalidos
- **Contador**: Ao lado de "X selecionados", mostrar "Y validos / Z sem numero"
- **Estimativa**: Calcular `selectedIds.size * avgInterval` e mostrar "~X min"
- **Preview**: Card com fundo verde WhatsApp mostrando mensagem com variaveis substituidas do primeiro selecionado
- **Filtro devolutiva**: Mostrar dropdown de categorias de devolutiva quando status = "rejected"

Os itens 7 e 8 (agendamento e historico) exigem tabelas no banco e Edge Functions, podem ser feitos em uma fase posterior.

