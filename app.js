import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const MAX_NEARBY = 3;
const MEDIA_BUCKET = "shelter-media";
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;

const statusMessage = document.getElementById("statusMessage");
const formMessage = document.getElementById("formMessage");
const nearbyList = document.getElementById("nearbyList");
const nearbyCount = document.getElementById("nearbyCount");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");
const suggestForm = document.getElementById("suggestForm");
const openSuggestBtn = document.getElementById("openSuggestBtn");
const closeSuggestBtn = document.getElementById("closeSuggestBtn");
const cancelSuggestBtn = document.getElementById("cancelSuggestBtn");
const suggestModal = document.getElementById("suggestModal");
const suggestBackdrop = document.getElementById("suggestBackdrop");
const locationHint = document.getElementById("locationHint");
const titleInput = document.getElementById("titleInput");
const mediaInput = document.getElementById("mediaInput");

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

function getDescriptionSignal(description) {
  const text = String(description || "").trim();
  if (text.length >= 40) {
    return { className: "strong", label: "Есть подробное описание" };
  }
  if (text.length > 0) {
    return { className: "weak", label: "Описание короткое" };
  }
  return { className: "weak", label: "Описания нет" };
}

function renderNearbyCards(points) {
  nearbyCount.textContent = String(points.length);
  if (!points.length) {
    nearbyList.innerHTML = '<p class="empty-state">Подтверждённые точки пока не найдены.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "Без расстояния";
    const description = String(point.description || "").trim();
    const signal = getDescriptionSignal(description);
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    return `
      <article class="location-card">
        <h3>${escapeHtml(point.title)}</h3>
        <p>${escapeHtml(description || "Описание не указано. Такую точку может быть сложнее быстро найти.")}</p>
        <span class="distance-badge">${distance}</span>
        <span class="signal-badge ${signal.className}">${signal.label}</span>
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
    const description = String(point.description || "").trim();
    const mediaLine = point.media_url
      ? `<br /><a href="${point.media_url}" target="_blank" rel="noreferrer">Открыть вложение</a>`
      : "";
    const marker = L.marker([point.latitude, point.longitude], { icon: shelterIcon })
      .addTo(map)
      .bindPopup(
        `<strong>${escapeHtml(point.title)}</strong><br />${escapeHtml(description || "Описание не указано")}<br /><a href="https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>${mediaLine}`
      );
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

function getSubmissionCoords() {
  if (userCoords) {
    return {
      lat: userCoords.lat,
      lng: userCoords.lng,
      sourceLabel: "по твоей текущей геопозиции"
    };
  }

  const center = map.getCenter();
  return {
    lat: center.lat,
    lng: center.lng,
    sourceLabel: "по центру карты"
  };
}

function updateLocationHint() {
  const coords = getSubmissionCoords();
  locationHint.textContent = `Точка будет сохранена ${coords.sourceLabel}: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}.`;
}

function openSuggestModal() {
  suggestModal.hidden = false;
  document.body.style.overflow = "hidden";
  setFormMessage("");
  updateLocationHint();
  titleInput.focus();
}

function closeSuggestModal() {
  suggestModal.hidden = true;
  document.body.style.overflow = "";
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
    .select("id, title, description, latitude, longitude, status, media_url, media_type")
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
  setStatus("Точки загружены. Нажми кнопку на карте, чтобы показать ближайшие к тебе.");
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
      updateUserMarker(userCoords);
      updateLocationHint();

      if (!shelters.length) {
        map.setView([userCoords.lat, userCoords.lng], 14);
        setStatus("Геопозиция определена. Загружаем точки...");
        await loadApprovedShelters();
        return;
      }

      const nearby = sortByDistance(shelters, userCoords);
      renderNearbyCards(nearby);
      fitMapToUserAndNearby(nearby);
      setStatus(`Позиция обновлена. Показываю ${nearby.length} ближайшие точки.`);
    },
    (error) => {
      setStatus(`Не удалось определить позицию: ${error.message}`, true);
      updateLocationHint();
      if (shelters.length) {
        map.setView(DEFAULT_CENTER, 13);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function sanitizeFilename(name) {
  return String(name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadMediaFile(file) {
  if (!file) {
    return { media_url: null, media_type: null, media_name: null };
  }

  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new Error("Файл слишком большой. Сейчас лимит 25 МБ.");
  }

  const extension = sanitizeFilename(file.name).split(".").pop();
  const path = `pending/${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new Error(`Не удалось загрузить файл: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(data.path);
  return {
    media_url: publicUrlData.publicUrl,
    media_type: file.type || null,
    media_name: file.name || null
  };
}

async function handleSuggestSubmit(event) {
  event.preventDefault();

  if (!supabase) {
    setFormMessage("Сначала заполни ./supabase-config.js для подключения к базе.", true);
    return;
  }

  const formData = new FormData(suggestForm);
  const coords = getSubmissionCoords();
  const payload = {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    latitude: Number(coords.lat),
    longitude: Number(coords.lng),
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null,
    status: "pending",
    media_url: null,
    media_type: null,
    media_name: null
  };

  if (!payload.title || !payload.description) {
    setFormMessage("Заполни название и описание точки.", true);
    return;
  }

  const file = mediaInput.files?.[0] || null;

  try {
    setFormMessage("Отправляем точку на модерацию...");
    if (file) {
      const mediaPayload = await uploadMediaFile(file);
      Object.assign(payload, mediaPayload);
    }

    const { error } = await supabase.from("shelters").insert(payload);
    if (error) {
      throw new Error(error.message);
    }

    suggestForm.reset();
    setFormMessage("");
    closeSuggestModal();
    setStatus("Точка отправлена на проверку. Спасибо.");
  } catch (error) {
    setFormMessage(`Не удалось отправить точку: ${error.message}`, true);
  }
}

refreshLocationBtn.addEventListener("click", detectLocation);
openSuggestBtn.addEventListener("click", openSuggestModal);
closeSuggestBtn.addEventListener("click", closeSuggestModal);
cancelSuggestBtn.addEventListener("click", closeSuggestModal);
suggestBackdrop.addEventListener("click", closeSuggestModal);
suggestForm.addEventListener("submit", handleSuggestSubmit);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !suggestModal.hidden) {
    closeSuggestModal();
  }
});

map.on("moveend", updateLocationHint);

loadApprovedShelters().finally(() => {
  updateLocationHint();
  detectLocation();
});
