'use client';

import React, { useEffect, useRef, useState } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import gjsMjml from 'grapesjs-mjml';
import 'grapesjs/dist/css/grapes.min.css';

interface EmailEditorProps {
  onSave: (data: { html: string; mjml: string; subject: string; title: string }) => void;
  initialData?: { mjml: string; subject: string; title: string };
}

// Extender el tipo Editor para incluir métodos agregados por gjsMjml
interface MjmlEditor extends Editor {
  getMjml: () => string;
}

const EmailEditor: React.FC<EmailEditorProps> = ({ onSave, initialData }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState(initialData?.title || '');
  const [subject, setSubject] = useState(initialData?.subject || '');

  useEffect(() => {
    if (editorRef.current && !editor) {
      const e = grapesjs.init({
        container: editorRef.current,
        height: 'calc(100vh - 150px)',
        width: '100%',
        plugins: [gjsMjml],
        pluginsOpts: {
          'grapesjs-mjml': {
            // MJML options if any
          },
        },
        storageManager: false, // Manejamos el guardado manualmente
      });

      if (initialData?.mjml) {
        e.setComponents(initialData.mjml);
      }

      setEditor(e);
    }

    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor, initialData]);

  const handleSave = () => {
    if (!editor) return;

    const mjmlEditor = editor as MjmlEditor;
    const html = mjmlEditor.getHtml();
    const mjml = mjmlEditor.getMjml(); 

    onSave({ html, mjml, subject, title });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white font-sans">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 shadow-lg">
        <div className="flex space-x-4 flex-1 max-w-2xl">
          <input
            type="text"
            placeholder="Título de la Campaña"
            className="bg-zinc-800 border-zinc-700 text-white px-4 py-2 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="Asunto del Correo"
            className="bg-zinc-800 border-zinc-700 text-white px-4 py-2 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <button
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold shadow-lg transition-all ml-4"
        >
          Guardar Plantilla
        </button>
      </div>
      <div className="flex-1">
        <div ref={editorRef} />
      </div>
      <style jsx global>{`
        .gjs-cv-canvas {
          background-color: #18181b !important;
        }
        .gjs-one-bg {
          background-color: #18181b !important;
        }
        .gjs-two-color {
          color: #e4e4e7 !important;
        }
        .gjs-three-color {
          color: #a1a1aa !important;
        }
        .gjs-four-color {
          color: #6366f1 !important;
        }
      `}</style>
    </div>
  );
};

export default EmailEditor;
