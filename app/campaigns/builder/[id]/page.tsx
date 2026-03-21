'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const EmailEditor = dynamic(() => import('@/components/EmailEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="text-xl animate-pulse">Cargando Campaña...</div>
    </div>
  ),
});

export default function EditBuilderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const res = await fetch(`/api/campaigns/${params.id}`);
        if (res.ok) {
          const data = await res.json();
          // La DB devuelve mjml_content como string JSON
          setInitialData({
            title: data.title,
            subject: data.subject,
            design: data.mjml_content,
            isDraft: false // Para saber que viene de la DB y no del default vacío
          });
        } else {
          alert('No se pudo cargar la campaña');
          router.push('/');
        }
      } catch (error) {
        console.error(error);
        alert('Error de conexión');
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [params.id, router]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSave = async (data: { html: string; design: any; subject: string; title: string }) => {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          subject: data.subject,
          html_content: data.html,
          mjml_content: JSON.stringify(data.design)
        }),
      });

      if (res.ok) {
        // Limpiar caché local
        localStorage.removeItem(`campaign_draft_${params.id}`);
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="text-xl animate-pulse">Obteniendo datos...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <EmailEditor onSave={handleSave} initialData={initialData} campaignId={params.id} />
    </div>
  );
}
