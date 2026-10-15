# Simart

Aprendizaje de idiomas mediante la lectura inmersiva de libros. Pensado para iPad, móvil y escritorio.

## Funciones
- **Cuentas de usuario:** registro con nombre de usuario, email y contraseña. El progreso se sincroniza entre dispositivos. También se puede usar sin cuenta (solo en el dispositivo).
- **Onboarding:** idioma materno (con variante de español de España o Latinoamérica), idioma a aprender y nivel.
- **Biblioteca por niveles A1–C2** como un juego: XP, rangos, racha diaria y libros de desafío.
- **Toca una palabra:** traducción, fonética IPA, pronunciación adaptada a tu idioma materno, audio con velocidad ajustable y frases de contexto.
- **Inglés con acento americano** (voz en-US y fonética de EE. UU.).
- **Vocabulario en secciones de práctica**, base del futuro juego de repaso.

## Estructura
| Archivo | Qué es |
| --- | --- |
| `index.html` | La aplicación completa (React + Tailwind, sin instalación). |
| `supabase/schema.sql` | Base de datos: tablas, seguridad por usuario y funciones. |

## Activar las cuentas (Supabase)
1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo llamado `simart` (región *West EU*).
2. En el proyecto abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. En **Authentication → URL Configuration** pon como *Site URL* `https://brianasimar.github.io/simart/`.
4. En **Project Settings → API** copia la *Project URL* y la clave *anon public*, y pégalas en `index.html`, dentro de `window.SIMART_CONFIG`.

La clave *anon* es pública por diseño: la seguridad la aplican las políticas RLS de `schema.sql`, que impiden que un usuario lea o modifique los datos de otro. Las contraseñas las cifra y guarda Supabase Auth; nunca pasan por las tablas de Simart.

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
