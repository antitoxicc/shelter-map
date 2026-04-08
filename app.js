import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const MAX_NEARBY = 3;
const MEDIA_BUCKET = "shelter-media";
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000;
const DEFAULT_NEARBY_RADIUS_KM = 3;
const VERIFIED_SHELTER_COVERAGE_RADIUS_METERS = 200;
const MAX_BOUNDS_LAT_SPAN = 0.45;
const MAX_BOUNDS_LNG_SPAN = 0.45;
const MAX_LIST_RESULTS = 12;
const SHELTER_TYPE_LABELS = {
  school: "Школа",
  hospital: "Больница",
  synagogue: "Синагога",
  kindergarten: "Детский сад",
  shopping_center: "Торговый центр",
  public_shelter: "Обычный миклат общественный",
  parking: "Parking",
  migunit: "Мигунит",
  building_shelter: "Миклат в доме",
  public_mamad: "МАМАД общественный"
};

const LOCATION_VERIFICATION_LABELS = {
  verified: "Подтверждено",
  approximate: "Скорее всего верно",
  needs_review: "Не проверено"
};

const statusMessage = document.getElementById("statusMessage");
const formMessage = document.getElementById("formMessage");
const nearbyList = document.getElementById("nearbyList");
const nearbyCount = document.getElementById("nearbyCount");
const resultsPanelTitle = document.getElementById("resultsPanelTitle");
const resultsPanelCopy = document.getElementById("resultsPanelCopy");
const refreshLocationBtn = document.getElementById("refreshLocationBtn");
const searchAreaBtn = document.getElementById("searchAreaBtn");
const mapSearchAreaBtn = document.getElementById("mapSearchAreaBtn");
const locationSearchForm = document.getElementById("locationSearchForm");
const locationSearchInput = document.getElementById("locationSearchInput");
const citySuggestions = document.getElementById("citySuggestions");
const suggestForm = document.getElementById("suggestForm");
const openSuggestBtn = document.getElementById("openSuggestBtn");
const closeSuggestBtn = document.getElementById("closeSuggestBtn");
const cancelSuggestBtn = document.getElementById("cancelSuggestBtn");
const suggestModal = document.getElementById("suggestModal");
const suggestBackdrop = document.getElementById("suggestBackdrop");
const detailsModal = document.getElementById("detailsModal");
const detailsBackdrop = document.getElementById("detailsBackdrop");
const closeDetailsBtn = document.getElementById("closeDetailsBtn");
const detailsModalContent = document.getElementById("detailsModalContent");
const locationHint = document.getElementById("locationHint");
const titleInput = document.getElementById("titleInput");
const mediaInput = document.getElementById("mediaInput");
const suggestMapElement = document.getElementById("suggestMap");
const mapLegend = document.querySelector(".map-legend");
const mapMobileLegend = document.querySelector(".map-mobile-legend");

const map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 13);
L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

function createShelterIcon(verificationStatus) {
  const normalizedStatus = String(verificationStatus || "").trim().toLowerCase();
  const color = normalizedStatus === "verified"
    ? "#17594a"
    : normalizedStatus === "approximate"
      ? "#b78103"
      : "#c84b31";
  const shadow = normalizedStatus === "verified"
    ? "0 10px 24px rgba(23,89,74,0.28)"
    : normalizedStatus === "approximate"
      ? "0 10px 24px rgba(183,129,3,0.28)"
      : "0 10px 24px rgba(200,75,49,0.28)";

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fffaf2;box-shadow:${shadow};"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -18]
  });
}

function getNormalizedVerificationLabel(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "verified") {
    return "Подтверждено";
  }
  if (normalizedValue === "approximate") {
    return "Скорее всего верно";
  }

  return "Не проверено";
}

const userIcon = L.divIcon({
  className: "custom-marker",
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#2364ff;border:4px solid rgba(255,255,255,0.95);box-shadow:0 0 0 10px rgba(35,100,255,0.16);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12]
});

