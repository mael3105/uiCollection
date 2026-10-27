// Valeurs publiques par nature : la sécurité repose sur la RLS Supabase.
// Servie depuis la machine (`npx serve site`), la page utilise la base locale (`npx supabase start`).
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const SUPABASE_URL = isLocal
  ? 'http://127.0.0.1:54321'
  : 'https://ytkeeziczwevsdmgsygw.supabase.co';
export const SUPABASE_ANON_KEY = isLocal
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0a2VlemljendldnNkbWdzeWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMDYzMTYsImV4cCI6MjEwODY4MjMxNn0.nq5RRmMCWNqPAFUq22Zn7EvOG61E1SXVsk8qrK_qN3s';
