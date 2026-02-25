/**
 * Street View app: your 360° images by acquisition day + map with trajectory.
 * Supports server manifest or local load (drag-and-drop / folder picker).
 */
import { Viewer } from "/dist/mapillary.module.js";
import {
  createStreetDataProviderFromManifest,
} from "./StreetDataProvider.js";

const MANIFEST_URL = "/custom-data/street-manifest.json";
const DEFAULT_REFERENCE = { lng: -73.1, lat: 7.0 };
const LNG_STEP = 0.00008;
const IMAGE_EXTS = /\.(jpg|jpeg|png|webp)$/i;

/** Build trajectory per day: use real GPS from manifest when present, else synthetic. */
function buildTrajectoriesFromManifest(manifest) {
  const ref = DEFAULT_REFERENCE;
  const trajectories = [];
  let baseLng = ref.lng;

  for (let dayIndex = 0; dayIndex < manifest.days.length; dayIndex++) {
    const day = manifest.days[dayIndex];
    const points = [];
    let lng = baseLng;
    const latSynthetic = ref.lat + dayIndex * 0.001;

    for (let i = 0; i < day.images.length; i++) {
      const entry = day.images[i];
      const hasGps = typeof entry.lat === "number" && typeof entry.lng === "number";
      if (hasGps) {
        points.push([entry.lng, entry.lat]);
      } else {
        points.push([lng, latSynthetic]);
        lng += LNG_STEP;
      }
    }
    trajectories.push({ name: day.name, points, imageIds: day.images.map((e) => e.id) });
    baseLng = lng + LNG_STEP * 2;
  }
  return trajectories;
}

/** Collect image files and their manifest paths from a FileList or DataTransfer. */
function collectImageFiles(filesOrItems) {
  const files = [];
  const paths = [];

  const add = (file, pathKey) => {
    if (!file || !IMAGE_EXTS.test(file.name)) return;
    files.push(file);
    paths.push(pathKey);
  };

  const items = filesOrItems.length != null ? filesOrItems : [];
  const isFileList = items[0] instanceof File;
  if (isFileList) {
    for (let i = 0; i < items.length; i++) {
      const file = items[i];
      const pathKey = file.webkitRelativePath || `Local/${file.name}`;
      add(file, pathKey);
    }
    return { files, paths };
  }

  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") entries.push(item.getAsEntry?.() ?? item.getAsFile());
  }

  function walk(entry, prefix = "") {
    if (!entry) return Promise.resolve();
    if (entry.isFile) {
      return new Promise((res, rej) => {
        entry.file(
          (file) => {
            add(file, prefix ? `${prefix}/${entry.name}` : entry.name);
            res();
          },
          rej
        );
      });
    }
    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      return new Promise((resolve) => {
        function read() {
          dirReader.readEntries((ents) => {
            if (ents.length === 0) {
              resolve();
              return;
            }
            Promise.all(ents.map((e) => walk(e, nextPrefix))).then(read);
          });
        }
        read();
      });
    }
    return Promise.resolve();
  }

  const promises = entries.map((e) => {
    if (!e) return Promise.resolve();
    if (e.isDirectory !== undefined) return walk(e);
    if (e instanceof File) {
      add(e, e.webkitRelativePath || e.name);
      return Promise.resolve();
    }
    return Promise.resolve();
  });
  return Promise.all(promises).then(() => ({ files, paths }));
}

/** Load exifr in browser to read GPS from File. Tries local node_modules, then CDN. */
let exifrGpsFn = null;
async function getExifrGps() {
  if (exifrGpsFn) return exifrGpsFn;
  for (const url of [
    "/node_modules/exifr/dist/full.esm.mjs",
    "https://unpkg.com/exifr@7.1.3/dist/full.esm.mjs",
  ]) {
    try {
      const exifr = await import(/* @vite-ignore */ url);
      exifrGpsFn = (file) => exifr.default.gps(file);
      return exifrGpsFn;
    } catch (_) {}
  }
  return null;
}

