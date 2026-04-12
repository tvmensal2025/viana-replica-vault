# ✅ Próximos Passos - Migração Evolution API

## 🎯 Status Atual

✅ **Servidor Evolution API testado e funcionando!**
- URL: `https://igreen-evolution-api.d9v63q.easypanel.host`
- API Key: `429683C4C977415CAAFCCE10F7D57E11`
- Teste realizado com sucesso: servidor respondendo corretamente

## 📝 O Que Você Precisa Fazer AGORA

### 1️⃣ Configurar Variáveis no Supabase (OBRIGATÓRIO)

Acesse: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions

Configure estas variáveis de ambiente:

```
EVOLUTION_API_URL=https://igreen-evolution-api.d9v63q.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
```

**⚠️ IMPORTANTE:** Use HTTPS (não HTTP)

### 2️⃣ Redeploy da Edge Function (se necessário)

Após configurar as variáveis, pode ser necessário fazer redeploy da Edge Function `evolution-proxy`.

**Opções:**
- Aguardar alguns minutos (as variáveis podem ser aplicadas automaticamente)
- OU fazer redeploy manual da função no Supabase Dashboard

### 3️⃣ Testar no Frontend

1. **Abra o sistema no navegador**
2. **Faça logout e login novamente** (para renovar o token)
3. **Tente criar uma nova instância do WhatsApp**
4. **Verifique se o QR Code é gerado**

### 4️⃣ Verificar Logs (se houver problemas)

**Logs da Edge Function:**
https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/evolution-proxy/logs

**O que procurar:**
- `[evolution-proxy] EVOLUTION_API_URL(normalized): https://igreen-evolution-api...`
- `[evolution-proxy] EVOLUTION_API_KEY configured: true`
- `[evolution-proxy] Auth OK, user: ...`

## 🐛 Troubleshooting Rápido

### ❌ Erro: "Configuração do serviço de conexão incompleta"
**Causa:** Variáveis não configuradas no Supabase
**Solução:** Volte ao passo 1️⃣

### ❌ Erro: "Timeout ao processar requisição"
**Causa:** Edge Function ainda está usando a URL antiga
**Solução:** Faça redeploy da Edge Function

### ❌ Erro: "Token de autenticação inválido"
**Causa:** Token expirado
**Solução:** Faça logout e login novamente

### ❌ QR Code não aparece
**Causa:** Instância pode estar demorando para inicializar
**Solução:** Aguarde 10-15 segundos e tente novamente

## 📊 Como Saber se Funcionou?

✅ **Sinais de sucesso:**
- QR Code aparece na tela
- Consegue escanear o QR Code com o WhatsApp
- Status da conexão muda para "Conectado"
- Consegue enviar mensagens de teste

## 🔄 Rollback (se necessário)

Se algo der errado, você pode voltar para o servidor antigo:

1. Altere as variáveis no Supabase de volta para os valores antigos
2. Redeploy da Edge Function
3. Faça logout/login no frontend

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs da Edge Function
2. Verifique os logs do servidor Evolution no Easypanel
3. Teste a conexão direta com curl (comando no documento de migração)

---

## 🎉 Checklist Final

- [ ] Variáveis configuradas no Supabase
- [ ] Edge Function redeployada (se necessário)
- [ ] Logout/Login realizado
- [ ] Teste de criação de instância
- [ ] QR Code gerado com sucesso
- [ ] WhatsApp conectado
- [ ] Mensagem de teste enviada

**Quando todos os itens estiverem ✅, a migração está completa!**
