# Usar MapillaryJS con tu propia data

Este ejemplo deja el proyecto listo para que conectes **tus propios datos** (imágenes, secuencias, posiciones) sin depender de la API de Mapillary.

---

## Street View con tus 360° (data/ por días)

Si tienes las imágenes en **`data/`** organizadas por día de adquisición (1.er día, 2.º día, 3.er día), puedes usar la interfaz tipo Mapillary/Street View así:

1. **Generar el manifest** (cada vez que añadas o cambies imágenes en `data/`):
   ```bash
   npm run generate-street-manifest
   ```
   El script lee **GPS del EXIF** de cada JPG (si tu cámara lo guardó). Así la **ruta en el mapa** y la **posición del marcador** coinciden con la ubicación real, como en la app de Mapillary. Si no hay GPS en las fotos, se usa una ruta sintética.
   Instala dependencias antes: `npm install --legacy-peer-deps` (incluye `exifr` para leer EXIF).

2. **Compilar** (una vez): `yarn build` o `npm run build`

3. **Servidor**: `yarn serve` o `npm run serve`

4. **Abrir**:
   ```
   http://localhost:8000/custom-data/street-view.html
   ```

Verás un viewer 360° con tus JPG: una secuencia por día de adquisición. La barra superior permite saltar al **primer disparo de cada día**. Puedes navegar entre imágenes con las flechas (secuencia) como en Mapillary.

- **Estructura esperada de `data/`**: `data/<cámara>/<Día 1>/`, `data/<cámara>/<Día 2>/`, … con archivos `.JPG` dentro de cada día.
- Las imágenes se sirven desde `/data/`; el servidor ya expone esa ruta.

---

## Ejemplo genérico (MyDataProvider)

Para conectar otra data (no la carpeta `data/` por días):

1. **Compilar el proyecto** (una vez):
   ```bash
   yarn build
   ```

2. **Levantar el servidor de desarrollo**:
   ```bash
   yarn serve
   ```

3. **Abrir en el navegador**:
   ```
   http://localhost:8000/custom-data/
   ```

Deberías ver el viewer con una imagen de ejemplo. A partir de ahí puedes reemplazar los datos por los tuyos en `MyDataProvider.js`.

## Dónde conectar tu data

Todo se configura en **`MyDataProvider.js`**:

1. **`loadMyData()`**  
   Aquí cargas tus datos en memoria. Puedes:
   - Definir imágenes y secuencias a mano (como en el ejemplo).
   - Hacer `fetch()` a tu API o cargar un JSON y rellenar `_images`, `_sequences`, `_cells`, y opcionalmente `_clusters` y `_meshes`.

2. **`getImageBuffer(url)`**  
   El viewer llama esto para obtener los píxeles de cada imagen (por URL o por id).  
   - Ahora devuelve una imagen mínima de prueba.  
   - Sustituye por tu lógica: por ejemplo `fetch(miBaseUrl + url).then(r => r.arrayBuffer())` si sirves imágenes desde tu servidor.

3. **Formato de cada imagen (`ImageEnt`)**  
   Cada entrada en `_images` debe tener al menos:
   - `id`, `geometry: { lng, lat }`, `sequence: { id }`
   - `cluster: { id, url }`, `mesh: { id, url }`, `thumb: { id, url }`
   - `camera_type`: `"perspective"` | `"fisheye"` | `"spherical"`
   - `width`, `height`, `captured_at`, `compass_angle`, `altitude`, etc.  
   Ver `makeImageEnt()` en `MyDataProvider.js` para un ejemplo completo.

4. **Celdas S2 (`_cells`)**  
   El viewer descubre imágenes por celdas geográficas. Para cada imagen, obtén su `cellId` con:
   ```js
   const cellId = this.geometry.lngLatToCellId({ lng, lat });
   ```
   y añade en `_cells` una entrada `cellId` con un array de “core” images (solo `id`, `geometry`, `computed_geometry`, `sequence`).

## Opciones del Viewer

En **`app.js`** se crea el viewer así:

```js
const viewer = new Viewer({
  container,
  dataProvider,
  imageId: "my-image-1",
  imageTiling: false,
});
```

- **`imageId`**: id de la imagen con la que quieres abrir (debe existir en tu provider).
- **`imageTiling: false`**: indicado si no implementas `getImageTiles` (tiles por nivel de zoom).

Cuando tu data esté en `MyDataProvider`, solo tienes que asegurarte de que ese `imageId` exista y de que `getImageBuffer` devuelva la imagen correspondiente.

## Resumen

- **Datos**: se cargan en `MyDataProvider.loadMyData()` (o desde opciones/API).
- **Imágenes (píxeles)**: se sirven en `MyDataProvider.getImageBuffer(url)`.
- **Demo**: `yarn build && yarn serve` → http://localhost:8000/custom-data/
