/**
 * Data provider for your Street View: loads the manifest (generated from data/ by day),
 * builds one sequence per acquisition day, and serves JPGs from /data.
 * Uses spherical (360°) camera type.
 */

import {
  DataProviderBase,
  S2GeometryProvider,
} from "/dist/mapillary.module.js";

const MANIFEST_URL = "/custom-data/street-manifest.json";
const DEFAULT_REFERENCE = { lng: -73.1, lat: 7.0, alt: 0 };

function makeEmptyCluster(id, reference) {
  return {
    id,
    pointIds: [],
    coordinates: [],
    colors: [],
    reference,
    rotation: [0, 0, 0],
  };
}

/**
 * Build ImageEnt for 360 spherical image. Synthetic coords: one band per day, ordered by sequence.
 */
function imageEntFromManifestEntry(entry, sequenceId, indexInDay, lng, lat, reference) {
  const clusterId = `cluster-${sequenceId}`;
  const meshId = `mesh-${entry.id}`;
  return {
    id: entry.id,
    geometry: { lng, lat },
    computed_geometry: { lng, lat },
    sequence: { id: sequenceId },
    altitude: reference.alt,
    computed_altitude: reference.alt,
    compass_angle: 0,
    computed_compass_angle: 0,
    computed_rotation: [Math.PI / 2, 0, 0],
    camera_type: "spherical",
    camera_parameters: [],
    captured_at: Date.now() - (1000 * 60 * 60 * 24 * (3 - indexInDay)),
    cluster: { id: clusterId, url: clusterId },
    mesh: { id: meshId, url: meshId },
    thumb: { id: `thumb-${entry.id}`, url: entry.file },
    creator: { id: null, username: null },
    owner: { id: null },
    width: 4096,
    height: 2048,
    exif_orientation: 1,
    atomic_scale: 1,
  };
}

function coreImageFromEnt(ent) {
  return {
    id: ent.id,
    geometry: ent.geometry,
    computed_geometry: ent.computed_geometry,
    sequence: ent.sequence,
  };
}

/**
 * Encode path for URL (spaces and special chars).
 */
function dataUrl(basePath, filePath) {
  const parts = filePath.split("/").map(encodeURIComponent);
  return basePath + "/" + parts.join("/");
}

export class StreetDataProvider extends DataProviderBase {
  constructor(manifest, options = {}) {
    super(options.geometry ?? new S2GeometryProvider());
    this._basePath = manifest.basePath || "/data";
    this._images = new Map();
    this._sequences = new Map();
    this._cells = new Map();
    this._clusters = new Map();
    this._meshes = new Map();
    this._urlToFile = new Map();
    this._reference = options.reference ?? DEFAULT_REFERENCE;
    this._buildFromManifest(manifest);
  }

  _buildFromManifest(manifest) {
    const ref = this._reference;
    const lngStep = 0.00008;
    let baseLng = ref.lng;

    for (let dayIndex = 0; dayIndex < manifest.days.length; dayIndex++) {
      const day = manifest.days[dayIndex];
      const sequenceId = `seq-${day.id}`;
      const imageIds = day.images.map((e) => e.id);

      this._sequences.set(sequenceId, { id: sequenceId, image_ids: imageIds });
      this._clusters.set(`cluster-${sequenceId}`, makeEmptyCluster(`cluster-${sequenceId}`, ref));

      let lng = baseLng;
      for (let i = 0; i < day.images.length; i++) {
        const entry = day.images[i];
        const hasGps = typeof entry.lat === "number" && typeof entry.lng === "number";
        const lat = hasGps ? entry.lat : ref.lat + dayIndex * 0.001;
        const lngVal = hasGps ? entry.lng : lng;
        const ent = imageEntFromManifestEntry(entry, sequenceId, dayIndex, lngVal, lat, ref);
        this._images.set(entry.id, ent);
        this._meshes.set(ent.mesh.url, { vertices: [], faces: [] });
        this._urlToFile.set(entry.file, entry.file);
        this._urlToFile.set(ent.thumb.url, entry.file);
        this._urlToFile.set(entry.id, entry.file);

        const cellId = this.geometry.lngLatToCellId(ent.geometry);
        if (!this._cells.has(cellId)) this._cells.set(cellId, []);
        this._cells.get(cellId).push(coreImageFromEnt(ent));

        if (!hasGps) lng += lngStep;
      }
      baseLng = lng + lngStep * 2;
    }
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
    const file = this._urlToFile.get(url) || url;
    const fullUrl = dataUrl(this._basePath, file);
    return fetch(fullUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load image: ${fullUrl}`);
        return r.arrayBuffer();
      });
  }

  getMesh(url) {
    const mesh = this._meshes.get(url) ?? { vertices: [], faces: [] };
    return Promise.resolve(mesh);
  }

  getCluster(url) {
    const cluster = this._clusters.get(url) ?? makeEmptyCluster(url, this._reference);
    return Promise.resolve(cluster);
  }

  getImageTiles() {
    return Promise.reject(new Error("Image tiling not used"));
  }

  setAccessToken() {}
}

/**
 * Fetch manifest and create the provider. Use this before creating the Viewer.
 */
export async function createStreetDataProvider(options = {}) {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`Failed to load manifest: ${MANIFEST_URL}`);
  const manifest = await res.json();
  return new StreetDataProvider(manifest, options);
}
