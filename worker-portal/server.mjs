/**
 * Portal Worker - iGreen Energy
 * Servidor de automação com Playwright
 * Versão: 5.1.0
 */

import http from 'http';
import { createClient } from '@supabase/supabase-js';
import { executarAutomacao } from './playwright-automation.mjs';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3100;
const WORKER_SECRET = process.env.WORKER_SECRET || 'igreen-worker-secret-2024';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Supabase client
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log('✅ Supabase configurado');
} else {
  console.warn('⚠️ Supabase NÃO configurado (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY faltando)');
}

// ═══════════════════════════════════════════════════════════════════
// FILA DE PROCESSAMENTO
// ═══════════════════════════════════════════════════════════════════

const queue = [];
let currentJob = null;
let isProcessingLock = false;
const recentlyProcessed = new Set();
const retryTracker = new Map();
const activities = [];
const MAX_ACTIVITIES = 50;

function logActivity(event, customerId, message) {
  const activity = {
    at: new Date().toISOString(),
    event,
    customer_id: customerId,
    message,
  };
  activities.unshift(activity);
  if (activities.length > MAX_ACTIVITIES) activities.pop();
  console.log(`📊 [${event}] ${customerId}: ${message}`);
}

// ═══════════════════════════════════════════════════════════════════
// PROCESSAMENTO DA FILA
// ═══════════════════════════════════════════════════════════════════

