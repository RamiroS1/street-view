/**
 * Plantilla de Data Provider para usar MapillaryJS con TU PROPIA DATA.
 *
 * 1. Implementa los métodos que MapillaryJS llama (getCoreImages, getImages,
 *    getSpatialImages, getSequence, getImageBuffer, getMesh, getCluster, getImageTiles).
 * 2. Rellena _images, _sequences, _cells (y opcionalmente _clusters, _meshes)
 *    con tus datos, o cárgalos en loadMyData() desde tu API/JSON.
 *
 * Formato de datos esperado:
 * - _images: Map<imageId, ImageEnt>  (cada imagen con geometry, sequence, thumb, mesh, cluster, etc.)
 * - _sequences: Map<sequenceId, { id, image_ids: string[] }>
 * - _cells: Map<cellId, CoreImageEnt[]>  (imágenes por celda S2, ver geometry.lngLatToCellId)
 *
 * Si no usas tiles de imagen, pon imageTiling: false en las opciones del Viewer.
 * Si no usas mallas 3D, getMesh puede devolver { vertices: [], faces: [] }.
 */

import {
  DataProviderBase,
  S2GeometryProvider,
} from "/dist/mapillary.module.js";

// Referencia geo para reconstrucciones (lon, lat, alt en grados y metros)
const DEFAULT_REFERENCE = { lng: 0, lat: 0, alt: 0 };

/**
 * Crea una imagen mínima válida para el viewer.
 * Sustituye estos valores por los de tu dataset.
 */
function makeImageEnt(options) {
  const {
    id,
    sequenceId,
    lng,
    lat,
    alt = 0,
    camera_type = "perspective",
    width = 640,
    height = 480,
    captured_at = Date.now(),
  } = options;

  const clusterId = `cluster-${sequenceId}`;
  const meshId = `mesh-${id}`;
  const thumbUrl = `thumb-${id}`; // puede ser una URL real de tu imagen

  return {
    id,
    geometry: { lng, lat },
    computed_geometry: { lng, lat },
    sequence: { id: sequenceId },
    altitude: alt,
    computed_altitude: alt,
    compass_angle: 0,
    computed_compass_angle: 0,
    computed_rotation: [Math.PI / 2, 0, 0],
    camera_type,
    camera_parameters: camera_type === "spherical" ? [] : [0.8, -0.1, 0.05],
    captured_at,
    cluster: { id: clusterId, url: clusterId },
    mesh: { id: meshId, url: meshId },
    thumb: { id: `thumb-${id}`, url: thumbUrl },
    creator: { id: null, username: null },
    owner: { id: null },
    width,
    height,
    exif_orientation: 1,
    atomic_scale: 1,
  };
}

/**
 * Crea una secuencia mínima (orden de imágenes).
 */
function makeSequence(id, imageIds) {
  return { id, image_ids: imageIds };
}

/**
 * Cluster mínimo (nube de puntos 3D). Si no usas 3D, el viewer puede
 * usar uno vacío.
 */
function makeEmptyCluster(id, reference = DEFAULT_REFERENCE) {
  return {
    id,
    pointIds: [],
    coordinates: [],
    colors: [],
    reference,
    rotation: [0, 0, 0],
  };
}

/** Imagen 1x1 PNG mínima (pixel gris) para que el viewer cargue hasta que uses tus imágenes. */
function minimalImageBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFeQP+3QAAAABJRU5ErkJggg==";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export class MyDataProvider extends DataProviderBase {
  constructor(options = {}) {
    super(options.geometry ?? new S2GeometryProvider());
    this._images = new Map();
    this._sequences = new Map();
    this._cells = new Map();
    this._clusters = new Map();
    this._meshes = new Map();
    this._reference = options.reference ?? DEFAULT_REFERENCE;

    // Carga tus datos aquí (o desde options.data, fetch, etc.)
    this.loadMyData();
  }

  /**
   * Aquí cargas TU DATA: desde un JSON, una API, o datos en memoria.
   * Ejemplo con una sola imagen de prueba.
   */
  loadMyData() {
    // Ejemplo: una imagen y una secuencia de prueba
    const imageId = "my-image-1";
    const sequenceId = "my-sequence-1";
    const img = makeImageEnt({
      id: imageId,
      sequenceId,
      lng: -74.006,
      lat: 40.7128,
      alt: 10,
      camera_type: "perspective",
      width: 640,
      height: 480,
    });

    this._images.set(imageId, img);
    this._sequences.set(sequenceId, makeSequence(sequenceId, [imageId]));
    this._clusters.set(`cluster-${sequenceId}`, makeEmptyCluster(`cluster-${sequenceId}`, this._reference));
    this._meshes.set(`mesh-${imageId}`, { vertices: [], faces: [] });

    // Celdas S2: el viewer usa cellId para descubrir imágenes por zona
    const cellId = this.geometry.lngLatToCellId(img.geometry);
    if (!this._cells.has(cellId)) this._cells.set(cellId, []);
    this._cells.get(cellId).push({
      id: img.id,
      geometry: img.geometry,
      computed_geometry: img.computed_geometry,
      sequence: img.sequence,
    });
  }

  getCoreImages(cellId) {
    const images = this._cells.get(cellId) ?? [];
    return Promise.resolve({ cell_id: cellId, images });
  }

  getImages(imageIds) {
    const result = imageIds.map((node_id) => ({
      node_id,
      node: this._images.get(node_id) ?? null,
    }));
    return Promise.resolve(result);
  }

  getSpatialImages(imageIds) {
    return this.getImages(imageIds);
  }

  getSequence(sequenceId) {
    const seq = this._sequences.get(sequenceId);
    if (!seq) return Promise.reject(new Error(`Sequence ${sequenceId} not found`));
    return Promise.resolve(seq);
  }

  getImageBuffer(url, abort) {
    // Sustituye esto por tu lógica: fetch(url).then(r => r.arrayBuffer()), etc.
    return Promise.resolve(minimalImageBuffer());
  }

  getMesh(url, abort) {
    const mesh = this._meshes.get(url) ?? { vertices: [], faces: [] };
    return Promise.resolve(mesh);
  }

  getCluster(url, abort) {
    const cluster = this._clusters.get(url) ?? makeEmptyCluster(url, this._reference);
    return Promise.resolve(cluster);
  }

  getImageTiles(tiles) {
    // Si no usas tiles, desactiva imageTiling en ViewerOptions.
    return Promise.reject(new Error("Image tiling no implementado"));
  }

  setAccessToken(accessToken) {
    // Opcional si tu API usa token
  }
}
