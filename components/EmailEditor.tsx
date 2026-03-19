'use client';

import React, { useRef, useState } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';

interface EmailEditorComponentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: { html: string; design: any; subject: string; title: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData?: { design: any; subject: string; title: string };
}

const ProfessionalEmailEditor: React.FC<EmailEditorComponentProps> = ({ onSave, initialData }) => {
  const emailEditorRef = useRef<EditorRef>(null);
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [title, setTitle] = useState(initialData?.title || '');

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
    // Escuchar cambios para autosave si se desea en el futuro
    // unlayer.addEventListener('design:updated', (data) => { ... })
    
    if (initialData?.design) {
      const design = typeof initialData.design === 'string' 
        ? JSON.parse(initialData.design) 
        : initialData.design;
      unlayer.loadDesign(design);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      {/* Header del Editor */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex gap-4 flex-1 max-w-2xl">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Título de la Campaña</label>
            <input
              type="text"
              placeholder="Ej: Promo Verano 2024"
              className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Asunto del Correo</label>
            <input
              type="text"
              placeholder="Ej: ¡No te pierdas estas ofertas!"
              className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        </div>
        
        <div className="ml-4">
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
            }
          }}
        />
      </div>
    </div>
  );
};

export default ProfessionalEmailEditor;
