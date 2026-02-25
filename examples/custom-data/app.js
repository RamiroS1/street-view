/**
 * Inicializa el viewer con tu Data Provider personalizado.
 * La imagen inicial se define por imageId (debe existir en tu provider).
 */
import { Viewer } from "/dist/mapillary.module.js";
import { MyDataProvider } from "./MyDataProvider.js";

const container = document.getElementById("viewer");
const dataProvider = new MyDataProvider({
  // Opcional: { lng, lat, alt } para reconstrucciones
  // reference: { lng: -74, lat: 40.7, alt: 0 },
});

const viewer = new Viewer({
  container,
  dataProvider,
  imageId: "my-image-1",
  imageTiling: false,
});

viewer.moveTo("my-image-1").catch((err) => console.error("moveTo:", err));
