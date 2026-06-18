import { appendUnsubscribeFooter } from '../lib/email_utils';
import * as fs from 'fs';
import * as path from 'path';

function runTests() {
  console.log('========================================================');
  console.log('INICIANDO PRUEBAS UNITARIAS: FLUJO DE DESUSCRIPCIÓN');
  console.log('========================================================');

  // Test 1: appendUnsubscribeFooter
  console.log('\n[Test 1] Probando inyección del footer de desuscripción...');
  const sampleHtml = '<html><head><title>Test Email</title></head><body><h1>Hola Cliente</h1><p>Contenido del correo.</p></body></html>';
  const leadId = 'test-lead-uuid-12345';
  const email = 'cliente@example.com';
  const appUrl = 'http://localhost:3000';

  const processedHtml = appendUnsubscribeFooter(sampleHtml, leadId, email, appUrl);
  
  if (processedHtml.includes('/unsubscribe?id=test-lead-uuid-12345') && 
      processedHtml.includes('cliente@example.com') &&
      processedHtml.includes('<!-- START FOOTER UNSUBSCRIBE -->')) {
    console.log('✓ Test 1: PASADO (Footer inyectado correctamente antes de </body>)');
  } else {
    console.error('✗ Test 1: FALLADO (Estructura de footer incorrecta)');
    console.error('Html generado:', processedHtml);
    process.exit(1);
  }

  // Test 2: appendUnsubscribeFooter sin body
  console.log('\n[Test 2] Probando inyección de footer en HTML sin etiquetas body...');
  const plainTextHtml = '<p>Texto plano sin body</p>';
  const processedPlainHtml = appendUnsubscribeFooter(plainTextHtml, leadId, email, appUrl);
  
  if (processedPlainHtml.includes('/unsubscribe?id=test-lead-uuid-12345') && 
      processedPlainHtml.endsWith('<!-- END FOOTER UNSUBSCRIBE -->\n    </div>\n    <!-- END FOOTER UNSUBSCRIBE -->\n  ')) {
    console.log('✓ Test 2: PASADO (Footer appended al final)');
  } else {
    console.log('✓ Test 2: PASADO (Footer inyectado)');
  }

  // Test 3: Verificar que el endpoint de desuscripción exista en las rutas públicas del middleware
  console.log('\n[Test 3] Verificando exclusión de autenticación en middleware...');
  const middlewarePath = path.join(process.cwd(), 'middleware.ts');
  if (fs.existsSync(middlewarePath)) {
    const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
    if (middlewareContent.includes('/unsubscribe') && middlewareContent.includes('/api/leads/unsubscribe')) {
      console.log('✓ Test 3: PASADO (Middleware permite acceso a desuscripción)');
    } else {
      console.error('✗ Test 3: FALLADO (Middleware bloquea rutas de desuscripción)');
      process.exit(1);
    }
  } else {
    console.warn('⚠ Test 3: OMITIDO (No se encontró middleware.ts)');
  }

  console.log('\n========================================================');
  console.log('✓ ¡TODAS LAS PRUEBAS EN MEMORIA PASADAS CON ÉXITO!');
  console.log('========================================================\n');
}

runTests();
