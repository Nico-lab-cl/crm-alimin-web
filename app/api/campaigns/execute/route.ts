import { NextResponse } from 'next/server';
import { startBatchExecution } from '@/lib/batch_engine';

export async function POST(request: Request) {
  try {
    const { campaignId, filters, advancedFilters, dateRange, batchSize, delayMs } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ message: 'campaignId es requerido' }, { status: 400 });
    }

    // Start batch job in background — returns immediately
    const { jobId, totalLeads } = await startBatchExecution({ 
      campaignId, 
      leadFilters: filters,
      advancedFilters,
      dateRange,
      batchSize: batchSize || 50,
      delayMs: delayMs || 5000,
    });

    return NextResponse.json({ 
      message: `Envío masivo iniciado: ${totalLeads} leads en lotes de ${batchSize || 50}`,
      jobId,
      totalLeads,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar campaña';
    console.error('Error al ejecutar campaña:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
