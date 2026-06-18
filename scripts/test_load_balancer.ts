import { mainDb, marketingDb } from '../lib/db';
import { executeCampaign } from '../lib/sending_engine';
import { startBatchExecution, getJob } from '../lib/batch_engine';

// Define process.env values for test
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.N8N_WEBHOOK_URL = 'http://localhost:5678/webhook-test';

// Store webhook posts to verify load balancing
const webhookPosts: any[] = [];
global.fetch = async (url: any, options: any) => {
  if (url === process.env.N8N_WEBHOOK_URL) {
    webhookPosts.push(JSON.parse(options.body));
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true })
  } as any;
};

// Overwrite DB pool query methods to mock database access
const mockLeads = Array.from({ length: 15 }, (_, i) => ({
  id: `lead-id-${i}`,
  email: `lead${i}@alimin-test.cl`,
  firstname: `Name ${i}`,
  lastname: `LastName ${i}`,
  status: 'Nuevo',
  createdat: new Date()
}));

mainDb.query = (async (text: any, params?: any[]) => {
  // Discover columns
  if (text.includes('information_schema.columns')) {
    return {
      rowCount: 6,
      rows: [
        { column_name: 'id' },
        { column_name: 'email' },
        { column_name: 'firstname' },
        { column_name: 'lastname' },
        { column_name: 'status' },
        { column_name: 'createdat' },
        { column_name: 'emailEnabled' }
      ]
    } as any;
  }
  
  // Select leads query
  if (text.includes('SELECT DISTINCT ON')) {
    return {
      rowCount: mockLeads.length,
      rows: mockLeads
    } as any;
  }

  // Get lead details
  if (text.includes('SELECT * FROM "Lead" WHERE id =')) {
    const leadId = params?.[0];
    const lead = mockLeads.find(l => l.id === leadId);
    return {
      rowCount: lead ? 1 : 0,
      rows: lead ? [lead] : []
    } as any;
  }

  return { rowCount: 0, rows: [] } as any;
}) as any;

marketingDb.query = (async (text: any, params?: any[]) => {
  // Campaign lookup
  if (text.includes('SELECT * FROM campaigns WHERE id =')) {
    return {
      rowCount: 1,
      rows: [{
        id: params?.[0],
        title: 'Campaña de Prueba Balanceador',
        subject: 'Descubre nuestros terrenos frente al mar',
        html_content: '<html><body><h1>Hola</h1><a href="https://aliminspa.cl/propiedad1">Ver terreno</a></body></html>',
        mjml_content: '<mjml></mjml>',
        is_automation: false
      }]
    } as any;
  }

  // Sent count query
  if (text.includes('SELECT COUNT(*) as count FROM campaign_logs')) {
    return {
      rowCount: 1,
      rows: [{ count: '0' }]
    } as any;
  }

  // Campaign exclusion list query
  if (text.includes('SELECT email FROM campaign_logs')) {
    return {
      rowCount: 0,
      rows: []
    } as any;
  }

  // Insert campaign logs
  if (text.includes('INSERT INTO campaign_logs')) {
    return {
      rowCount: 1,
      rows: [{ id: 'mock-log-uuid-123' }]
    } as any;
  }

  // Insert notifications or updates
  return { rowCount: 1, rows: [{ id: 1 }] } as any;
}) as any;

// Bypass individual sending delays (e.g. 2000ms) in test execution
const originalSetTimeout = global.setTimeout;
global.setTimeout = ((cb: any, ms: number, ...args: any[]) => {
  if (ms === 2000) ms = 0;
  return originalSetTimeout(cb, ms, ...args);
}) as any;

async function runTests() {
  console.log('========================================================');
  console.log('INICIANDO PRUEBAS UNITARIAS: BALANCEADOR DE CARGA');
  console.log('========================================================');

  // Test 1: executeCampaign (sending_engine)
  console.log('\n[Test 1] Ejecutando executeCampaign...');
  webhookPosts.length = 0; // Reset posts

  const result = await executeCampaign({
    campaignId: 'c7c88b42-a6d4-4827-9c6f-375ba8adcdd8'
  });

  console.log(`Leads procesados: ${result.processed}`);
  console.log(`Llamadas a webhook registradas: ${webhookPosts.length}`);

  if (webhookPosts.length !== mockLeads.length) {
    console.error(`✗ Test 1: FALLADO. Se esperaban ${mockLeads.length} envíos pero se registraron ${webhookPosts.length}`);
    process.exit(1);
  }

  // Verify sequential distribution (0, 1, 2, 3, 4, 0, 1...)
  let test1Passed = true;
  for (let i = 0; i < webhookPosts.length; i++) {
    const post = webhookPosts[i];
    const expectedIndex = i % 5;
    if (post.senderIndex !== expectedIndex) {
      console.error(`✗ Test 1: FALLADO en lead ${i}. Esperaba senderIndex ${expectedIndex}, obtuvo ${post.senderIndex}`);
      test1Passed = false;
      break;
    }
    if (post.senderName !== 'Alimin Inmobiliaria') {
      console.error(`✗ Test 1: FALLADO. Nombre de remitente incorrecto: ${post.senderName}`);
      test1Passed = false;
      break;
    }
  }

  if (test1Passed) {
    console.log('✓ Test 1: PASADO (Reparto de indices 0-4 secuencial en campaña estándar)');
  } else {
    process.exit(1);
  }

  // Test 2: processBatches (batch_engine)
  console.log('\n[Test 2] Ejecutando processBatches...');
  webhookPosts.length = 0; // Reset posts

  const batchResult = await startBatchExecution({
    campaignId: 'c7c88b42-a6d4-4827-9c6f-375ba8adcdd8',
    batchSize: 5,
    delayMs: 10
  });

  console.log(`Trabajo en lote iniciado. ID: ${batchResult.jobId}, Envíos planeados: ${batchResult.willSend}`);

  // Wait for background execution to complete
  let job = getJob(batchResult.jobId);
  while (job && job.status === 'RUNNING') {
    await new Promise(resolve => setTimeout(resolve, 50));
    job = getJob(batchResult.jobId);
  }

  console.log(`Estado del trabajo finalizado: ${job?.status}`);
  console.log(`Llamadas a webhook registradas en lote: ${webhookPosts.length}`);

  if (webhookPosts.length !== mockLeads.length) {
    console.error(`✗ Test 2: FALLADO. Se esperaban ${mockLeads.length} envíos pero se registraron ${webhookPosts.length}`);
    process.exit(1);
  }

  // Verify sequential distribution (0, 1, 2, 3, 4, 0, 1...)
  let test2Passed = true;
  for (let i = 0; i < webhookPosts.length; i++) {
    const post = webhookPosts[i];
    const expectedIndex = i % 5;
    if (post.senderIndex !== expectedIndex) {
      console.error(`✗ Test 2: FALLADO en lead ${i}. Esperaba senderIndex ${expectedIndex}, obtuvo ${post.senderIndex}`);
      test2Passed = false;
      break;
    }
    if (post.senderName !== 'Alimin Inmobiliaria') {
      console.error(`✗ Test 2: FALLADO. Nombre de remitente incorrecto: ${post.senderName}`);
      test2Passed = false;
      break;
    }
  }

  if (test2Passed) {
    console.log('✓ Test 2: PASADO (Reparto de indices 0-4 secuencial en campaña por lotes en segundo plano)');
  } else {
    process.exit(1);
  }

  console.log('\n========================================================');
  console.log('✓ ¡TODAS LAS PRUEBAS DE BALANCEADOR DE CARGA PASADAS!');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('Error durante la ejecución del test:', err);
  process.exit(1);
});
