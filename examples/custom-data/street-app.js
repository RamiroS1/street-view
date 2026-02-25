/**
 * Street View app: your 360° images by acquisition day + map with trajectory.
 */
import { Viewer } from "/dist/mapillary.module.js";
import { createStreetDataProvider } from "./StreetDataProvider.js";

const MANIFEST_URL = "/custom-data/street-manifest.json";
const DEFAULT_REFERENCE = { lng: -73.1, lat: 7.0 };
const LNG_STEP = 0.00008;

/** Build trajectory per day: use real GPS from manifest when present, else synthetic (like provider). */
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

function initMap(trajectories, onReady) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

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
}

async function init() {
  const container = document.getElementById("viewer");
  const dayList = document.getElementById("day-list");
  const statusEl = document.getElementById("status");

  statusEl.textContent = "Loading manifest…";
  const manifestRes = await fetch(MANIFEST_URL);
  if (!manifestRes.ok) {
    statusEl.textContent = "Failed to load manifest. Run: node scripts/generate-street-manifest.js";
    return;
  }
  const manifest = await manifestRes.json();

  const trajectories = buildTrajectoriesFromManifest(manifest);

  statusEl.textContent = "Preparing Street View…";
  const dataProvider = await createStreetDataProvider();
  const firstImageIds = manifest.days.map((d) => d.images[0]?.id).filter(Boolean);
  const initialImageId = firstImageIds[0];

  const viewer = new Viewer({
    container,
    dataProvider,
    imageId: initialImageId,
    imageTiling: false,
    component: { cover: false },
  });

  viewer.moveTo(initialImageId).catch((err) => console.error("moveTo:", err));

  initMap(trajectories, (map, marker) => {
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

  manifest.days.forEach((day, i) => {
    const firstId = day.images[0]?.id;
    if (!firstId) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = day.name;
    btn.className = "day-btn";
    btn.addEventListener("click", () => {
      viewer.moveTo(firstId).catch((err) => console.error("moveTo:", err));
    });
    dayList.appendChild(btn);
  });

  statusEl.textContent = "";
}

init();
