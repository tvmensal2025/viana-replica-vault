
O usuário relata 2 problemas:
1. **Sistema lento** — provavelmente edge function travando por causa de uploads grandes (MinIO timeout 8s × 3 arquivos = 24s) + base64 inflando payload
2. **Worker trava ao clicar no campo telefone após CPF** — gap conhecido no fluxo do portal: depois do blur do CPF (que auto-preenche Nome+DataNasc via Receita), o worker pula direto para telefone sem aguardar o auto-preenchimento estabilizar, e o React do portal re-renderiza o form bloqueando o input

Vou investigar rapidamente os arquivos críticos antes de planejar.