/** Read GPS from a File via EXIF. Returns { lat, lng } or null. */
async function readGpsFromFile(file) {
  const gpsFn = await getExifrGps();
  if (!gpsFn) return null;
  try {
    const result = await gpsFn(file);
    if (result && typeof result.latitude === "number" && typeof result.longitude === "number") {
      return { lat: result.latitude, lng: result.longitude };
    }
  } catch (_) {}
  return null;
}

/** Build manifest and blob URL map from collected files/paths. Reads EXIF GPS when available. */
async function buildLocalManifestAndBlobMap(files, paths, onProgress) {
  const byDay = new Map();
  for (let i = 0; i < files.length; i++) {
    const pathKey = paths[i];
    const firstSegment = pathKey.includes("/") ? pathKey.split("/")[0] : "Local";
    if (!byDay.has(firstSegment)) byDay.set(firstSegment, []);
    byDay.get(firstSegment).push({ file: files[i], pathKey });
  }

  const days = [];
  const blobUrlMap = new Map();
  let dayIndex = 0;
  const total = files.length;
  let processed = 0;

  for (const [folderName, list] of byDay) {
    list.sort((a, b) => a.pathKey.localeCompare(b.pathKey));
    const dayId = `day_${dayIndex}`;
    const images = [];
    for (const item of list) {
      if (onProgress && total) onProgress(processed, total);
      const gps = await readGpsFromFile(item.file);
      const id = `${dayId}/${item.pathKey.replace(/[/\\]/g, "_")}`;
      blobUrlMap.set(item.pathKey, URL.createObjectURL(item.file));
      const entry = { id, file: item.pathKey };
      if (gps) {
        entry.lat = gps.lat;
        entry.lng = gps.lng;
      }
      images.push(entry);
      processed++;
    }
    days.push({ id: dayId, name: folderName, images });
    dayIndex++;
  }

  const manifest = { basePath: "/data", days };
  return { manifest, blobUrlMap };
}

