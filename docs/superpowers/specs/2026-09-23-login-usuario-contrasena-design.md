# Login con usuario o correo + contraseña — diseño

Fecha: 2026-09-23 · Estado: **implementado y desplegado**. Cambio respecto al diseño: `accounts` tiene además `email` (migración `20260923235940`), porque la API de administración no filtra usuarios por correo.

## Motivo
El login por enlace mágico necesita que Supabase envíe correos, y el SMTP por
defecto solo entrega a los miembros del equipo del proyecto. Para que las 10
personas del grupo usen su cuenta personal sin configurar SMTP, se pasa a
contraseña, y **ningún flujo envía correos**.

## Decisiones
| Tema | Decisión |
|---|---|
| Motor de auth | Se mantiene **Supabase Auth**: sesiones, refresco, JWT ES256 verificado por JWKS y RLS con `auth.uid()` siguen igual. No hay auth propio. |
| Identificador para entrar | **usuario o correo**, indistinto |
| Registro | con **código de invitación** (secreto del Worker `INVITE_CODE`) |
| Correo al registrarse | obligatorio, no se verifica; la cuenta se crea **confirmada** |
| Recuperación | **pregunta de seguridad** de una lista cerrada |
| Contraseña | mínimo 8 caracteres; campo con **ojito** para mostrar/ocultar |
| Enlace mágico | se elimina |

## Datos (migración nueva)
```sql
create table public.accounts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  question_id smallint not null check (question_id between 1 and 6),
  answer_hash text not null,
  answer_salt text not null,
  created_at  timestamptz not null default now()
);
create unique index accounts_username_lower_idx on public.accounts (lower(username));
alter table public.accounts enable row level security;   -- sin políticas: solo service_role

create table public.auth_attempts (
  id         bigserial primary key,
  key        text not null,          -- 'login:<usuario>' / 'recovery:<usuario>'
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on public.auth_attempts (key, created_at desc);
alter table public.auth_attempts enable row level security;
```
El archivo se nombra con la versión que quede registrada en Supabase al
aplicarla (HANDOFF, trampa 10).

## API pública del Worker (`/api/auth/*`, sin JWT)
Se monta **antes** de `app.use("/api/*", auth)`, porque en Hono el orden de
registro decide qué corre primero.

| Endpoint | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/auth/register` | `{ invite, username, email, password, question_id, answer }` | `{ access_token, refresh_token }` |
| `POST /api/auth/login` | `{ identifier, password }` | `{ access_token, refresh_token }` |
| `POST /api/auth/recovery/question` | `{ identifier }` | `{ question_id }` |
| `POST /api/auth/recovery/reset` | `{ identifier, answer, new_password }` | `{ access_token, refresh_token }` |

- **Resolver el identificador:** si contiene `@` es un correo; si no, se busca
  `accounts.username` (sin distinguir mayúsculas) → `auth.admin.getUserById` → correo.
  El correo **nunca** se devuelve al cliente.
- **Registro:** valida el código (comparación de tiempo constante), que el usuario
  esté libre y que el correo no esté registrado. Luego `auth.admin.createUser({ email, password,
  email_confirm: true, user_metadata: { name: username } })` (el trigger existente
  crea `user_stats` con `display_name = username`), inserta en `accounts` e inicia sesión.
  Si falla el insert en `accounts`, borra el usuario recién creado.
- **Login / reset:** `signInWithPassword` con el cliente de servicio; devuelve los tokens.
- **Errores:** mensajes genéricos. El login dice «usuario o contraseña incorrectos»,
  exista o no el usuario. Registro: `invalid_invite`, `username_taken`, `email_taken`,
  `invalid_input`. Bloqueo: `429 too_many_attempts`.

## Seguridad
- **Respuesta de seguridad:** normalizada (NFD sin tildes, minúsculas, sin signos,
  espacios colapsados), guardada con **PBKDF2-SHA256, 100.000 iteraciones y sal de
  16 bytes** vía WebCrypto. Nunca se guarda en texto plano.
- **Límite de intentos:** 5 fallos en 15 minutos por clave (`login:` o `recovery:` +
  identificador normalizado) → `429` hasta que el fallo más antiguo de la ventana salga
  de ella. Un acierto borra los fallos de esa clave.
- **Validación (Zod, compartida cliente/servidor):** usuario `^[a-z0-9_.]{3,20}$`
  (se guarda en minúsculas), contraseña 8–72 caracteres, respuesta 2–60 caracteres.
- **Riesgo aceptado:** quien conozca bien a la persona podría adivinar la respuesta. El
  formulario sugiere elegir algo que no esté en redes sociales.

## Cliente
- `AuthScreen` con tres vistas: Entrar · Crear cuenta · Recuperar.
- `PasswordInput`: botón con `aria-label` «Mostrar contraseña» / «Ocultar contraseña»,
  que alterna `type="password"` y `"text"`.
- `lib/auth.ts`: llama a los endpoints sin token y hace `supabase.auth.setSession(tokens)`;
  `onAuthStateChange` en `main.tsx` ya reacciona.
- Preguntas en `src/shared/auth.ts` (lista cerrada con `id` y texto), compartidas con el servidor.

## Pruebas
- **Unitarias:** normalización, hash y verificación de la respuesta, esquemas Zod,
  lógica pura del límite de intentos y resolución del identificador.
- **Playwright** con `/api/auth/*` simulada: el ojito alterna el tipo del campo, se
  entra con usuario, el error muestra el mensaje genérico y el flujo de recuperación
  muestra la pregunta.
- **Producción:** crear una cuenta real con el código, entrar con usuario y con correo,
  recuperar la contraseña y estudiar una tarjeta.
