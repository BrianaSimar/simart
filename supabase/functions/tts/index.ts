// =====================================================================
// Simart · Función "tts": genera voz natural con IA para las lecciones.
//
// - Solo responde a usuarios con sesión iniciada (protege tu clave).
// - Guarda cada audio en Storage (bucket "tts-cache"): la misma palabra
//   con la misma voz solo se genera una vez para todos los usuarios.
// - Proveedor: OpenAI (modelo gpt-4o-mini-tts), que acepta instrucciones
//   de estilo para dar a cada voz su carácter.
//
// Secretos (Edge Functions → Secrets):
//   OPENAI_API_KEY        tu clave de OpenAI (voces Atlas y Vela)
//   ELEVENLABS_API_KEY    opcional: tu clave de ElevenLabs
//   ELEVENLABS_VOICE_ID   opcional: el ID de tu voz clonada. Si están los
//                         dos, la guía en español usa tu propia voz.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone
// Supabase automáticamente.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Voces originales de Simart. Cada una combina una voz base con
// instrucciones de interpretación.
const VOICES: Record<string, { voice: string; style: string }> = {
  male: {
    voice: 'onyx',
    style:
      'Voice: a deep, warm, resonant baritone with a rich low register. ' +
      'Tone: calm, wise and reassuring, like a seasoned documentary narrator. ' +
      'Pacing: unhurried, with natural pauses. Never nasal, never robotic. ' +
      'Diction: every sound crisp and easy to imitate for a language learner.'
  },
  female: {
    voice: 'sage',
    style:
      'Voice: a refined, elegant female voice in a low-to-mid register, velvety and composed. ' +
      'Tone: warm, poised and intelligent, gently encouraging. ' +
      'Pacing: measured and smooth. Never shrill, never robotic. ' +
      'Diction: precise and clear, ideal for a language learner to imitate.'
  }
};

const ACCENTS: Record<string, string> = {
  'en': 'Speak in a natural General American (United States) accent.',
  'fr': 'Speak in natural standard French from France.',
  'es-LA': 'Read this as a Latin American Spanish speaker would read it aloud, with Latin American pronunciation (no Castilian "z" sound). It may be a single syllable: pronounce it exactly as written in Spanish.',
  'es-ES': 'Read this as a Spanish speaker from Spain would read it aloud. It may be a single syllable: pronounce it exactly as written in Spanish.',
  'pt': 'Read this as a Brazilian Portuguese speaker would read it aloud. It may be a single syllable.',
  'it': 'Read this as an Italian speaker would read it aloud. It may be a single syllable.'
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  // 1. Solo usuarios con sesión.
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: 'Inicia sesión para usar las voces naturales' });

  // 2. Validar la petición.
  let body: { text?: string; voice?: string; accent?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'JSON no válido' }); }
  const text = (body.text ?? '').trim();
  const persona = VOICES[body.voice ?? ''] ? body.voice! : 'female';
  const accent = ACCENTS[body.accent ?? ''] ? body.accent! : 'en';
  if (!text || text.length > 400) return json(400, { error: 'El texto debe tener entre 1 y 400 caracteres' });

  // La guía en español (sílabas en la lengua materna) usa la voz clonada si está configurada.
  const elKey = Deno.env.get('ELEVENLABS_API_KEY');
  const elVoice = Deno.env.get('ELEVENLABS_VOICE_ID');
  const useOwnVoice = !!(elKey && elVoice && accent.startsWith('es-'));

  // 3. Buscar en la caché.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const key = useOwnVoice
    ? `v1/own-${elVoice}/${accent}/${await sha256(text)}.mp3`
    : `v1/${persona}/${accent}/${await sha256(text)}.mp3`;
  const cached = await admin.storage.from('tts-cache').download(key);
  if (cached.data) {
    return new Response(cached.data, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }

  // 4. Generar con IA.
  let ai: Response;
  if (useOwnVoice) {
    ai = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elVoice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': elKey!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true }
      })
    });
  } else {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json(500, { error: 'Falta el secreto OPENAI_API_KEY' });
    const v = VOICES[persona];
    ai = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: v.voice,
        input: text,
        instructions: `${v.style} ${ACCENTS[accent]}`,
        response_format: 'mp3'
      })
    });
  }
  if (!ai.ok) return json(502, { error: 'El servicio de voz no respondió', detail: (await ai.text()).slice(0, 300) });
  const audio = new Uint8Array(await ai.arrayBuffer());

  // 5. Guardar en caché (si falla, se devuelve el audio igualmente).
  await admin.storage.from('tts-cache').upload(key, audio, { contentType: 'audio/mpeg', upsert: true });

  return new Response(audio, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
});
