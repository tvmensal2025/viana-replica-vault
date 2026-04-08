

# Proteção Anti-Bloqueio: Análise Profunda e Plano de Blindagem

## Problemas Críticos Encontrados

### 1. SEM ATRASO ENTRE MÍDIAS PARA O MESMO CONTATO
Em `BulkBlockSendPanel.tsx` linhas 146-172, quando um template tem áudio + imagem + texto, os 3 envios acontecem em sequência **sem nenhum delay entre eles**. O WhatsApp detecta isso como comportamento de bot — nenhum humano envia 3 mensagens em < 1 segundo.

### 2. SEM LIMITE DIÁRIO DE ENVIOS
Não existe controle de quantas mensagens foram enviadas no dia. O WhatsApp bloqueia números que enviam mais de ~250 mensagens/dia para novos números. Sem limite, o usuário pode disparar 500+ mensagens e perder o número.

### 3. SEM CIRCUIT BREAKER (PARADA AUTOMÁTICA POR FALHAS)
Se 10 mensagens consecutivas falharem (ex: instância desconectou), o sistema continua tentando enviar todas as restantes. Deveria parar automaticamente após N falhas consecutivas.

### 4. SEM DETECÇÃO DE DUPLICATAS
Se o mesmo número aparecer 2x na lista (ex: colado + importado da base), ele recebe a mensagem 2x. Spam duplicado é o gatilho #1 de bloqueio.

### 5. ATRASO PROGRESSIVO REINICIA A CADA BLOCO
O `getRandomInterval(i)` usa o índice `i` dentro do bloco, não o índice global. Então o atraso extra por volume reinicia a cada bloco, quando deveria ser acumulativo.

### 6. SEM VERIFICAÇÃO DE CONEXÃO ANTES DE CADA BLOCO
Se o WhatsApp desconectar no meio do envio, o sistema continua enviando para a API e recebendo erros — gerando logs desnecessários e possivelmente causando instabilidade.

### 7. SEM MODO AQUECIMENTO
Números novos no WhatsApp Business devem começar com poucos envios (10-20/dia) e aumentar gradualmente. Não existe aviso ou controle disso.

---

## Plano de Implementação

### Arquivo: `src/components/whatsapp/BulkBlockSendPanel.tsx`

**A. Jitter entre mídias (2-4s entre cada envio para o mesmo contato)**
Adicionar `await sleep(2000 + Math.random() * 2000)` entre cada chamada de `sendWhatsAppMessage` dentro do loop de envio de mídias (linhas 149-171).

**B. Circuit breaker — parada automática**
Manter contador de falhas consecutivas. Se atingir 5 falhas seguidas:
- Pausar automaticamente
- Mostrar alerta: "⚠️ Muitas falhas consecutivas. Verifique a conexão."
- Permitir retomar manualmente

**C. Detecção de duplicatas**
Antes de iniciar o envio, filtrar `validContacts` removendo números duplicados (normalizar para apenas dígitos e deduplicar). Mostrar badge com quantos duplicados foram removidos.

**D. Índice global no atraso progressivo**
Trocar `getRandomInterval(i)` por `getRandomInterval(globalIndex)` onde `globalIndex` é o acumulador entre todos os blocos.

**E. Limite diário com aviso**
Adicionar constante `DAILY_SAFE_LIMIT = 200`. Antes de enviar, somar com mensagens já enviadas na sessão. Se ultrapassar, mostrar alerta laranja: "⚠️ Limite seguro diário próximo. Enviar mais pode causar bloqueio." — mas permitir prosseguir com confirmação extra.

**F. Check de conexão antes de cada bloco**
Antes de iniciar cada bloco, verificar `getConnectionState(instanceName)`. Se não estiver `open`, pausar automaticamente e avisar.

### Arquivo: `src/services/messageSender.ts`

**G. Rate limiting por contato**
Adicionar um timestamp do último envio por número em um Map local. Se tentar enviar para o mesmo número em < 5s, aguardar automaticamente.

### Arquivo: `src/components/whatsapp/BlockConfigurator.tsx`

**H. Painel de segurança visual**
Adicionar indicadores visuais:
- 🟢 "Seguro" (≤100 contatos, intervalo ≥15min)
- 🟡 "Moderado" (101-200, intervalo ≥10min)  
- 🔴 "Arriscado" (>200 ou intervalo <10min)
- Dica: "Recomendamos no máximo 200 envios por dia"

### UI: Resumo antes do envio

Adicionar etapa de confirmação antes de disparar:
```text
━━━ Confirmar Envio ━━━
📱 142 contatos (3 duplicados removidos)
📝 Template: "Proposta Energia Solar"  
📦 8 blocos de 20 • Intervalo: 15min
⏱️ Tempo estimado: ~2h 30min
🛡️ Nível: 🟢 Seguro
━━━━━━━━━━━━━━━━━━━━━
```

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `BulkBlockSendPanel.tsx` | Jitter entre mídias, circuit breaker, duplicatas, confirmação, limite diário, check conexão |
| `BlockConfigurator.tsx` | Indicador visual de risco |
| `messageSender.ts` | Rate limiting por contato |
| `ContactImporter.tsx` | Deduplicação automática com feedback |

