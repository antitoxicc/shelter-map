import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const MAX_NEARBY = 5;

const statusMessage = document.getElementById("statusMessage");
const formMessage = document.getElementById("formMessage");
const nearbyList = document.getElementById("nearbyList");
const nearbyCount = document.getElementById("nearbyCount");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");
const suggestForm = document.getElementById("suggestForm");
const latInput = document.getElementById("latInput");
const lngInput = document.getElementById("lngInput");

const map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 13);
L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const shelterIcon = L.divIcon({
  className: "custom-marker",
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#17594a;border:3px solid #fffaf2;box-shadow:0 10px 24px rgba(23,89,74,0.28);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -18]
});

const userIcon = L.divIcon({
  className: "custom-marker",
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#2364ff;border:4px solid rgba(255,255,255,0.95);box-shadow:0 0 0 10px rgba(35,100,255,0.16);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12]
});

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let shelters = [];
let shelterMarkers = [];
let userMarker = null;
let userCoords = null;

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "var(--danger)" : "";
}

function setFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "var(--danger)" : "";
}

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} м`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} км`;
}

function calculateDistanceMeters(from, to) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNearbyCards(points) {
  nearbyCount.textContent = String(points.length);
  if (!points.length) {
    nearbyList.innerHTML = '<p class="empty-state">Подтверждённые точки пока не найдены.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "Без расстояния";
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    return `
      <article class="location-card">
        <h3>${escapeHtml(point.title)}</h3>
        <p>${escapeHtml(point.description || "Описание не указано")}</p>
        <span class="distance-badge">${distance}</span>
        <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
        <div class="card-actions">
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>
        </div>
      </article>
    `;
  }).join("");
}

function clearShelterMarkers() {
  shelterMarkers.forEach((marker) => map.removeLayer(marker));
  shelterMarkers = [];
}

function renderShelters(points) {
  clearShelterMarkers();
  points.forEach((point) => {
    const marker = L.marker([point.latitude, point.longitude], { icon: shelterIcon })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(point.title)}</strong><br />${escapeHtml(point.description || "Описание не указано")}<br /><a href="https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>`);
    shelterMarkers.push(marker);
  });
}

function updateUserMarker(coords) {
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindPopup("Ты здесь");
}

function fitMapToUserAndNearby(points) {
  const bounds = [];
  if (userCoords) {
    bounds.push([userCoords.lat, userCoords.lng]);
  }
  points.forEach((point) => bounds.push([point.latitude, point.longitude]));
  if (!bounds.length) {
    return;
  }
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
}

function sortByDistance(points, coords) {
  return points
    .map((point) => ({
      ...point,
      distanceMeters: calculateDistanceMeters(coords, { lat: Number(point.latitude), lng: Number(point.longitude) })
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_NEARBY);
}

async function loadApprovedShelters() {
  if (!supabase) {
    shelters = [];
    renderShelters([]);
    renderNearbyCards([]);
    setStatus("Заполни ./supabase-config.js, чтобы загрузить точки из базы.", true);
    return;
  }

  const { data, error } = await supabase
    .from("shelters")
    .select("id, title, description, latitude, longitude, status")
    .eq("status", "approved");

  if (error) {
    renderShelters([]);
    renderNearbyCards([]);
    setStatus(`Не удалось загрузить точки: ${error.message}`, true);
    return;
  }

  shelters = (data || []).map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));

  renderShelters(shelters);

  if (userCoords) {
    const nearby = sortByDistance(shelters, userCoords);
    renderNearbyCards(nearby);
    fitMapToUserAndNearby(nearby);
    setStatus(`Найдено ${nearby.length} ближайших точек.`);
    return;
  }

  renderNearbyCards([]);
  setStatus("Точки загружены. Разреши геолокацию, чтобы увидеть ближайшие.");
}

async function detectLocation() {
  if (!navigator.geolocation) {
    setStatus("Геолокация не поддерживается браузером.", true);
    return;
  }

  setStatus("Определяем твоё местоположение...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
      latInput.value = userCoords.lat.toFixed(6);
      lngInput.value = userCoords.lng.toFixed(6);
      updateUserMarker(userCoords);

      if (!shelters.length) {
        map.setView([userCoords.lat, userCoords.lng], 14);
        setStatus("Геопозиция определена. Загружаем точки...");
        await loadApprovedShelters();
        return;
      }

      const nearby = sortByDistance(shelters, userCoords);
      renderNearbyCards(nearby);
      fitMapToUserAndNearby(nearby);
      setStatus(`Позиция обновлена. Показываю ${nearby.length} ближайших точек.`);
    },
    (error) => {
      setStatus(`Не удалось определить позицию: ${error.message}`, true);
      if (shelters.length) {
        map.setView(DEFAULT_CENTER, 13);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function handleSuggestSubmit(event) {
  event.preventDefault();

  if (!supabase) {
    setFormMessage("Сначала заполни ./supabase-config.js для подключения к базе.", true);
    return;
  }

  const formData = new FormData(suggestForm);
  const payload = {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null,
    status: "pending"
  };

  if (!payload.title || !payload.description || Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
    setFormMessage("Заполни название, описание и координаты точки.", true);
    return;
  }

  setFormMessage("Отправляем точку на модерацию...");
  const { error } = await supabase.from("shelters").insert(payload);

  if (error) {
    setFormMessage(`Не удалось отправить точку: ${error.message}`, true);
    return;
  }

  suggestForm.reset();
  if (userCoords) {
    latInput.value = userCoords.lat.toFixed(6);
    lngInput.value = userCoords.lng.toFixed(6);
  }
  setFormMessage("Точка отправлена на проверку.");
}

refreshLocationBtn.addEventListener("click", detectLocation);
suggestForm.addEventListener("submit", handleSuggestSubmit);

loadApprovedShelters().finally(() => {
  detectLocation();
});
