import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId') || '';
    
    // Filtros y paginación para la lista de logs
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all'; // all, real, test
    const status = searchParams.get('status') || 'all'; // all, sent, opened, clicked
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // 1. Verificar esquema y conexión de la DB
    let dbConnected = false;
    let tables: string[] = [];

    try {
      const tableCheck = await queryMarketing(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      tables = tableCheck.rows.map(r => r.table_name.toLowerCase());
      dbConnected = tables.includes('campaign_logs') && tables.includes('campaigns');
      
      if (dbConnected) {
        // Asegurar que las columnas requeridas existan en campaign_logs
        const columnsCheck = await queryMarketing(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'campaign_logs'
        `);
        const columns = columnsCheck.rows.map(r => r.column_name.toLowerCase());
        
        if (!columns.includes('clicks')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN clicks INTEGER DEFAULT 0');
          console.log('Added missing "clicks" column to campaign_logs table dynamically.');
        }
        if (!columns.includes('last_clicked_at')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN last_clicked_at TIMESTAMP WITH TIME ZONE');
          console.log('Added missing "last_clicked_at" column to campaign_logs table dynamically.');
        }
        if (!columns.includes('is_test')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN is_test BOOLEAN DEFAULT FALSE');
          console.log('Added missing "is_test" column to campaign_logs table dynamically.');
        }
        if (!columns.includes('opened_at')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN opened_at TIMESTAMP WITH TIME ZONE');
          console.log('Added missing "opened_at" column to campaign_logs table dynamically.');
        }
        if (!columns.includes('sent_at')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN sent_at TIMESTAMP WITH TIME ZONE');
          console.log('Added missing "sent_at" column to campaign_logs table dynamically.');
        }
        if (!columns.includes('last_callback_at')) {
          await queryMarketing('ALTER TABLE campaign_logs ADD COLUMN last_callback_at TIMESTAMP WITH TIME ZONE');
          console.log('Added missing "last_callback_at" column to campaign_logs table dynamically.');
        }
      }
    } catch (e) {
      console.warn('DB check failed in campaign metrics endpoint, running in offline/mock mode:', (e as Error).message);
    }

    // 2. Si no hay DB, retornar métricas simuladas
    if (!dbConnected) {
      const mockData = getMockCampaignMetrics(campaignId, search, type, status, startDate, endDate, page, limit);
      return NextResponse.json({
        success: true,
        ...mockData,
        isMock: true
      });
    }

    // 3. Obtener la lista de todas las campañas que tienen logs para poder seleccionarlas
    const campaignsRes = await queryMarketing(`
      SELECT DISTINCT c.id, c.title, c.subject, c.created_at
      FROM campaigns c
      INNER JOIN campaign_logs l ON l.campaign_id = c.id
      ORDER BY c.created_at DESC
    `);
    const campaignsList = campaignsRes.rows;

    let selectedCampaignId = campaignId;
    if (!selectedCampaignId && campaignsList.length > 0) {
      selectedCampaignId = campaignsList[0].id; // Tomar la más reciente por defecto
    }

    if (!selectedCampaignId) {
      // Intentar obtener cualquier campaña si no hay logs registrados aún
      const allCampaignsRes = await queryMarketing(`SELECT id, title, subject, created_at FROM campaigns ORDER BY created_at DESC LIMIT 10`);
      return NextResponse.json({
        success: true,
        campaigns: allCampaignsRes.rows,
        selectedCampaignId: allCampaignsRes.rows[0]?.id || '',
        real: { sent: 0, opened: 0, clicked: 0, clicksCount: 0 },
        test: { sent: 0, opened: 0, clicked: 0, clicksCount: 0 },
        logs: [],
        isMock: false
      });
    }

    // 4. Obtener métricas de la campaña seleccionada (reales)
    const realMetricsRes = await queryMarketing(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN opened_at IS NOT NULL OR status = 'OPENED' THEN 1 END) as total_opened,
        COUNT(CASE WHEN clicks > 0 OR last_clicked_at IS NOT NULL THEN 1 END) as total_clicked,
        COALESCE(SUM(clicks), 0) as total_clicks_count
      FROM campaign_logs
      WHERE campaign_id = $1 AND is_test = FALSE
    `, [selectedCampaignId]);
    const realMetrics = realMetricsRes.rows[0];

    // 5. Obtener métricas de la campaña seleccionada (pruebas)
    const testMetricsRes = await queryMarketing(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN opened_at IS NOT NULL OR status = 'OPENED' THEN 1 END) as total_opened,
        COUNT(CASE WHEN clicks > 0 OR last_clicked_at IS NOT NULL THEN 1 END) as total_clicked,
        COALESCE(SUM(clicks), 0) as total_clicks_count
      FROM campaign_logs
      WHERE campaign_id = $1 AND is_test = TRUE
    `, [selectedCampaignId]);
    const testMetrics = testMetricsRes.rows[0];

    // 6. Obtener logs filtrados, contados y paginados de la campaña seleccionada
    const logWhereClauses = ['campaign_id = $1'];
    const logParams: (string | number | Date)[] = [selectedCampaignId];

    if (search) {
      logParams.push(`%${search}%`);
      logWhereClauses.push(`email ILIKE $${logParams.length}`);
    }

    if (type === 'real') {
      logWhereClauses.push('is_test = FALSE');
    } else if (type === 'test') {
      logWhereClauses.push('is_test = TRUE');
    }

    if (status === 'sent') {
      logWhereClauses.push("status = 'SENT'");
    } else if (status === 'opened') {
      logWhereClauses.push("(opened_at IS NOT NULL OR status = 'OPENED')");
    } else if (status === 'clicked') {
      logWhereClauses.push("(clicks > 0 OR last_clicked_at IS NOT NULL)");
    }

    if (startDate) {
      logParams.push(new Date(startDate));
      logWhereClauses.push(`created_at >= $${logParams.length}`);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      logParams.push(end);
      logWhereClauses.push(`created_at <= $${logParams.length}`);
    }

    const logWhereStr = logWhereClauses.join(' AND ');

    // Conteo total de logs filtrados
    const countLogsRes = await queryMarketing(`
      SELECT COUNT(*) as total 
      FROM campaign_logs 
      WHERE ${logWhereStr}
    `, logParams);
    const totalLogsCount = parseInt(countLogsRes.rows[0].total, 10) || 0;

    // Agregar limit y offset
    logParams.push(limit, offset);
    const limitIdx = logParams.length - 1;
    const offsetIdx = logParams.length;

    const logsRes = await queryMarketing(`
      SELECT id, email, status, sent_at, opened_at, clicks, last_clicked_at, is_test, created_at
      FROM campaign_logs
      WHERE ${logWhereStr}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, logParams);
    const detailedLogs = logsRes.rows;

    return NextResponse.json({
      success: true,
      campaigns: campaignsList,
      selectedCampaignId,
      real: {
        sent: parseInt(realMetrics.total_sent, 10) || 0,
        opened: parseInt(realMetrics.total_opened, 10) || 0,
        clicked: parseInt(realMetrics.total_clicked, 10) || 0,
        clicksCount: parseInt(realMetrics.total_clicks_count, 10) || 0
      },
      test: {
        sent: parseInt(testMetrics.total_sent, 10) || 0,
        opened: parseInt(testMetrics.total_opened, 10) || 0,
        clicked: parseInt(testMetrics.total_clicked, 10) || 0,
        clicksCount: parseInt(testMetrics.total_clicks_count, 10) || 0
      },
      logs: detailedLogs,
      totalLogsCount,
      page,
      limit,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/campaigns/metrics:', error);
    return NextResponse.json(
      { success: false, message: 'Error al obtener métricas de campañas', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Generador de datos simulados
function getMockCampaignMetrics(
  campaignId: string,
  search: string,
  type: string,
  status: string,
  startDate: string,
  endDate: string,
  page: number,
  limit: number
) {
  const mockCampaigns = [
    { id: 'camp-1', title: 'CyberDay', subject: 'Cyberday Alimin: asegura tu terreno cerca del mar', created_at: '2026-05-27T10:00:00Z' },
    { id: 'camp-2', title: 'Lomas campaña dos', subject: 'Conoce Lomas del Mar, sus valores y detalles', created_at: '2026-05-15T10:00:00Z' },
    { id: 'camp-3', title: 'Arena y Sol segunda campaña', subject: 'Revisa una opción clara y conversa con nosotros', created_at: '2026-05-15T09:00:00Z' }
  ];

  const selectedId = campaignId || mockCampaigns[0].id;
  const isCyberDay = selectedId === 'camp-1';

  const real = isCyberDay ? {
    sent: 120,
    opened: 84,
    clicked: 32,
    clicksCount: 45
  } : {
    sent: 95,
    opened: 52,
    clicked: 18,
    clicksCount: 22
  };

  const test = isCyberDay ? {
    sent: 5,
    opened: 4,
    clicked: 2,
    clicksCount: 3
  } : {
    sent: 3,
    opened: 2,
    clicked: 1,
    clicksCount: 1
  };

  const baseDate = new Date();
  const mockLogs = [
    { id: 'log-1', email: 'nicolas.cab.v@gmail.com', status: 'OPENED', sent_at: new Date(baseDate.getTime() - 1000 * 60 * 15).toISOString(), opened_at: new Date(baseDate.getTime() - 1000 * 60 * 10).toISOString(), clicks: 2, last_clicked_at: new Date(baseDate.getTime() - 1000 * 60 * 8).toISOString(), is_test: true },
    { id: 'log-2', email: 'juan.perez@outlook.com', status: 'OPENED', sent_at: new Date(baseDate.getTime() - 1000 * 60 * 30).toISOString(), opened_at: new Date(baseDate.getTime() - 1000 * 60 * 25).toISOString(), clicks: 1, last_clicked_at: new Date(baseDate.getTime() - 1000 * 60 * 24).toISOString(), is_test: false },
    { id: 'log-3', email: 'maria.silva@gmail.com', status: 'SENT', sent_at: new Date(baseDate.getTime() - 1000 * 60 * 45).toISOString(), opened_at: null, clicks: 0, last_clicked_at: null, is_test: false },
    { id: 'log-4', email: 'jose.gomez@yahoo.com', status: 'OPENED', sent_at: new Date(baseDate.getTime() - 1000 * 60 * 60).toISOString(), opened_at: new Date(baseDate.getTime() - 1000 * 60 * 50).toISOString(), clicks: 3, last_clicked_at: new Date(baseDate.getTime() - 1000 * 60 * 48).toISOString(), is_test: false },
    { id: 'log-5', email: 'test.user@aliminspa.cl', status: 'TEST', sent_at: new Date(baseDate.getTime() - 1000 * 60 * 120).toISOString(), opened_at: null, clicks: 0, last_clicked_at: null, is_test: true }
  ];

  let filteredMock = [...mockLogs];
  
  if (search) {
    filteredMock = filteredMock.filter(l => l.email.toLowerCase().includes(search.toLowerCase()));
  }
  if (type === 'real') {
    filteredMock = filteredMock.filter(l => !l.is_test);
  } else if (type === 'test') {
    filteredMock = filteredMock.filter(l => l.is_test);
  }
  if (status === 'sent') {
    filteredMock = filteredMock.filter(l => l.status === 'SENT');
  } else if (status === 'opened') {
    filteredMock = filteredMock.filter(l => l.status === 'OPENED' || l.opened_at !== null);
  } else if (status === 'clicked') {
    filteredMock = filteredMock.filter(l => l.clicks > 0);
  }

  if (startDate) {
    const start = new Date(startDate).getTime();
    filteredMock = filteredMock.filter(l => new Date(l.sent_at).getTime() >= start);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const endTime = end.getTime();
    filteredMock = filteredMock.filter(l => new Date(l.sent_at).getTime() <= endTime);
  }

  const totalLogsCount = filteredMock.length;
  const offset = (page - 1) * limit;
  const paginatedLogs = filteredMock.slice(offset, offset + limit);

  return {
    campaigns: mockCampaigns,
    selectedCampaignId: selectedId,
    real,
    test,
    logs: paginatedLogs,
    totalLogsCount,
    page,
    limit
  };
}
