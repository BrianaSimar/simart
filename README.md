# Simart

Aprendizaje de idiomas mediante la lectura inmersiva de libros. Pensado para iPad, móvil y escritorio.

## Funciones
- **Cuentas de usuario:** registro con nombre de usuario, email y contraseña. El progreso se sincroniza entre dispositivos. También se puede usar sin cuenta (solo en el dispositivo).
- **Onboarding:** idioma materno (con variante de español de España o Latinoamérica), idioma a aprender y nivel.
- **Biblioteca por niveles A1–C2** como un juego: XP, rangos, racha diaria y libros de desafío.
- **Toca una palabra:** aparece una tarjeta flotante pequeña con lo esencial (traducción, cómo suena con sílabas de tu idioma, el sonido más difícil, escuchar, velocidad y guardar). La frase se resalta en el propio libro, que se desplaza solo para que la palabra nunca quede tapada. «Más» abre la guía sílaba a sílaba, otro ejemplo y las secciones.
- **Guía de pronunciación sílaba a sílaba:** cada sílaba suena con un sonido equivalente de tu idioma materno, con consejos para los sonidos que no existen en él, y al final la palabra completa súper lento y a tu velocidad.
- **Voces de Simart con IA:** Atlas (masculina, grave y profunda, de narrador) y Vela (femenina, elegante y serena). Con cuenta iniciada suenan con voz natural generada por IA; sin conexión se usa la mejor voz del dispositivo, sin alterar su tono.
- **Velocidades reales:** normal, lento medio, lento y súper lento. La voz natural se ralentiza conservando el tono. Por defecto el sonido solo se reproduce cuando el usuario lo pide.
- **Inglés con acento americano** (voz en-US y fonética de EE. UU.).
- **Vocabulario en secciones de práctica**, base del futuro juego de repaso.

## Estructura
| Archivo | Qué es |
| --- | --- |
| `index.html` | La aplicación completa (React + Tailwind, sin instalación). |
| `supabase/schema.sql` | Base de datos: tablas, seguridad por usuario, funciones y caché de audio. |
| `supabase/functions/tts/index.ts` | Función que genera las voces naturales con IA y guarda cada audio en caché. |

## Activar las cuentas (Supabase)
1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo llamado `simart` (región *West EU*).
2. En el proyecto abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. En **Authentication → URL Configuration** pon como *Site URL* `https://brianasimar.github.io/simart/`.
4. La *Project URL* y la clave pública ya están configuradas en `index.html` (`window.SIMART_CONFIG`).

La clave *anon* es pública por diseño: la seguridad la aplican las políticas RLS de `schema.sql`, que impiden que un usuario lea o modifique los datos de otro. Las contraseñas las cifra y guarda Supabase Auth; nunca pasan por las tablas de Simart.

## Activar las voces naturales con IA (ElevenLabs)
1. En ElevenLabs crea una clave en **Profile → API Keys**.
2. En Supabase, ve a **Edge Functions → Secrets** y añade `ELEVENLABS_API_KEY` con esa clave.
3. Opcional: añade `ELEVENLABS_VOICE_ID` con el ID de tu voz clonada; la guía en español sonará con tu voz.
4. En **Edge Functions → Deploy a new function → Via Editor**, llama a la función `tts`, pega el contenido de `supabase/functions/tts/index.ts` y pulsa **Deploy**.

Atlas usa por defecto la voz «Brian» y Vela la voz «Matilda» de la biblioteca de ElevenLabs (inglés americano). Se pueden cambiar con los secretos `ATLAS_VOICE_ID` y `VELA_VOICE_ID`. Si prefieres OpenAI, añade `OPENAI_API_KEY` en lugar de la clave de ElevenLabs.

Las claves nunca llegan al navegador: solo las usa la función en el servidor, y la función solo responde a usuarios con sesión iniciada.

## Base de datos
| Tabla | Contenido |
| --- | --- |
| `profiles` | Nombre de usuario, idioma materno y variante, idioma de estudio, nivel, XP, racha y preferencias. |
| `vocab_items` | Palabras guardadas con su traducción, fonética, frase de contexto y sección. |
| `decks` | Secciones de práctica de cada usuario. |
| `finished_books` | Capítulos y libros terminados. |

## Publicar
GitHub Pages: **Settings → Pages**, rama `main`, carpeta `/ (root)`. La web queda en `https://brianasimar.github.io/simart/`.

## Próximos pasos
- Catálogo de libros de dominio público por nivel e importación de EPUB.
- Traducción e IPA mediante API para cualquier idioma.
- Juego de repaso con las secciones de vocabulario.
- Migración a Next.js + TypeScript + Tailwind y empaquetado como app.
