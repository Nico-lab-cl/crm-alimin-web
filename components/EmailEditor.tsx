'use client';

import React, { useRef, useState } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';
import { useRouter } from 'next/navigation';

interface EmailEditorComponentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: { html: string; design: any; subject: string; title: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData?: { design: any; subject: string; title: string; isDraft?: boolean };
  campaignId?: string;
}

const ProfessionalEmailEditor: React.FC<EmailEditorComponentProps> = ({ onSave, initialData, campaignId }) => {
  const emailEditorRef = useRef<EditorRef>(null);
  const router = useRouter();
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [title, setTitle] = useState(initialData?.title || '');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const getStorageKey = () => `campaign_draft_${campaignId || 'new'}`;

  const saveDraftToLocal = () => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlayer.saveDesign((design: any) => {
      const draft = {
        design,
        subject,
        title,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(getStorageKey(), JSON.stringify(draft));
      setLastSaved(new Date());
    });
  };

  const exportHtml = () => {
    const unlayer = emailEditorRef.current?.editor;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlayer?.exportHtml((data: any) => {
      const { design, html } = data;
      onSave({ html, design, subject, title });
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onReady = (unlayer: any) => {
    unlayer.addEventListener('design:updated', () => {
      // Debounce autosave slightly
      setTimeout(saveDraftToLocal, 1000);
    });
    
    // Si viene de un borrador local o data inicial
    if (initialData?.design) {
      const design = typeof initialData.design === 'string' 
        ? JSON.parse(initialData.design) 
        : initialData.design;
      unlayer.loadDesign(design);
      if (initialData.isDraft) {
        setSubject(initialData.subject || '');
        setTitle(initialData.title || '');
      }
    } else {
      // Intentar cargar borrador si es nuevo y no hay data inicial
      const localDraftStr = localStorage.getItem(getStorageKey());
      if (localDraftStr && !campaignId) {
        try {
          const draft = JSON.parse(localDraftStr);
          if (confirm('Se ha encontrado un borrador no guardado. ¿Deseas restaurarlo?')) {
            if (draft.design) unlayer.loadDesign(draft.design);
            if (draft.subject) setSubject(draft.subject);
            if (draft.title) setTitle(draft.title);
          } else {
            localStorage.removeItem(getStorageKey());
          }
        } catch (e) {
            console.error(e)
        }
      }
    }
  };

  const handleBack = () => {
    if (window.confirm('¿Deseas guardar tu progreso como borrador para continuar más tarde?')) {
      saveDraftToLocal();
      router.push('/');
    } else {
      if (window.confirm('¿Estás seguro de salir sin guardar? Se pederán tus cambios no guardados.')) {
        localStorage.removeItem(getStorageKey());
        router.push('/');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      {/* Header del Editor */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex gap-4 flex-1 max-w-2xl items-center">
          <button 
            onClick={handleBack}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors mr-2 flex-shrink-0"
            title="Volver al inicio"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 hover:text-white"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </button>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Título de la Campaña</label>
            <input
              type="text"
              placeholder="Ej: Promo Verano 2024"
              className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={title}
              onChange={(e) => {
                  setTitle(e.target.value);
                  setTimeout(saveDraftToLocal, 500); // Trigger auto-save on title change
              }}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Asunto del Correo</label>
            <input
              type="text"
              placeholder="Ej: ¡No te pierdas estas ofertas!"
              className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={subject}
              onChange={(e) => {
                  setSubject(e.target.value);
                  setTimeout(saveDraftToLocal, 500); // Trigger auto-save on subject change
              }}
            />
          </div>
        </div>
        
        <div className="ml-4 flex items-center gap-4">
          {lastSaved && (
              <span className="text-xs text-zinc-500 hidden sm:inline-block">
                  Autoguardado: {lastSaved.toLocaleTimeString()}
              </span>
          )}
          <button
            onClick={exportHtml}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            Guardar Plantilla
          </button>
        </div>
      </div>

      {/* Área del Editor */}
      <div className="flex-1 relative">
        <EmailEditor
          ref={emailEditorRef}
          onReady={onReady}
          minHeight="100%"
          appearance={{
            theme: 'dark',
            panels: {
              tools: {
                dock: 'left'
              }
            }
          }}
          options={{
            version: 'latest',
            locale: 'es-ES',
            appearance: {
              theme: 'dark'
            },
            features: {
              textEditor: {
                color: true,
                cleanPaste: true,
                emojis: true
              }
            }
          }}
        />
      </div>
    </div>
  );
};

export default ProfessionalEmailEditor;
