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
