import { NextResponse } from 'next/server';
import { executeCampaign } from '@/lib/sending_engine';

export async function POST(request: Request) {
  try {
    const { campaignId, filters, advancedFilters, dateRange } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ message: 'campaignId es requerido' }, { status: 400 });
    }

    const result = await executeCampaign({ 
      campaignId, 
      leadFilters: filters,
      advancedFilters,
      dateRange
    });

    return NextResponse.json({ 
      message: 'Campaña iniciada con éxito',
      leads_processed: result.processed 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar campaña';
    console.error('Error al ejecutar campaña:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
