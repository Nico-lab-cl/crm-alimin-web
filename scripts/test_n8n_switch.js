const fs = require('fs');
const path = require('path');

// 1. Cargar .env.local para obtener el webhook de n8n
const envPath = path.join(__dirname, '..', '.env.local');
let n8nWebhookUrl = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^N8N_WEBHOOK_URL\s*=\s*(.+)$/m);
  if (match) {
    n8nWebhookUrl = match[1].trim();
  }
}

if (!n8nWebhookUrl) {
  console.error('❌ Error: No se encontró N8N_WEBHOOK_URL en el archivo .env.local');
  process.exit(1);
}

// 2. Determinar argumentos de CLI
// Uso: node scripts/test_n8n_switch.js [senderIndex] [prod]
// Si senderIndex no se especifica, enviará los 5 (0 a 4).
// Si se agrega el argumento "prod", se usará el webhook de producción.
// Por defecto se usa el webhook de prueba (-test) para que n8n lo escuche en vivo en el editor.
const args = process.argv.slice(2);
const senderIndexArg = args[0] !== undefined && !isNaN(args[0]) ? parseInt(args[0], 10) : null;
const isProd = args.includes('prod');

let targetUrl = n8nWebhookUrl;
if (!isProd) {
  // Convertir URL de producción a URL de pruebas (/webhook/ -> /webhook-test/)
  targetUrl = n8nWebhookUrl.replace('/webhook/', '/webhook-test/');
}

console.log('========================================================');
console.log('🧪 PROBADOR DE SWITCH BALANCEADOR DE n8n');
console.log('========================================================');
console.log(`URL Destino: ${targetUrl}`);
console.log(`Modo: ${isProd ? 'PRODUCCIÓN (Flujo activo)' : 'PRUEBA (Editor n8n "Listen for test event")'}`);
console.log('========================================================\n');

async function sendRequest(senderIndex) {
  const payload = {
    email: 'nicolas.cab.v@gmail.com',
    subject: `Prueba Balanceo Cuenta ${senderIndex} 🎁`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #2d544c;">Prueba de Envío Balanceado</h2>
        <p>Este correo de prueba fue enviado para validar la cuenta con <strong>senderIndex: ${senderIndex}</strong>.</p>
        <p style="font-size: 12px; color: #666;">Destinatario: nicolas.cab.v@gmail.com</p>
      </div>
    `,
    senderIndex: senderIndex,
    senderName: "Alimin Inmobiliaria",
    title: "Campaña de Prueba Balanceador",
    log_id: "test-log-uuid-000000"
  };

  console.log(`📤 Enviando POST para senderIndex: ${senderIndex}...`);
  
  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✅ ¡Éxito! HTTP ${response.status} recibido para senderIndex: ${senderIndex}`);
    } else {
      console.error(`❌ Falló con HTTP ${response.status} para senderIndex: ${senderIndex}`);
      const text = await response.text();
      console.error(`Detalle: ${text}`);
    }
  } catch (err) {
    console.error(`❌ Error al conectar con n8n para senderIndex: ${senderIndex}:`, err.message);
  }
}

async function run() {
  if (senderIndexArg !== null) {
    if (senderIndexArg < 0 || senderIndexArg > 4) {
      console.error('❌ Error: El senderIndex debe estar entre 0 y 4.');
      process.exit(1);
    }
    await sendRequest(senderIndexArg);
  } else {
    console.log('Enviando los 5 índices (0 al 4) secuencialmente con 3 segundos de pausa...');
    for (let i = 0; i < 5; i++) {
      await sendRequest(i);
      if (i < 4) {
        console.log('Esperando 3 segundos antes del siguiente envío...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  console.log('\nPruebas finalizadas.');
}

run();