function initMap(trajectories, onReady) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return null;

  const allPoints = trajectories.flatMap((t) => t.points);
  const toLatLng = (p) => [p[1], p[0]];
  const center = allPoints.length ? toLatLng(allPoints[0]) : [DEFAULT_REFERENCE.lat, DEFAULT_REFERENCE.lng];

  const map = L.map("map").setView(center, 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(map);

  const colors = ["#e74c3c", "#3498db", "#2ecc71"];
  trajectories.forEach((tr, i) => {
    if (tr.points.length < 2) return;
    const latLngs = tr.points.map(toLatLng);
    L.polyline(latLngs, {
      color: colors[i % colors.length],
      weight: 4,
      opacity: 0.9,
    }).addTo(map);
  });

  if (allPoints.length) map.fitBounds(L.latLngBounds(allPoints.map(toLatLng)), { padding: [20, 20] });

  const markerIcon = L.divIcon({
    className: "street-view-marker",
    html: `<div style="position:relative;width:28px;height:28px;margin-left:-14px;margin-top:-14px;">
      <div style="width:28px;height:28px;border-radius:50%;background:#f1c40f;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      <div style="position:absolute;top:6px;left:6px;width:10px;height:10px;border-radius:50%;background:#e74c3c;border:2px solid #fff;"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker(center, { icon: markerIcon }).addTo(map);

  onReady(map, marker);
  return map;
}

let currentViewer = null;
let currentMap = null;
let currentBlobUrls = null;

function runWithManifest(manifest, blobUrlMap, statusEl, dayListEl) {
  if (currentViewer) {
    currentViewer.remove();
    currentViewer = null;
  }
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
  if (currentBlobUrls) {
    currentBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    currentBlobUrls = null;
  }

  const container = document.getElementById("viewer");
  if (!container) return;

  const trajectories = buildTrajectoriesFromManifest(manifest);
  const dataProvider = createStreetDataProviderFromManifest(manifest, blobUrlMap ? { blobUrlMap } : {});

  if (blobUrlMap) currentBlobUrls = Array.from(blobUrlMap.values());

  const firstImageIds = manifest.days.map((d) => d.images[0]?.id).filter(Boolean);
  const initialImageId = firstImageIds[0];
  if (!initialImageId) return;

  const viewer = new Viewer({
    container,
    dataProvider,
    imageId: initialImageId,
    imageTiling: false,
    component: { cover: false },
  });
  currentViewer = viewer;
  viewer.moveTo(initialImageId).catch((err) => console.error("moveTo:", err));

  currentMap = initMap(trajectories, (map, marker) => {
    viewer.on("image", (e) => {
      if (e.image && e.image.lngLat) {
        const { lng, lat } = e.image.lngLat;
        marker.setLatLng([lat, lng]);
        map.panTo([lat, lng], { animate: true, duration: 0.3 });
      }
    });
    viewer.getImage().then((img) => {
      if (img && img.lngLat) {
        const { lng, lat } = img.lngLat;
        marker.setLatLng([lat, lng]);
        map.panTo([lat, lng]);
      }
    }).catch(() => {});
  });

  dayListEl.innerHTML = "";
  manifest.days.forEach((day) => {
    const firstId = day.images[0]?.id;
    if (!firstId) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = day.name;
    btn.className = "day-btn";
    btn.addEventListener("click", () => viewer.moveTo(firstId).catch((err) => console.error("moveTo:", err)));
    dayListEl.appendChild(btn);
  });

  if (statusEl) statusEl.textContent = "";
}

async function init() {
  const dayList = document.getElementById("day-list");
  const statusEl = document.getElementById("status");
  const dropZone = document.getElementById("local-drop-zone");

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg;
  };

  const toolbarLoadLocal = document.getElementById("toolbar-load-local");
  if (toolbarLoadLocal && dropZone) {
    toolbarLoadLocal.addEventListener("click", () => dropZone.classList.remove("hidden"));
  }
  const closeZone = document.getElementById("local-close-zone");
  if (closeZone && dropZone) {
    closeZone.addEventListener("click", () => dropZone.classList.add("hidden"));
  }

  const handleLocalFiles = async (files, paths) => {
    if (!files.length) {
      setStatus("No se encontraron imágenes (jpg, png, webp).");
      return;
    }
    try {
      setStatus(`Leyendo EXIF (GPS) y preparando ${files.length} imagen(es)…`);
      const { manifest, blobUrlMap } = await buildLocalManifestAndBlobMap(
        files,
        paths,
        (n, total) => setStatus(`Leyendo GPS… ${n + 1}/${total}`)
      );
      setStatus("Construyendo Street View…");
      runWithManifest(manifest, blobUrlMap, statusEl, dayList);
      if (dropZone) dropZone.classList.add("hidden");
      setStatus("");
    } catch (err) {
      console.error("handleLocalFiles:", err);
      setStatus("Error: " + (err && err.message ? err.message : String(err)));
    }
  };

  window.__streetViewProcessFiles = async function (fileList) {
    const { files, paths } = collectImageFiles(fileList);
    await handleLocalFiles(files, paths);
  };

  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const result = collectImageFiles(e.dataTransfer.items);
      if (result && result.then) {
        result.then(({ files, paths }) => handleLocalFiles(files, paths));
      } else {
        handleLocalFiles(result.files, result.paths);
      }
    });
  }

  const manifestRes = await fetch(MANIFEST_URL);
  if (manifestRes.ok) {
    const manifest = await manifestRes.json();
    setStatus("Preparing Street View…");
    runWithManifest(manifest, null, statusEl, dayList);
    setStatus("Si no ves imágenes, haz clic en «Cargar desde mi PC» y elige tu carpeta de fotos.");
  } else {
    setStatus("Arrastra aquí una carpeta/archivos o haz clic en «Cargar desde mi PC».");
    if (dropZone) dropZone.classList.remove("hidden");
  }
}

init();