const suggestSelectionIcon = L.divIcon({
  className: "custom-marker",
  html: '<div style="position:relative;width:22px;height:30px;"><div style="position:absolute;left:9px;top:2px;width:3px;height:22px;background:#3d3d3d;border-radius:2px;"></div><div style="position:absolute;left:12px;top:2px;width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:14px solid #c84b31;filter:drop-shadow(0 6px 12px rgba(200,75,49,0.25));"></div></div>',
  iconSize: [22, 30],
  iconAnchor: [11, 28],
  popupAnchor: [0, -20]
});

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let shelters = [];
let shelterMarkers = [];
let shelterCoverageCircles = [];
let userMarker = null;
let userCoords = null;
let suggestMap = null;
let suggestMarker = null;
let suggestUserMarker = null;
let availableCities = [];

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

function setResultsPanelContext(title, copy) {
  if (resultsPanelTitle) {
    resultsPanelTitle.textContent = title;
  }

  if (resultsPanelCopy) {
    resultsPanelCopy.textContent = copy;
  }
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

function formatAddress(address, city) {
  const addressText = String(address || "").trim();
  const cityText = String(city || "").trim();

  if (addressText && cityText) {
    return `${addressText}, ${cityText}`;
  }

  return addressText || cityText;
}

function normalizeDescriptionText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*/g, ". ")
    .trim();
}

function toSentenceCase(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getReadableDescription(rawDescription) {
  const normalized = normalizeDescriptionText(rawDescription);
  if (!normalized) {
    return "Описание не указано.";
  }

  const preferredPatterns = [
    /(?:notes?|הערות|примечани[ея])\s*:\s*([^.]*(?:\.[^.]*){0,2})/i,
    /(?:opening times?|is open|operational status|accessibility)\s*:\s*([^.]*(?:\.[^.]*){0,1})/i
  ];

  const preferredParts = preferredPatterns
    .map((pattern) => normalized.match(pattern)?.[1]?.trim())
    .filter(Boolean)
    .map((part) => toSentenceCase(part));

  if (preferredParts.length) {
    return preferredParts.join(". ");
  }

  const stripped = normalized
    .replace(/https?:\/\/\S+/gi, "")
    .split(/\.\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(Imported at source|Source object id|Source unique id|Source shelter number|Source category|Source type|Manager|Mobile|Filter system|Internal education shelter|Operational status|Accessibility|Is open|Opening times?)\b/i.test(part));

  if (!stripped.length) {
    return "Описание не указано.";
  }

  const joined = stripped.slice(0, 2).join(". ");
  return joined.length > 260 ? `${joined.slice(0, 257).trim()}...` : joined;
}

function getCompactSource(source) {
  const sourceText = String(source || "").trim();
  if (!sourceText) {
    return null;
  }

  const urlMatch = sourceText.match(/https?:\/\/\S+/i);
  const url = urlMatch?.[0] || null;
  const labelBase = url ? sourceText.replace(url, "").replace(/\s*-\s*$/, "").trim() : sourceText;
  const label = labelBase.length > 80 ? `${labelBase.slice(0, 77).trim()}...` : labelBase;

  return {
    label: label || "Открыть источник",
    url,
    fullText: sourceText
  };
}

function getBoundsAroundCoords(coords, radiusKm = DEFAULT_NEARBY_RADIUS_KM) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((coords.lat * Math.PI) / 180), 0.2));

  return {
    south: coords.lat - latDelta,
    north: coords.lat + latDelta,
    west: coords.lng - lngDelta,
    east: coords.lng + lngDelta
  };
}

function getBoundsFromMap() {
  const bounds = map.getBounds();

  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast()
  };
}

function areBoundsTooWide(bounds) {
  return (bounds.north - bounds.south) > MAX_BOUNDS_LAT_SPAN || (bounds.east - bounds.west) > MAX_BOUNDS_LNG_SPAN;
}

function getBoundsCenter(bounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2
  };
}

