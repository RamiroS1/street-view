# Cómo desplegar el Street View

Tu app (Street View + mapa con ruta) se puede desplegar de varias formas.

---

## GitHub + Vercel (compartir por enlace)

Así subes el proyecto a GitHub y Vercel te da una URL pública (ej. `https://tu-proyecto.vercel.app`) para compartir.

### 1. Subir el proyecto a GitHub

1. Crea un repositorio en [github.com](https://github.com) (nuevo repo, público o privado).
2. En tu carpeta del proyecto:

```bash
git init
git add .
# Opcional: si data/ es muy grande, añádela a .gitignore y usa solo una muestra
# echo "data/" >> .gitignore
git commit -m "Street View + mapa"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

3. **Importante:** El archivo `examples/custom-data/street-manifest.json` debe estar en el repo (genera el manifest en tu PC con `npm run generate-street-manifest` y haz commit). Si incluyes la carpeta `data/` con fotos, el manifest ya estará; si no, genera el manifest con una copia local de `data/` y sube solo el JSON.

### 2. Conectar Vercel

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (con GitHub).
2. **Add New** → **Project** → importa el repositorio que acabas de subir.
3. Configuración del proyecto:
   - **Framework Preset:** Other
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Output Directory:** (déjalo vacío)
   - **Install Command:** (vacío; el build ya instala)
4. Si **no** subes la carpeta `data/` (por tamaño), en **Environment Variables** añade:
   - `DATA_BASE_URL` = URL base donde estén las imágenes (ej. un bucket público o Vercel Blob con la misma estructura de carpetas que `data/`).
5. **Deploy**. Vercel te dará una URL tipo `https://mapillary-js-xxx.vercel.app`.

### 3. Incluir imágenes en el deploy

- **Opción A – Poca cantidad:** Incluye la carpeta `data/` en el repo (por ejemplo solo una muestra de fotos). Quita `data/` del archivo `.vercelignore` para que se suba. El build puede ser `npm run build && npm run generate-street-manifest` si prefieres generar el manifest en Vercel.
- **Opción B – Muchas fotos:** Deja `data/` en `.vercelignore`. Sube las imágenes a otro sitio (Vercel Blob, Cloudflare R2, S3, etc.) manteniendo la misma estructura de rutas que en `data/`, y pon esa URL base en `DATA_BASE_URL` en Vercel.

### Resumen GitHub + Vercel

1. Subes el código a GitHub (con `street-manifest.json` y, si quieres, una muestra en `data/`).
2. Conectas el repo en Vercel y configuras el Build Command.
3. Compartes la URL que te da Vercel; quien la abra verá tu Street View y el mapa.

---

## Opción 1: Docker (recomendado)

Si tienes Docker instalado:

```bash
docker build -t street-view .
docker run -p 8000:8000 street-view
```

Abre `http://localhost:8000`. Para exponer en un servidor, usa el puerto que quieras, por ejemplo:

```bash
docker run -p 80:8000 -e PORT=8000 street-view
```

En un VPS (DigitalOcean, AWS EC2, etc.) puedes usar el mismo `docker run` o Docker Compose.

### Compartir la imagen con otra persona

Así la otra persona puede usar tu Street View **solo con Docker**, sin clonar el repo ni tener la carpeta `data/`.

**1. Tú: subir la imagen a Docker Hub**

- Crea una cuenta gratis en [hub.docker.com](https://hub.docker.com).
- En tu máquina (donde ya hiciste `docker build -t street-view .`):

```bash
# Inicia sesión (te pedirá usuario y contraseña)
docker login

# Etiqueta la imagen con tu usuario de Docker Hub (sustituye TU_USUARIO por tu nombre de usuario)
docker tag street-view TU_USUARIO/street-view:latest

# Sube la imagen
docker push TU_USUARIO/street-view:latest
```

**2. La otra persona: descargar y ejecutar**

Solo necesita tener Docker instalado. Luego:

```bash
docker pull TU_USUARIO/street-view:latest
docker run -p 8000:8000 TU_USUARIO/street-view:latest
```

Abre el navegador en `http://localhost:8000` y verá tu Street View con tus imágenes y mapa.

**Resumen:** Tú haces `docker build`, `docker tag` y `docker push`. Le pasas a la otra persona tu usuario de Docker Hub (ej. `agrosavia`) y le dices que ejecute los dos comandos de arriba con ese usuario.

---

## Opción 2: Plataformas Node (Render, Railway, Fly.io)

Estas plataformas ejecutan Node y sirven tu carpeta `data/` desde el mismo servidor.

### Render

1. Crea una cuenta en [render.com](https://render.com).
2. New → Web Service.
3. Conecta el repositorio Git del proyecto.
4. Configuración:
   - **Build Command:** `npm install --legacy-peer-deps && npm run build:deploy`
   - **Start Command:** `node server.js`
   - **Root Directory:** (dejar vacío si el proyecto está en la raíz)
5. En **Environment** añade si quieres: `NODE_ENV=production`.
6. Deploy. Render asigna una URL tipo `https://tu-app.onrender.com`.

**Importante:** La carpeta `data/` debe estar en el repo (con tus JPG) para que el build genere el manifest y las imágenes se sirvan en producción. Si `data/` es muy grande, considera subir solo una muestra o usar almacenamiento externo.

### Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. En Settings del servicio:
   - **Build:** `npm install --legacy-peer-deps && npm run build:deploy`
   - **Start:** `node server.js`
3. Deploy. Railway asigna un dominio público.

### Fly.io

```bash
# Instalar flyctl y hacer login (fly auth login)
fly launch
# Preguntará por región, etc. Luego:
fly deploy
```

Crea un `fly.toml` si hace falta; el comando de inicio debe ser `node server.js` y el puerto interno 8000 (Fly inyecta PORT).

---

## Opción 3: Servidor propio (VPS) con Node

En un Linux (Ubuntu, Debian, etc.):

```bash
# En el servidor
git clone <tu-repo> && cd mapillary-js
npm install --legacy-peer-deps
npm run build:deploy
node server.js
```

Para dejarlo corriendo en segundo plano usa **pm2**:

```bash
npm install -g pm2
pm2 start server.js --name street-view
pm2 save && pm2 startup
```

El servidor escucha en el puerto 8000 (o el que definas con `PORT=80 node server.js`). Usa nginx o Caddy como reverso proxy si quieres HTTPS.

---

## Variables de entorno útiles

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto donde escucha el servidor (por defecto 8000). |
| `URL` | URL pública de la app (ej. `https://tu-dominio.com`) para mostrarla en logs. |
| `DATA_BASE_URL` | (Vercel u otros) URL base donde se sirven las imágenes si no están en `data/` (ej. `https://tu-bucket.s3.amazonaws.com`). |
| `VERCEL` | Lo define Vercel; no hace falta que la configures. |

---

## Resumen rápido

- **Docker:** `docker build -t street-view . && docker run -p 8000:8000 street-view`
- **Render/Railway:** Build: `npm install --legacy-peer-deps && npm run build:deploy`, Start: `node server.js`
- **VPS:** `npm run build:deploy` y luego `node server.js` (o con pm2).

Asegúrate de que la carpeta **data/** con tus imágenes esté en el proyecto cuando hagas el build o el deploy, para que el manifest y las fotos estén disponibles en la app desplegada.
