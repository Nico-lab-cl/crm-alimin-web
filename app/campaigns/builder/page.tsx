'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Cargamos el editor dinámicamente para evitar problemas de SSR con GrapesJS
const EmailEditor = dynamic(() => import('@/components/EmailEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="text-xl animate-pulse">Cargando Editor de Plantillas...</div>
    </div>
  ),
});

export default function BuilderPage() {
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSave = async (data: { html: string; design: any; subject: string; title: string }) => {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          subject: data.subject,
          html_content: data.html,
          mjml_content: JSON.stringify(data.design)
        }),
      });

      if (res.ok) {
        localStorage.removeItem('campaign_draft_new');
        router.push('/');
        router.refresh();
      } else {
        const errorData = await res.json();
        alert('Error al guardar: ' + errorData.message);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar la campaña');
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <EmailEditor onSave={handleSave} />
    </div>
  );
}