function getShelterTypeLabel(type) {
  return SHELTER_TYPE_LABELS[type] || "Тип не указан";
}

function getLocationVerificationLabel(value) {
  return LOCATION_VERIFICATION_LABELS[value] || "Требует ручной проверки";
}

function normalizeShelterRows(rows) {
  return (rows || []).map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));
}

function setEmptyResultsState(message) {
  nearbyCount.textContent = "0";
  nearbyList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function getPointsForList(points, referenceCoords = null) {
  if (!points.length) {
    return [];
  }

  if (referenceCoords) {
    return sortByDistance(points, referenceCoords, MAX_LIST_RESULTS);
  }

  return points.slice(0, MAX_LIST_RESULTS);
}

async function fetchApprovedShelters(applyFilters) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    let query = supabase
      .from("shelters")
      .select("id, title, description, address, city, source, shelter_type, location_verification_status, latitude, longitude, status, media_url, media_type")
      .eq("status", "approved");

    query = applyFilters(query);

    const { data, error } = await query.range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));

    if (!data || data.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return normalizeShelterRows(rows);
}

function renderCitySuggestions(cities) {
  if (!citySuggestions) {
    return;
  }

  citySuggestions.innerHTML = cities
    .map((city) => `<option value="${escapeHtml(city)}"></option>`)
    .join("");
}

