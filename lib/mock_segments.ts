export interface MockSegment {
  id: string;
  name: string;
  type: 'dynamic' | 'static';
  filters: {
    status?: string;
    source?: string;
    project?: string;
    interest?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    advancedFilters?: Array<{ column: string; operator: string; value: string }>;
    activity?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    ids?: string[]; // Para listas estáticas
  };
  created_at: string;
}

/**
 * Lista fija del sistema: toda la base de contactos enviables.
 * No lleva ningún filtro, así que el motor de envío sólo aplica sus exclusiones
 * de siempre (correo presente, sintaxis válida y emailEnabled distinto de FALSE,
 * que es como quedan marcados los rebotados). Es dinámica: cada envío la recalcula.
 */
export const ALL_CONTACTS_SEGMENT_ID = 'seg-all';

export const ALL_CONTACTS_SEGMENT: MockSegment = {
  id: ALL_CONTACTS_SEGMENT_ID,
  name: 'Todos los contactos (Base completa)',
  type: 'dynamic',
  filters: {},
  created_at: new Date(0).toISOString()
};

export const MOCK_SEGMENTS: MockSegment[] = [
  {
    id: 'seg-1',
    name: 'Leads de Facebook Nuevos (Dinámico)',
    type: 'dynamic',
    filters: {
      status: 'Nuevo',
      source: 'META'
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
  },
  {
    id: 'seg-2',
    name: 'Contactos Interesados de la Web (Dinámico)',
    type: 'dynamic',
    filters: {
      source: 'Sitio Web',
      interest: 'INTERESADO',
      activity: 'web_subscription'
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString()
  },
  {
    id: 'seg-3',
    name: 'Instantánea de Visitas (Estático)',
    type: 'static',
    filters: {
      ids: ['2', '3'] // Corresponde a María López y Carlos Valenzuela de MOCK_LEADS
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
  }
];
