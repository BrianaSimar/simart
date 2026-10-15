// =====================================================================
// Simart · Función "tts": genera voz natural con IA para las lecciones.
//
// - Solo responde a usuarios con sesión iniciada (protege tus claves).
// - Guarda cada audio en Storage (bucket "tts-cache"): la misma palabra
//   con la misma voz solo se genera una vez para todos los usuarios.
// - Proveedor principal: ElevenLabs. Si no hay clave de ElevenLabs pero sí
//   de OpenAI, usa OpenAI.
//
// Secretos (Edge Functions → Secrets):
//   ELEVENLABS_API_KEY    tu clave de ElevenLabs                (recomendado)
//   ELEVENLABS_VOICE_ID   ID de tu voz clonada: la guía en español
//                         (sílabas en tu idioma) sonará con tu voz (opcional)
//   ATLAS_VOICE_ID        opcional: otra voz de ElevenLabs para Atlas
//   VELA_VOICE_ID         opcional: otra voz de ElevenLabs para Vela
//   OPENAI_API_KEY        alternativa a ElevenLabs                (opcional)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Voces de la biblioteca de ElevenLabs usadas por defecto (inglés americano).
// Se pueden cambiar con los secretos ATLAS_VOICE_ID y VELA_VOICE_ID.
const EL_DEFAULT = {
  male: 'nPczCjzI2devNBz1zQrb',   // "Brian": grave, profunda, de narrador (EE. UU.)
  female: 'XrExE9yKIg1WjnnlVkGX'  // "Matilda": cálida, serena y clara (EE. UU.)
};

// Estilo para OpenAI (solo si se usa como alternativa).
const OPENAI_VOICES: Record<string, { voice: string; style: string }> = {
  male: {
    voice: 'onyx',
    style: 'Voice: a deep, warm, resonant baritone. Tone: calm, wise and reassuring, like a seasoned documentary narrator. Pacing: unhurried. Diction: crisp and easy to imitate for a language learner.'
  },
  female: {
    voice: 'sage',
    style: 'Voice: a refined, elegant female voice in a low-to-mid register. Tone: warm, poised and gently encouraging. Pacing: measured. Diction: precise and clear for a language learner.'
  }
};

const ACCENTS: Record<string, string> = {
  'en': 'Speak in a natural General American (United States) accent.',
  'fr': 'Speak in natural standard French from France.',
  'es-LA': 'Read this as a Latin American Spanish speaker would, with no Castilian "z" sound. It may be a single syllable: pronounce it exactly as written in Spanish.',
  'es-ES': 'Read this as a Spanish speaker from Spain would. It may be a single syllable: pronounce it exactly as written in Spanish.',
  'pt': 'Read this as a Brazilian Portuguese speaker would. It may be a single syllable.',
  'it': 'Read this as an Italian speaker would. It may be a single syllable.'
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const audioResponse = (data: BodyInit) =>
  new Response(data, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. Solo usuarios con sesión.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json(401, { error: 'Inicia sesión para usar las voces naturales' });

  // 2. Validar la petición.
  let body: { text?: string; voice?: string; accent?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'JSON no válido' }); }
  const text = (body.text ?? '').trim();
  const persona = body.voice === 'male' ? 'male' : 'female';
  const accent = ACCENTS[body.accent ?? ''] ? body.accent! : 'en';
  if (!text || text.length > 400) return json(400, { error: 'El texto debe tener entre 1 y 400 caracteres' });

  // 3. Elegir proveedor y voz.
  const elKey = Deno.env.get('ELEVENLABS_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const ownVoice = Deno.env.get('ELEVENLABS_VOICE_ID');
  if (!elKey && !openaiKey) return json(500, { error: 'Falta el secreto ELEVENLABS_API_KEY' });

  let provider: 'el' | 'openai';
  let voiceId = '';
  if (elKey) {
    provider = 'el';
    const isSpanishGuide = accent.startsWith('es-');
    voiceId = isSpanishGuide && ownVoice
      ? ownVoice
      : persona === 'male'
        ? (Deno.env.get('ATLAS_VOICE_ID') || EL_DEFAULT.male)
        : (Deno.env.get('VELA_VOICE_ID') || EL_DEFAULT.female);
  } else {
    provider = 'openai';
    voiceId = OPENAI_VOICES[persona].voice;
  }

  // 4. Buscar en la caché.
  const key = `v2/${provider}-${voiceId}/${accent}/${await sha256(text)}.mp3`;
  const cached = await admin.storage.from('tts-cache').download(key);
  if (cached.data) return audioResponse(cached.data);

  // 5. Generar con IA.
  let ai: Response;
  if (provider === 'el') {
    ai = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': elKey!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.1, use_speaker_boost: true }
      })
    });
  } else {
    const v = OPENAI_VOICES[persona];
    ai = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: v.voice, input: text, instructions: `${v.style} ${ACCENTS[accent]}`, response_format: 'mp3' })
    });
  }
  if (!ai.ok) return json(502, { error: 'El servicio de voz no respondió', detail: (await ai.text()).slice(0, 300) });
  const audio = new Uint8Array(await ai.arrayBuffer());

  // 6. Guardar en caché (si falla, se devuelve el audio igualmente).
  await admin.storage.from('tts-cache').upload(key, audio, { contentType: 'audio/mpeg', upsert: true });
  return audioResponse(audio);
});