async function loadCitySuggestions() {
  if (!supabase || !citySuggestions) {
    return;
  }

  try {
    const rows = [];
    let from = 0;

    while (true) {
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("shelters")
        .select("city")
        .eq("status", "approved")
        .not("city", "is", null)
        .range(from, to);

      if (error) {
        throw error;
      }

      rows.push(...(data || []));

      if (!data || data.length < SUPABASE_PAGE_SIZE) {
        break;
      }

      from += SUPABASE_PAGE_SIZE;
    }

    availableCities = Array.from(
      new Set(
        rows
          .map((row) => String(row.city || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "ru"));

    renderCitySuggestions(availableCities);
  } catch (error) {
    availableCities = [];
    renderCitySuggestions([]);
  }
}

function renderNearbyCards(points, totalCount = points.length) {
  nearbyCount.textContent = String(totalCount);
  if (!points.length) {
    nearbyList.innerHTML = '<p class="empty-state">Подтверждённые точки пока не найдены.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "Без расстояния";
    const address = formatAddress(point.address, point.city);
    const rawVerificationStatus = String(point.location_verification_status || "needs_review").trim().toLowerCase();
    const verificationStatus = rawVerificationStatus === "verified" || rawVerificationStatus === "approximate"
      ? rawVerificationStatus
      : "needs_review";
    const shelterTypeLabel = getShelterTypeLabel(point.shelter_type);
    const verificationLabel = getNormalizedVerificationLabel(verificationStatus);
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;

    return `
      <article class="location-card compact-location-card" data-shelter-id="${escapeHtml(point.id)}">
        <h3>${escapeHtml(point.title)}</h3>
        ${address ? `<div class="meta-line card-address">${escapeHtml(address)}</div>` : ""}
        <div class="badge-row">
          <span class="distance-badge">${distance}</span>
          <span class="type-badge">${escapeHtml(shelterTypeLabel)}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(verificationLabel)}</span>
        </div>
        <div class="card-actions">
          <button class="card-button" type="button" data-action="open-details" data-id="${escapeHtml(point.id)}">Подробнее</button>
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>
        </div>
      </article>
    `;
  }).join("");
}

function clearShelterMarkers() {
  shelterMarkers.forEach((marker) => map.removeLayer(marker));
  shelterMarkers = [];

  shelterCoverageCircles.forEach((circle) => map.removeLayer(circle));
  shelterCoverageCircles = [];
}

function renderShelters(points) {
  clearShelterMarkers();

  points.forEach((point) => {
    const description = getReadableDescription(point.description);
    const address = formatAddress(point.address, point.city);
    const sourceMeta = getCompactSource(point.source);
    const rawVerificationStatus = String(point.location_verification_status || "needs_review").trim().toLowerCase();
    const verificationStatus = rawVerificationStatus === "verified" || rawVerificationStatus === "approximate"
      ? rawVerificationStatus
      : "needs_review";
    const shelterTypeLabel = getShelterTypeLabel(point.shelter_type);
    const verificationLabel = getNormalizedVerificationLabel(verificationStatus);
    const popupDescription = escapeHtml(description || "Описание не указано");
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    const mediaAction = point.media_url
      ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">Открыть вложение</a>`
      : "";
    const sourceLine = sourceMeta
      ? sourceMeta.url
        ? `<div class="meta-line">Источник: <a class="source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceMeta.label)}</a></div>`
        : `<div class="meta-line">Источник: ${escapeHtml(sourceMeta.label)}</div>`
      : "";
    const popupHtml = `
      <article class="map-popup-card">
        <h3>${escapeHtml(point.title)}</h3>
        ${address ? `<div class="meta-line card-address">${escapeHtml(address)}</div>` : ""}
        <p>${popupDescription}</p>
        ${sourceLine}
        <div class="badge-row popup-badge-row">
          <span class="type-badge">${escapeHtml(shelterTypeLabel)}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(verificationLabel)}</span>
        </div>
        <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
        <div class="card-actions popup-actions">
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>
          ${mediaAction}
        </div>
      </article>
    `;

    const marker = L.marker([point.latitude, point.longitude], {
      icon: createShelterIcon(verificationStatus)
    })
      .addTo(map)
      .bindPopup(popupHtml, { className: "shelter-popup" });

    shelterMarkers.push(marker);

    if (verificationStatus === "verified") {
      const coverageCircle = L.circle([point.latitude, point.longitude], {
        radius: VERIFIED_SHELTER_COVERAGE_RADIUS_METERS,
        className: "coverage-zone",
        stroke: false,
        fill: true,
        fillColor: "#6fcd84",
        fillOpacity: 0.22,
        interactive: false
      }).addTo(map);

      shelterCoverageCircles.push(coverageCircle);
    }
  });
}

function updateUserMarker(coords) {
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindPopup("Ты здесь");
}

function fitMapToPoints(points, options = {}) {
  const { includeUser = false } = options;
  const bounds = [];

  if (includeUser && userCoords) {
    bounds.push([userCoords.lat, userCoords.lng]);
  }

  points.forEach((point) => bounds.push([point.latitude, point.longitude]));
  if (!bounds.length) {
    return;
  }

  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
}

function sortByDistance(points, coords, limit = MAX_NEARBY) {
  return points
    .map((point) => ({
      ...point,
      distanceMeters: calculateDistanceMeters(coords, { lat: Number(point.latitude), lng: Number(point.longitude) })
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

function getSubmissionCoords() {
  if (suggestMarker) {
    const coords = suggestMarker.getLatLng();
    return {
      lat: coords.lat,
      lng: coords.lng,
      sourceLabel: "по выбранному флажку на карте"
    };
  }

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

function updateSuggestUserMarker() {
  if (!suggestMap || !userCoords) {
    return;
  }

  if (!suggestUserMarker) {
    suggestUserMarker = L.marker([userCoords.lat, userCoords.lng], {
      icon: userIcon,
      interactive: false,
      keyboard: false
    }).addTo(suggestMap);
  } else {
    suggestUserMarker.setLatLng([userCoords.lat, userCoords.lng]);
  }
}

function ensureSuggestMap() {
  if (suggestMap || !suggestMapElement || typeof L === "undefined") {
    return;
  }

  suggestMap = L.map(suggestMapElement, { zoomControl: true, attributionControl: false }).setView(DEFAULT_CENTER, 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(suggestMap);

  suggestMap.on("click", (event) => {
    setSuggestMarker(event.latlng, true);
  });

  updateSuggestUserMarker();
}

function setSuggestMarker(latlng, shouldCenter = false) {
  ensureSuggestMap();
  if (!suggestMap || !latlng) {
    return;
  }

  const coords = {
    lat: Number(latlng.lat),
    lng: Number(latlng.lng)
  };

  if (!suggestMarker) {
    suggestMarker = L.marker([coords.lat, coords.lng], {
      draggable: true,
      icon: suggestSelectionIcon
    }).addTo(suggestMap);

    suggestMarker.on("dragend", () => {
      updateLocationHint();
    });
  } else {
    suggestMarker.setLatLng([coords.lat, coords.lng]);
  }

  if (shouldCenter) {
    suggestMap.setView([coords.lat, coords.lng], Math.max(suggestMap.getZoom(), 15));
  }

  updateLocationHint();
}

function openSuggestModal() {
  suggestModal.hidden = false;
  document.body.style.overflow = "hidden";
  setFormMessage("");
  ensureSuggestMap();
  updateSuggestUserMarker();
  setSuggestMarker(getSubmissionCoords(), true);
  setTimeout(() => {
    suggestMap?.invalidateSize();
  }, 0);
  updateLocationHint();
  if (window.matchMedia("(min-width: 641px)").matches) {
    titleInput.focus();
  }
}

function closeSuggestModal() {
  suggestModal.hidden = true;
  document.body.style.overflow = "";
}

function openDetailsModal(pointId) {
  const point = shelters.find((row) => String(row.id) === String(pointId));
  if (!point || !detailsModal || !detailsModalContent) {
    return;
  }

  const description = getReadableDescription(point.description);
  const sourceMeta = getCompactSource(point.source);
  const address = formatAddress(point.address, point.city);
  const rawVerificationStatus = String(point.location_verification_status || "needs_review").trim().toLowerCase();
  const verificationStatus = rawVerificationStatus === "verified" || rawVerificationStatus === "approximate"
    ? rawVerificationStatus
    : "needs_review";
  const verificationLabel = getNormalizedVerificationLabel(verificationStatus);
  const shelterTypeLabel = getShelterTypeLabel(point.shelter_type);
  const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  const distanceText = point.distanceMeters ? formatDistance(point.distanceMeters) : null;
  const mediaAction = point.media_url
    ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">Открыть вложение</a>`
    : "";

  detailsModalContent.innerHTML = `
    <article class="details-sheet">
      <h3>${escapeHtml(point.title)}</h3>
      ${address ? `<div class="meta-line card-address">${escapeHtml(address)}</div>` : ""}
      <div class="badge-row">
        ${distanceText ? `<span class="distance-badge">${escapeHtml(distanceText)}</span>` : ""}
        <span class="type-badge">${escapeHtml(shelterTypeLabel)}</span>
        <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(verificationLabel)}</span>
      </div>
      <section class="details-section">
        <h4>Описание</h4>
        <p>${escapeHtml(description)}</p>
      </section>
      ${sourceMeta ? `
        <section class="details-section">
          <h4>Источник</h4>
          <p>${escapeHtml(sourceMeta.label)}</p>
          ${sourceMeta.url ? `<div class="card-actions popup-actions"><a class="card-link source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">Открыть полный источник</a></div>` : ""}
        </section>
      ` : ""}
      <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
      <div class="card-actions popup-actions">
        <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">Открыть в Google Maps</a>
        ${mediaAction}
      </div>
    </article>
  `;

  detailsModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDetailsModal() {
  if (!detailsModal) {
    return;
  }

  detailsModal.hidden = true;
  if (suggestModal?.hidden !== false) {
    document.body.style.overflow = "";
  }
}

async function loadSheltersInBounds(bounds, options = {}) {
  const {
    title = "Точки в выбранной области",
    copy = "Показываем только точки внутри текущей области карты.",
    statusText = "Точки в выбранной области загружены.",
    fitToResults = false,
    referenceCoords = null,
    emptyMessage = "В этой области пока нет подтверждённых точек."
  } = options;

  if (!supabase) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("Заполни ./supabase-config.js, чтобы загрузить точки из базы.");
    setStatus("Заполни ./supabase-config.js, чтобы загрузить точки из базы.", true);
    return;
  }

  if (areBoundsTooWide(bounds)) {
    setStatus("Слишком широкий масштаб. Приблизь карту до города или района и попробуй снова.", true);
    setResultsPanelContext("Точки в выбранной области", "Сначала приблизь карту до города или района, чтобы не грузить слишком много точек.");
    setEmptyResultsState("Приблизь карту и нажми \«Обновить карту\» ещё раз.");
    renderShelters([]);
    shelters = [];
    return;
  }

  try {
    const rows = await fetchApprovedShelters((query) => query
      .gte("latitude", bounds.south)
      .lte("latitude", bounds.north)
      .gte("longitude", bounds.west)
      .lte("longitude", bounds.east));

    shelters = rows;
    renderShelters(rows);
    setResultsPanelContext(title, copy);

    if (!rows.length) {
      setEmptyResultsState(emptyMessage);
      setStatus(emptyMessage);
      return;
    }

    const listPoints = getPointsForList(rows, referenceCoords);
    renderNearbyCards(listPoints, rows.length);

    if (fitToResults && rows.length) {
      fitMapToPoints(rows, { includeUser: true });
    }

    setStatus(`${statusText} Сейчас на карте ${rows.length} точек.`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("Не удалось загрузить точки.");
    setStatus(`Не удалось загрузить точки: ${error.message}`, true);
  }
}

async function loadSheltersNearUser(coords) {
  const bounds = getBoundsAroundCoords(coords, DEFAULT_NEARBY_RADIUS_KM);
  await loadSheltersInBounds(bounds, {
    title: "Точки рядом с тобой",
    copy: `Показываем точки примерно в радиусе ${DEFAULT_NEARBY_RADIUS_KM} км от твоей геопозиции.`,
    statusText: "Ближайшие точки загружены.",
    fitToResults: true,
    referenceCoords: coords,
    emptyMessage: "Рядом с тобой пока нет подтверждённых точек."
  });
}

async function searchShelters(queryText) {
  const queryValue = String(queryText || "").trim();
  if (!queryValue) {
    setStatus("Введи город для поиска.", true);
    return;
  }

  if (queryValue.length < 2) {
    setStatus("Для поиска введи хотя бы 2 символа.", true);
    return;
  }

  if (!supabase) {
    setEmptyResultsState("Заполни ./supabase-config.js, чтобы искать точки по базе.");
    setStatus("Заполни ./supabase-config.js, чтобы искать точки по базе.", true);
    return;
  }

  try {
    const escapedQuery = queryValue.replaceAll(",", "\\,");
    const rows = await fetchApprovedShelters((query) => query.ilike("city", `%${escapedQuery}%`));

    shelters = rows;
    renderShelters(rows);
    setResultsPanelContext(
      `Результаты для \«${queryValue}\»`,
      "Поиск работает только по городам из базы. После выбора города карта показывает найденные точки в этом городе."
    );

    if (!rows.length) {
      setEmptyResultsState(`По запросу \«${queryValue}\» ничего не найдено.`);
      setStatus(`По запросу \«${queryValue}\» ничего не найдено.`);
      return;
    }

    const searchCenter = getBoundsCenter({
      south: Math.min(...rows.map((row) => row.latitude)),
      north: Math.max(...rows.map((row) => row.latitude)),
      west: Math.min(...rows.map((row) => row.longitude)),
      east: Math.max(...rows.map((row) => row.longitude))
    });

    renderNearbyCards(getPointsForList(rows, searchCenter), rows.length);
    fitMapToPoints(rows);
    setStatus(`Найдено ${rows.length} точек по запросу \«${queryValue}\».`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("Не удалось выполнить поиск.");
    setStatus(`Не удалось выполнить поиск: ${error.message}`, true);
  }
}

async function detectLocation() {
  if (!navigator.geolocation) {
    if (!shelters.length) {
      setResultsPanelContext("Выбери область поиска", "Разреши геолокацию или введи город вручную.");
      setEmptyResultsState("Геолокация недоступна. Введи город или нажми \«Обновить карту\» после перемещения карты.");
    }
    setStatus("Геолокация не поддерживается браузером.", true);
    return;
  }

  setStatus("Определяем твоё местоположение...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
      updateUserMarker(userCoords);
      updateSuggestUserMarker();
      if (!suggestMarker && !suggestModal.hidden) {
        setSuggestMarker(userCoords, true);
      }

      map.setView([userCoords.lat, userCoords.lng], 14);
      updateLocationHint();
      await loadSheltersNearUser(userCoords);
    },
    (error) => {
      if (!shelters.length) {
        setResultsPanelContext("Выбери область поиска", "Разреши геолокацию или введи город вручную.");
        setEmptyResultsState("Пока ничего не загружено. Введи город на карте или приблизь её и нажми \«Обновить карту\».");
      }
      setStatus(`Не удалось определить позицию: ${error.message}`, true);
      updateLocationHint();
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
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    source: "Пользовательское предложение",
    description: String(formData.get("description") || "").trim() || null,
    shelter_type: String(formData.get("shelter_type") || "").trim() || null,
    location_verification_status: "needs_review",
    latitude: Number(coords.lat),
    longitude: Number(coords.lng),
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null,
    status: "pending",
    media_url: null,
    media_type: null,
    media_name: null
  };

  if (!payload.title) {
    setFormMessage("Заполни название точки.", true);
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
    updateLocationHint();
    setStatus("Точка отправлена на проверку. Спасибо.");
  } catch (error) {
    setFormMessage(`Не удалось отправить точку: ${error.message}`, true);
  }
}

async function handleSearchArea() {
  await loadSheltersInBounds(getBoundsFromMap(), {
    title: "Точки в выбранной области",
    copy: "Показываем точки только внутри текущего участка карты. Перемести карту и нажми кнопку ещё раз, если хочешь другой район.",
    statusText: "Точки в выбранной области загружены.",
    referenceCoords: getBoundsCenter(getBoundsFromMap()),
    emptyMessage: "В этой области подтверждённых точек пока не найдено."
  });
}

async function handleLocationSearchSubmit(event) {
  event.preventDefault();
  await searchShelters(locationSearchInput?.value || "");
}

nearbyList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='open-details']");
  if (!button) {
    return;
  }

  openDetailsModal(button.dataset.id);
});

refreshLocationBtn.addEventListener("click", detectLocation);
searchAreaBtn?.addEventListener("click", handleSearchArea);
mapSearchAreaBtn?.addEventListener("click", handleSearchArea);
locationSearchForm?.addEventListener("submit", handleLocationSearchSubmit);
openSuggestBtn.addEventListener("click", openSuggestModal);
closeSuggestBtn.addEventListener("click", closeSuggestModal);
cancelSuggestBtn.addEventListener("click", closeSuggestModal);
suggestBackdrop.addEventListener("click", closeSuggestModal);
closeDetailsBtn?.addEventListener("click", closeDetailsModal);
detailsBackdrop?.addEventListener("click", closeDetailsModal);
suggestForm.addEventListener("submit", handleSuggestSubmit);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !suggestModal.hidden) {
    closeSuggestModal();
  }

  if (event.key === "Escape" && detailsModal && !detailsModal.hidden) {
    closeDetailsModal();
  }
});

map.on("moveend", updateLocationHint);

if (mapLegend && mapMobileLegend) {
  mapMobileLegend.innerHTML = mapLegend.innerHTML;
}

updateLocationHint();
setResultsPanelContext("Точки рядом с тобой", "Показываем ближайшие точки и короткую информацию о них, чтобы можно было быстро выбрать подходящее место.");
setEmptyResultsState("Разреши геолокацию, введи город на карте или приблизь её и нажми \«Обновить карту\».");
loadCitySuggestions();
detectLocation();





