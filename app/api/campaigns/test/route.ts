import { NextResponse } from 'next/server';
import { sendTestCampaign } from '@/lib/sending_engine';

export async function POST(request: Request) {
  try {
    const { campaignId, email } = await request.json();

    if (!campaignId || !email) {
      return NextResponse.json({ message: 'campaignId y email son requeridos' }, { status: 400 });
    }

    await sendTestCampaign(campaignId, email);

    return NextResponse.json({ 
      message: 'Correo de prueba enviado con éxito'
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al enviar prueba';
    console.error('Error al enviar prueba:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