async function processNextInQueue() {
  if (isProcessingLock) {
    console.log('🔒 Processamento já em andamento (lock ativo)');
    return;
  }

  if (currentJob) {
    console.log('⏳ Job atual ainda processando:', currentJob.customer_id);
    return;
  }

  if (queue.length === 0) {
    return;
  }

  isProcessingLock = true;

  try {
    const job = queue.shift();
    currentJob = job;

    console.log(`🎯 Processando lead: ${job.customer_id} (fila: ${queue.length})`);
    logActivity('job_started', job.customer_id, 'Automação iniciada - navegador aberto no iGreen');

    await executarAutomacao(job.customer_id, supabase);

    console.log(`✅ Lead processado: ${job.customer_id}`);
    logActivity('job_finished', job.customer_id, 'Finalizar clicado - página iGreen deixada aberta');

    recentlyProcessed.add(job.customer_id);
    setTimeout(() => recentlyProcessed.delete(job.customer_id), 5 * 60 * 1000);

    retryTracker.delete(job.customer_id);

  } catch (error) {
    const customerId = currentJob?.customer_id || 'unknown';
    console.error(`❌ Erro ao processar lead ${customerId}:`, error.message);

    const attempts = (retryTracker.get(customerId) || 0) + 1;
    retryTracker.set(customerId, attempts);

    if (attempts < 3) {
      const retryJob = { ...currentJob, retry: attempts };
      queue.unshift(retryJob);
      console.log(`🔄 Re-enfileirado para retry (${attempts}/3): ${customerId}`);
      logActivity('job_retry', customerId, `Falha (${attempts}/3): ${error.message}`);
    } else {
      console.error(`❌ Lead falhou após 3 tentativas: ${customerId}`);
      logActivity('job_failed', customerId, `Falha definitiva após 3 tentativas: ${error.message}`);

      if (supabase) {
        await supabase
          .from('customers')
          .update({
            status: 'automation_failed',
            error_message: `Tentativa ${attempts}/3: ${error.message}`,
          })
          .eq('id', customerId);
      }

      retryTracker.delete(customerId);
    }
  } finally {
    currentJob = null;
    isProcessingLock = false;

    if (queue.length > 0) {
      setTimeout(() => processNextInQueue(), 1000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-RECUPERAÇÃO DE LEADS PENDENTES
// ═══════════════════════════════════════════════════════════════════

async function recuperarLeadsPendentes() {
  if (currentJob || isProcessingLock) {
    return;
  }

  if (!supabase) {
    return;
  }

  try {
    const { data: leadsCompletos } = await supabase
      .from('customers')
      .select('id, name, updated_at')
      .eq('status', 'data_complete')
      .order('updated_at', { ascending: true })
      .limit(5);

    const doisMinutosAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: leadsTravados } = await supabase
      .from('customers')
      .select('id, name, updated_at')
      .eq('status', 'portal_submitting')
      .lt('updated_at', doisMinutosAtras)
      .order('updated_at', { ascending: true })
      .limit(3);

    // AUTO-RETRY: leads que falharam há mais de 10 minutos (max 2 retries automáticos)
    const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: leadsFalhados } = await supabase
      .from('customers')
      .select('id, name, updated_at')
      .in('status', ['automation_failed', 'worker_offline'])
      .lt('updated_at', dezMinutosAtras)
      .order('updated_at', { ascending: true })
      .limit(2);

    // Reset status dos leads falhados para portal_submitting antes de re-enfileirar
    for (const lead of (leadsFalhados || [])) {
      if ((retryTracker.get(lead.id) || 0) < 3) {
        await supabase.from('customers').update({ status: 'portal_submitting', error_message: null }).eq('id', lead.id);
        console.log(`♻️ Auto-retry: resetando status de ${lead.name} (${lead.id})`);
      }
    }

    const todosLeads = [...(leadsCompletos || []), ...(leadsTravados || []), ...(leadsFalhados || [])];

    for (const lead of todosLeads) {
      const customerId = lead.id;

      if (queue.some(j => j.customer_id === customerId)) continue;
      if (currentJob?.customer_id === customerId) continue;
      if (recentlyProcessed.has(customerId)) continue;
      if ((retryTracker.get(customerId) || 0) >= 3) continue;

      queue.push({ customer_id: customerId, addedAt: new Date().toISOString() });
      console.log(`📥 Lead recuperado: ${lead.name} (${customerId})`);
      logActivity('lead_recovered', customerId, `Lead pendente adicionado na fila`);

      processNextInQueue();
    }
  } catch (error) {
    console.error('⚠️ Erro ao recuperar leads pendentes:', error.message);
  }
}

setInterval(recuperarLeadsPendentes, 5 * 1000);

// ═══════════════════════════════════════════════════════════════════
// SERVIDOR HTTP
// ═══════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const sendJSON = (data, status = 200) => {
    res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });

  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // ─── POST /submit-lead ───────────────────────────────────────
  if (path === '/submit-lead' && req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${WORKER_SECRET}`) {
      return sendJSON({ error: 'Unauthorized' }, 401);
    }

    const body = await readBody();
    const customerId = body.customer_id;

    if (!customerId) {
      return sendJSON({ error: 'customer_id required' }, 400);
    }

    if (queue.some(j => j.customer_id === customerId)) {
      return sendJSON({ success: false, message: 'Lead já está na fila', duplicate: true });
    }

    if (currentJob?.customer_id === customerId) {
      return sendJSON({ success: false, message: 'Lead está sendo processado agora', duplicate: true });
    }

    if (recentlyProcessed.has(customerId)) {
      return sendJSON({ success: false, message: 'Lead foi processado recentemente (cooldown 5 min)', duplicate: true });
    }

    if ((retryTracker.get(customerId) || 0) >= 3) {
      return sendJSON({ success: false, message: 'Lead já falhou 3 vezes', duplicate: true });
    }

    queue.push({ customer_id: customerId, addedAt: new Date().toISOString() });
    logActivity('lead_received', customerId, 'Lead adicionado à fila (WhatsApp finalizou cadastro)');

    if (supabase) {
      await supabase
        .from('customers')
        .update({ status: 'portal_submitting', updated_at: new Date().toISOString() })
        .eq('id', customerId);
    }

    processNextInQueue();

    return sendJSON({
      success: true,
      message: `Lead adicionado na fila (posição ${queue.length})`,
      customer_id: customerId,
      position: queue.length,
      duplicate: false,
      queue: {
        processing: currentJob?.customer_id || null,
        waiting: queue.length,
        totalProcessed: activities.filter(a => a.event === 'job_finished').length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ─── GET /health ─────────────────────────────────────────────
  if (path === '/health') {
    return sendJSON({
      status: 'ok',
      service: 'worker-portal',
      version: '5.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      supabaseConfigured: !!supabase,
      queue: {
        processed: activities.filter(a => a.event === 'job_finished').length,
        failed: activities.filter(a => a.event === 'job_failed').length,
        processing: currentJob ? 1 : 0,
        waiting: queue.length,
      },
      currentJob: currentJob ? {
        customer_id: currentJob.customer_id,
        startedAt: currentJob.addedAt,
      } : null,
    });
  }

  // ─── GET /queue ──────────────────────────────────────────────
  if (path === '/queue') {
    return sendJSON({
      currentJob: currentJob ? {
        customer_id: currentJob.customer_id,
        startedAt: currentJob.addedAt,
      } : null,
      queueLength: queue.length,
      waiting: queue.map((j, i) => ({
        position: i + 1,
        customer_id: j.customer_id,
        addedAt: j.addedAt,
      })),
      stats: {
        processed: activities.filter(a => a.event === 'job_finished').length,
        failed: activities.filter(a => a.event === 'job_failed').length,
        processing: currentJob ? 1 : 0,
        waiting: queue.length,
      },
    });
  }

  // ─── GET /status ─────────────────────────────────────────────
  if (path === '/status') {
    return sendJSON({
      timestamp: new Date().toISOString(),
      queue: {
        currentJob: currentJob ? {
          customer_id: currentJob.customer_id,
          startedAt: currentJob.addedAt,
        } : null,
        queueLength: queue.length,
        waiting: queue.map((j, i) => ({
          position: i + 1,
          customer_id: j.customer_id,
          addedAt: j.addedAt,
        })),
      },
      activities: activities.slice(0, 30),
    });
  }

  // ─── GET /dashboard ──────────────────────────────────────────
  if (path === '/dashboard') {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal Worker - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header h1 { font-size: 24px; color: #333; margin-bottom: 10px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: 500; }
    .status.ok { background: #d4edda; color: #155724; }
    .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { font-size: 18px; color: #333; margin-bottom: 15px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat { padding: 15px; background: #f8f9fa; border-radius: 6px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .activity { padding: 12px; border-left: 3px solid #007bff; background: #f8f9fa; margin-bottom: 10px; border-radius: 4px; }
    .activity-time { font-size: 12px; color: #666; }
    .activity-message { font-size: 14px; color: #333; margin-top: 4px; }
    .queue-item { padding: 12px; background: #fff3cd; border-left: 3px solid #ffc107; margin-bottom: 10px; border-radius: 4px; }
    .current-job { padding: 12px; background: #d1ecf1; border-left: 3px solid #17a2b8; margin-bottom: 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Portal Worker - Dashboard</h1>
      <span class="status ok">● Online</span>
    </div>
    <div class="card">
      <h2>📊 Estatísticas</h2>
      <div class="stats">
        <div class="stat"><div class="stat-label">Processados</div><div class="stat-value" id="processed">0</div></div>
        <div class="stat"><div class="stat-label">Falhas</div><div class="stat-value" id="failed">0</div></div>
        <div class="stat"><div class="stat-label">Processando</div><div class="stat-value" id="processing">0</div></div>
        <div class="stat"><div class="stat-label">Na Fila</div><div class="stat-value" id="waiting">0</div></div>
      </div>
    </div>
    <div class="card">
      <h2>⏳ Fila de Processamento</h2>
      <div id="queue-container"></div>
    </div>
    <div class="card">
      <h2>📋 Últimas Atividades</h2>
      <div id="activities-container"></div>
    </div>
  </div>
  <script>
    async function updateDashboard() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        const processed = data.activities.filter(a => a.event === 'job_finished').length;
        const failed = data.activities.filter(a => a.event === 'job_failed').length;
        const processing = data.queue.currentJob ? 1 : 0;
        const waiting = data.queue.queueLength;
        document.getElementById('processed').textContent = processed;
        document.getElementById('failed').textContent = failed;
        document.getElementById('processing').textContent = processing;
        document.getElementById('waiting').textContent = waiting;
        const queueContainer = document.getElementById('queue-container');
        if (data.queue.currentJob) {
          queueContainer.innerHTML = '<div class="current-job"><strong>🎯 Processando agora:</strong> ' + data.queue.currentJob.customer_id + '</div>';
        } else {
          queueContainer.innerHTML = '<p style="color: #666;">Nenhum job processando</p>';
        }
        if (data.queue.waiting && data.queue.waiting.length > 0) {
          queueContainer.innerHTML += data.queue.waiting.map(j => '<div class="queue-item"><strong>Posição ' + j.position + ':</strong> ' + j.customer_id + '</div>').join('');
        }
        const activitiesContainer = document.getElementById('activities-container');
        if (data.activities && data.activities.length > 0) {
          activitiesContainer.innerHTML = data.activities.slice(0, 25).map(a => '<div class="activity"><div class="activity-time">' + new Date(a.at).toLocaleString('pt-BR') + '</div><div class="activity-message"><strong>[' + a.event + ']</strong> ' + a.message + '</div></div>').join('');
        } else {
          activitiesContainer.innerHTML = '<p style="color: #666;">Nenhuma atividade recente</p>';
        }
      } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
      }
    }
    updateDashboard();
    setInterval(updateDashboard, 3000);
  </script>
</body>
</html>`;

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ─── 404 ─────────────────────────────────────────────────────
  res.writeHead(404, corsHeaders);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🚀 Worker Portal iniciado na porta ${PORT}`);
  console.log(`📊 Dashboard disponível em http://localhost:${PORT}/dashboard`);
  console.log(`🔄 Polling de leads pendentes ativado (5s)`);
});
