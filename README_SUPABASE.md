# Migración a Supabase — Planificador Semanal

Este documento explica paso a paso cómo conectar esta aplicación a Supabase para que los datos se guarden en la nube en lugar de solo en el navegador.

---

## Resumen de cambios

| Aspecto | Antes | Después |
|---|---|---|
| Almacenamiento | `localStorage` del navegador | Base de datos Supabase |
| Autenticación | No tenía | Email + contraseña (Supabase Auth) |
| Multi-dispositivo | ❌ No | ✅ Sí |
| Privacidad | Cualquiera con el navegador | Cada usuario ve solo sus tareas |

---

## PASO 1: Crear proyecto en Supabase

1. Entrá a [https://supabase.com](https://supabase.com) y creá una cuenta (o iniciá sesión).
2. Hacé clic en **"New Project"**.
3. Completá:
   - **Name**: `planificador-semanal` (o el que prefieras)
   - **Database Password**: una contraseña segura (guardala, la vas a necesitar)
   - **Region**: elegí la más cercana (ej: `South America (São Paulo)`)
4. Hacé clic en **"Create new project"** y esperá ~2 minutos.

---

## PASO 2: Obtener las credenciales

1. En tu proyecto, andá a **Project Settings** (⚙️) → **API**.
2. Copiá estos dos valores:
   - **Project URL** → será `VITE_SUPABASE_URL` / `SUPABASE_URL`
   - **anon public key** → será `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`

> ⚠️ **Importante**: la `anon key` es pública y va en el frontend. La `service_role key` es SECRETA y nunca debe ir en el código del cliente.

---

## PASO 3: Ejecutar el SQL en Supabase

1. En el dashboard de Supabase, andá a **SQL Editor** (icono de base de datos en el menú lateral).
2. Hacé clic en **"New query"**.
3. Copiá y pegá **todo el contenido** del archivo `supabase-schema.sql` (está en la raíz del proyecto).
4. Hacé clic en **"Run"** (o Ctrl+Enter).
5. Deberías ver un mensaje de éxito como `Success. No rows returned`.

Este SQL crea:
- La tabla `tasks` con todas las columnas necesarias
- Índices para mejorar el rendimiento
- Un trigger que actualiza `updated_at` automáticamente
- **Row Level Security (RLS)** activado
- **Políticas** para que cada usuario solo pueda ver/editar/eliminar sus propias tareas

---

## PASO 4: Configurar autenticación en Supabase

1. En el dashboard, andá a **Authentication** (menú lateral).
2. En **Email**, verificá que **"Confirm email"** esté **desactivado** (para simplificar el registro).
   - Si querés activarlo, el flujo funciona igual pero el usuario debe confirmar su email antes de usar la app.
3. En **Site URL** (dentro de Authentication → URL Configuration), poné la URL de tu app en Netlify (ej: `https://-tu-app.netlify.app`).

---

## PASO 5: Configurar variables en desarrollo local

1. Abrí el archivo `config.js` en la raíz del proyecto.
2. Reemplazá los placeholders con tus credenciales reales:

```js
window.SUPABASE_URL = "https://xyzcompany.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

3. Guardá el archivo.

---

## PASO 6: Probar en local

1. Serví los archivos estáticos con cualquier servidor local. Por ejemplo:
   ```bash
   # Si tenés Python instalado
   python -m http.server 8080

   # O con npx
   npx serve .
   ```
2. Abrí `http://localhost:8080` en el navegador.
3. Debería aparecer el modal de autenticación.
4. Creá una cuenta con email y contraseña.
5. Creá algunas tareas, recargá la página y verificá que sigan ahí.

---

## PASO 7: Configurar en Netlify

1. Subí tu proyecto a un repositorio (GitHub, GitLab, etc.) **sin incluir `config.js` con credenciales reales** (está en el `.gitignore` o simplemente no lo subas).
2. En [Netlify](https://app.netlify.com), hacé clic en **"Add new site"** → **"Import an existing project"**.
3. Elegí tu repositorio.
4. En **Build settings**, verificá que:
   - **Build command**: esté el comando que genera `config.js` (viene configurado en `netlify.toml`)
   - **Publish directory**: `.`
5. Antes de desplegar, andá a **Site settings** → **Environment variables** y agregá:
   - `SUPABASE_URL` → la URL de tu proyecto
   - `SUPABASE_ANON_KEY` → la anon key de tu proyecto
6. Hacé clic en **"Deploy site"**.

> 💡 Netlify va a ejecutar el build command que genera `config.js` automáticamente con las variables de entorno. No necesitas subir ese archivo.

---

## PASO 8: Verificación final

Desplegada la app, verificá:

- [ ] Se puede conectar a Supabase (no hay errores de red en consola)
- [ ] Se pueden crear datos (tareas nuevas)
- [ ] Los datos creados permanecen después de cerrar el navegador
- [ ] Los datos se ven desde otro navegador/dispositivo (con la misma cuenta)
- [ ] Se pueden editar las tareas
- [ ] Se pueden eliminar las tareas
- [ ] No hay errores de consola relacionados con Supabase
- [ ] No hay claves secretas expuestas en el frontend (solo la anon key, que es pública por diseño)
- [ ] El proyecto funciona correctamente desplegado en Netlify

---

## Estructura de datos

### Tabla `tasks`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `user_id` | uuid (FK → auth.users) | Usuario dueño de la tarea |
| `title` | text | Nombre de la tarea |
| `day` | smallint | Día de la semana (0=lunes, 6=domingo) |
| `time` | text | Hora opcional "HH:MM" |
| `cat` | text | Categoría |
| `prio` | text | Prioridad: alta, media, baja |
| `recurring` | boolean | Se repite cada semana |
| `week_key` | text | "YYYY-MM-DD" del lunes de la semana |
| `done` | jsonb | Historial de completado por semana |
| `created_at` | timestamptz | Fecha de creación |
| `updated_at` | timestamptz | Fecha de última modificación |

### Relaciones

```
auth.users (1) ──── (N) tasks
```

Cada tarea pertenece a un usuario. Si se elimina el usuario, sus tareas se eliminan automáticamente (`on delete cascade`).

---

## Archivos del proyecto

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura de la app + modales |
| `app.js` | Lógica principal (UI + llamadas a Supabase) |
| `supabase.js` | Cliente Supabase + funciones CRUD |
| `config.js` | Variables de entorno (se genera en build) |
| `styles.css` | Estilos de la app |
| `supabase-schema.sql` | SQL para crear la estructura en Supabase |
| `netlify.toml` | Configuración de build/deploy en Netlify |
| `README_SUPABASE.md` | Este archivo |

---

## Troubleshooting

### "Invalid API key"
- Verificá que `SUPABASE_ANON_KEY` en `config.js` sea correcta.
- En Netlify, verificá que las variables de entorno estén bien escritas.

### "new row violates row-level security policy"
- Verificá que el SQL se haya ejecutado correctamente.
- Verifá que las políticas estén creadas: en Supabase Dashboard → Authentication → Policies.

### La app no carga en local
- Asegurate de servir los archivos con un servidor HTTP (no abrir el HTML directamente con `file://`).
- Revisá la consola del navegador para ver errores de CORS o módulos.

### Los datos no se guardan en Netlify
- Verificá que las variables de entorno estén configuradas en Netlify.
- Verificá que el build command se ejecute correctamente (mirá el log de deploy).
