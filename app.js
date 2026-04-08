import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const MAX_NEARBY = 3;
const MEDIA_BUCKET = "shelter-media";
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000;
const DEFAULT_NEARBY_RADIUS_KM = 3;
const VERIFIED_SHELTER_COVERAGE_RADIUS_METERS = 150;
const MAX_BOUNDS_LAT_SPAN = 0.45;
const MAX_BOUNDS_LNG_SPAN = 0.45;
const MAX_LIST_RESULTS = 12;
const SHELTER_TYPE_LABELS = {
  school: "Ð¨ÐºÐ¾Ð»Ð°",
  hospital: "Ð‘Ð¾Ð»ÑŒÐ½Ð¸Ñ†Ð°",
  synagogue: "Ð¡Ð¸Ð½Ð°Ð³Ð¾Ð³Ð°",
  kindergarten: "Ð”ÐµÑ‚ÑÐºÐ¸Ð¹ ÑÐ°Ð´",
  shopping_center: "Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ñ‹Ð¹ Ñ†ÐµÐ½Ñ‚Ñ€",
  public_shelter: "ÐžÐ±Ñ‹Ñ‡Ð½Ñ‹Ð¹ Ð¼Ð¸ÐºÐ»Ð°Ñ‚ Ð¾Ð±Ñ‰ÐµÑÑ‚Ð²ÐµÐ½Ð½Ñ‹Ð¹",
  parking: "Parking",
  migunit: "ÐœÐ¸Ð³ÑƒÐ½Ð¸Ñ‚",
  building_shelter: "ÐœÐ¸ÐºÐ»Ð°Ñ‚ Ð² Ð´Ð¾Ð¼Ðµ",
  public_mamad: "ÐœÐÐœÐÐ” Ð¾Ð±Ñ‰ÐµÑÑ‚Ð²ÐµÐ½Ð½Ñ‹Ð¹"
};

const LOCATION_VERIFICATION_LABELS = {
  verified: "ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð¾",
  approximate: "Ð¡ÐºÐ¾Ñ€ÐµÐµ Ð²ÑÐµÐ³Ð¾ Ð²ÐµÑ€Ð½Ð¾",
  needs_review: "ÐÐµ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐµÐ½Ð¾"
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
    return "ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð¾";
  }
  if (normalizedValue === "approximate") {
    return "Ð¡ÐºÐ¾Ñ€ÐµÐµ Ð²ÑÐµÐ³Ð¾ Ð²ÐµÑ€Ð½Ð¾";
  }

  return "ÐÐµ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐµÐ½Ð¾";
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
    return `${Math.round(distanceMeters)} Ð¼`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} ÐºÐ¼`;
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
    return "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾.";
  }

  const preferredPatterns = [
    /(?:notes?|×”×¢×¨×•×ª|Ð¿Ñ€Ð¸Ð¼ÐµÑ‡Ð°Ð½Ð¸[ÐµÑ])\s*:\s*([^.]*(?:\.[^.]*){0,2})/i,
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
    return "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾.";
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
    label: label || "ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº",
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
  return SHELTER_TYPE_LABELS[type] || "Ð¢Ð¸Ð¿ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½";
}

function getLocationVerificationLabel(value) {
  return LOCATION_VERIFICATION_LABELS[value] || "Ð¢Ñ€ÐµÐ±ÑƒÐµÑ‚ Ñ€ÑƒÑ‡Ð½Ð¾Ð¹ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ¸";
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
    nearbyList.innerHTML = '<p class="empty-state">ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ñ‹.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "Ð‘ÐµÐ· Ñ€Ð°ÑÑÑ‚Ð¾ÑÐ½Ð¸Ñ";
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
          <button class="card-button" type="button" data-action="open-details" data-id="${escapeHtml(point.id)}">ÐŸÐ¾Ð´Ñ€Ð¾Ð±Ð½ÐµÐµ</button>
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Google Maps</a>
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
    const popupDescription = escapeHtml(description || "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾");
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    const mediaAction = point.media_url
      ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ</a>`
      : "";
    const sourceLine = sourceMeta
      ? sourceMeta.url
        ? `<div class="meta-line">Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: <a class="source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceMeta.label)}</a></div>`
        : `<div class="meta-line">Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: ${escapeHtml(sourceMeta.label)}</div>`
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
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Google Maps</a>
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
        stroke: true,
        color: "#6bbf7a",
        weight: 1,
        opacity: 0.55,
        fill: true,
        fillColor: "#9ddaa7",
        fillOpacity: 0.12,
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

  userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindPopup("Ð¢Ñ‹ Ð·Ð´ÐµÑÑŒ");
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
      sourceLabel: "Ð¿Ð¾ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¼Ñƒ Ñ„Ð»Ð°Ð¶ÐºÑƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ"
    };
  }

  if (userCoords) {
    return {
      lat: userCoords.lat,
      lng: userCoords.lng,
      sourceLabel: "Ð¿Ð¾ Ñ‚Ð²Ð¾ÐµÐ¹ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ð³ÐµÐ¾Ð¿Ð¾Ð·Ð¸Ñ†Ð¸Ð¸"
    };
  }

  const center = map.getCenter();
  return {
    lat: center.lat,
    lng: center.lng,
    sourceLabel: "Ð¿Ð¾ Ñ†ÐµÐ½Ñ‚Ñ€Ñƒ ÐºÐ°Ñ€Ñ‚Ñ‹"
  };
}

function updateLocationHint() {
  const coords = getSubmissionCoords();
  locationHint.textContent = `Ð¢Ð¾Ñ‡ÐºÐ° Ð±ÑƒÐ´ÐµÑ‚ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° ${coords.sourceLabel}: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}.`;
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
    ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ</a>`
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
        <h4>ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ</h4>
        <p>${escapeHtml(description)}</p>
      </section>
      ${sourceMeta ? `
        <section class="details-section">
          <h4>Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº</h4>
          <p>${escapeHtml(sourceMeta.label)}</p>
          ${sourceMeta.url ? `<div class="card-actions popup-actions"><a class="card-link source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¿Ð¾Ð»Ð½Ñ‹Ð¹ Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº</a></div>` : ""}
        </section>
      ` : ""}
      <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
      <div class="card-actions popup-actions">
        <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Google Maps</a>
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
    title = "Ð¢Ð¾Ñ‡ÐºÐ¸ Ð² Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸",
    copy = "ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÐ¼ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð²Ð½ÑƒÑ‚Ñ€Ð¸ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸ ÐºÐ°Ñ€Ñ‚Ñ‹.",
    statusText = "Ð¢Ð¾Ñ‡ÐºÐ¸ Ð² Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ñ‹.",
    fitToResults = false,
    referenceCoords = null,
    emptyMessage = "Ð’ ÑÑ‚Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸ Ð¿Ð¾ÐºÐ° Ð½ÐµÑ‚ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ñ… Ñ‚Ð¾Ñ‡ÐµÐº."
  } = options;

  if (!supabase) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¸Ð· Ð±Ð°Ð·Ñ‹.");
    setStatus("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¸Ð· Ð±Ð°Ð·Ñ‹.", true);
    return;
  }

  if (areBoundsTooWide(bounds)) {
    setStatus("Ð¡Ð»Ð¸ÑˆÐºÐ¾Ð¼ ÑˆÐ¸Ñ€Ð¾ÐºÐ¸Ð¹ Ð¼Ð°ÑÑˆÑ‚Ð°Ð±. ÐŸÑ€Ð¸Ð±Ð»Ð¸Ð·ÑŒ ÐºÐ°Ñ€Ñ‚Ñƒ Ð´Ð¾ Ð³Ð¾Ñ€Ð¾Ð´Ð° Ð¸Ð»Ð¸ Ñ€Ð°Ð¹Ð¾Ð½Ð° Ð¸ Ð¿Ð¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹ ÑÐ½Ð¾Ð²Ð°.", true);
    setResultsPanelContext("Ð¢Ð¾Ñ‡ÐºÐ¸ Ð² Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸", "Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð¿Ñ€Ð¸Ð±Ð»Ð¸Ð·ÑŒ ÐºÐ°Ñ€Ñ‚Ñƒ Ð´Ð¾ Ð³Ð¾Ñ€Ð¾Ð´Ð° Ð¸Ð»Ð¸ Ñ€Ð°Ð¹Ð¾Ð½Ð°, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð½Ðµ Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ ÑÐ»Ð¸ÑˆÐºÐ¾Ð¼ Ð¼Ð½Ð¾Ð³Ð¾ Ñ‚Ð¾Ñ‡ÐµÐº.");
    setEmptyResultsState("ÐŸÑ€Ð¸Ð±Ð»Ð¸Ð·ÑŒ ÐºÐ°Ñ€Ñ‚Ñƒ Ð¸ Ð½Ð°Ð¶Ð¼Ð¸ Â«ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚ÑƒÂ» ÐµÑ‰Ñ‘ Ñ€Ð°Ð·.");
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

    setStatus(`${statusText} Ð¡ÐµÐ¹Ñ‡Ð°Ñ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ ${rows.length} Ñ‚Ð¾Ñ‡ÐµÐº.`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸.");
    setStatus(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸: ${error.message}`, true);
  }
}

async function loadSheltersNearUser(coords) {
  const bounds = getBoundsAroundCoords(coords, DEFAULT_NEARBY_RADIUS_KM);
  await loadSheltersInBounds(bounds, {
    title: "Ð¢Ð¾Ñ‡ÐºÐ¸ Ñ€ÑÐ´Ð¾Ð¼ Ñ Ñ‚Ð¾Ð±Ð¾Ð¹",
    copy: `ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¿Ñ€Ð¸Ð¼ÐµÑ€Ð½Ð¾ Ð² Ñ€Ð°Ð´Ð¸ÑƒÑÐµ ${DEFAULT_NEARBY_RADIUS_KM} ÐºÐ¼ Ð¾Ñ‚ Ñ‚Ð²Ð¾ÐµÐ¹ Ð³ÐµÐ¾Ð¿Ð¾Ð·Ð¸Ñ†Ð¸Ð¸.`,
    statusText: "Ð‘Ð»Ð¸Ð¶Ð°Ð¹ÑˆÐ¸Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ñ‹.",
    fitToResults: true,
    referenceCoords: coords,
    emptyMessage: "Ð ÑÐ´Ð¾Ð¼ Ñ Ñ‚Ð¾Ð±Ð¾Ð¹ Ð¿Ð¾ÐºÐ° Ð½ÐµÑ‚ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ñ… Ñ‚Ð¾Ñ‡ÐµÐº."
  });
}

async function searchShelters(queryText) {
  const queryValue = String(queryText || "").trim();
  if (!queryValue) {
    setStatus("Ð’Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð´Ð»Ñ Ð¿Ð¾Ð¸ÑÐºÐ°.", true);
    return;
  }

  if (queryValue.length < 2) {
    setStatus("Ð”Ð»Ñ Ð¿Ð¾Ð¸ÑÐºÐ° Ð²Ð²ÐµÐ´Ð¸ Ñ…Ð¾Ñ‚Ñ Ð±Ñ‹ 2 ÑÐ¸Ð¼Ð²Ð¾Ð»Ð°.", true);
    return;
  }

  if (!supabase) {
    setEmptyResultsState("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð¸ÑÐºÐ°Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¿Ð¾ Ð±Ð°Ð·Ðµ.");
    setStatus("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð¸ÑÐºÐ°Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¿Ð¾ Ð±Ð°Ð·Ðµ.", true);
    return;
  }

  try {
    const escapedQuery = queryValue.replaceAll(",", "\\,");
    const rows = await fetchApprovedShelters((query) => query.ilike("city", `%${escapedQuery}%`));

    shelters = rows;
    renderShelters(rows);
    setResultsPanelContext(
      `Ð ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚Ñ‹ Ð´Ð»Ñ Â«${queryValue}Â»`,
      "ÐŸÐ¾Ð¸ÑÐº Ñ€Ð°Ð±Ð¾Ñ‚Ð°ÐµÑ‚ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ð¾ Ð³Ð¾Ñ€Ð¾Ð´Ð°Ð¼ Ð¸Ð· Ð±Ð°Ð·Ñ‹. ÐŸÐ¾ÑÐ»Ðµ Ð²Ñ‹Ð±Ð¾Ñ€Ð° Ð³Ð¾Ñ€Ð¾Ð´Ð° ÐºÐ°Ñ€Ñ‚Ð° Ð¿Ð¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÑ‚ Ð½Ð°Ð¹Ð´ÐµÐ½Ð½Ñ‹Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð² ÑÑ‚Ð¾Ð¼ Ð³Ð¾Ñ€Ð¾Ð´Ðµ."
    );

    if (!rows.length) {
      setEmptyResultsState(`ÐŸÐ¾ Ð·Ð°Ð¿Ñ€Ð¾ÑÑƒ Â«${queryValue}Â» Ð½Ð¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾.`);
      setStatus(`ÐŸÐ¾ Ð·Ð°Ð¿Ñ€Ð¾ÑÑƒ Â«${queryValue}Â» Ð½Ð¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾.`);
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
    setStatus(`ÐÐ°Ð¹Ð´ÐµÐ½Ð¾ ${rows.length} Ñ‚Ð¾Ñ‡ÐµÐº Ð¿Ð¾ Ð·Ð°Ð¿Ñ€Ð¾ÑÑƒ Â«${queryValue}Â».`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð²Ñ‹Ð¿Ð¾Ð»Ð½Ð¸Ñ‚ÑŒ Ð¿Ð¾Ð¸ÑÐº.");
    setStatus(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð²Ñ‹Ð¿Ð¾Ð»Ð½Ð¸Ñ‚ÑŒ Ð¿Ð¾Ð¸ÑÐº: ${error.message}`, true);
  }
}

async function detectLocation() {
  if (!navigator.geolocation) {
    if (!shelters.length) {
      setResultsPanelContext("Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ Ð¿Ð¾Ð¸ÑÐºÐ°", "Ð Ð°Ð·Ñ€ÐµÑˆÐ¸ Ð³ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸ÑŽ Ð¸Ð»Ð¸ Ð²Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð²Ñ€ÑƒÑ‡Ð½ÑƒÑŽ.");
      setEmptyResultsState("Ð“ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸Ñ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð°. Ð’Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð¸Ð»Ð¸ Ð½Ð°Ð¶Ð¼Ð¸ Â«ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚ÑƒÂ» Ð¿Ð¾ÑÐ»Ðµ Ð¿ÐµÑ€ÐµÐ¼ÐµÑ‰ÐµÐ½Ð¸Ñ ÐºÐ°Ñ€Ñ‚Ñ‹.");
    }
    setStatus("Ð“ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸Ñ Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÑ‚ÑÑ Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ð¾Ð¼.", true);
    return;
  }

  setStatus("ÐžÐ¿Ñ€ÐµÐ´ÐµÐ»ÑÐµÐ¼ Ñ‚Ð²Ð¾Ñ‘ Ð¼ÐµÑÑ‚Ð¾Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ...");

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
        setResultsPanelContext("Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ Ð¿Ð¾Ð¸ÑÐºÐ°", "Ð Ð°Ð·Ñ€ÐµÑˆÐ¸ Ð³ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸ÑŽ Ð¸Ð»Ð¸ Ð²Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð²Ñ€ÑƒÑ‡Ð½ÑƒÑŽ.");
        setEmptyResultsState("ÐŸÐ¾ÐºÐ° Ð½Ð¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ð¾. Ð’Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ Ð¸Ð»Ð¸ Ð¿Ñ€Ð¸Ð±Ð»Ð¸Ð·ÑŒ ÐµÑ‘ Ð¸ Ð½Ð°Ð¶Ð¼Ð¸ Â«ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚ÑƒÂ».");
      }
      setStatus(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ð¿Ñ€ÐµÐ´ÐµÐ»Ð¸Ñ‚ÑŒ Ð¿Ð¾Ð·Ð¸Ñ†Ð¸ÑŽ: ${error.message}`, true);
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
    throw new Error("Ð¤Ð°Ð¹Ð» ÑÐ»Ð¸ÑˆÐºÐ¾Ð¼ Ð±Ð¾Ð»ÑŒÑˆÐ¾Ð¹. Ð¡ÐµÐ¹Ñ‡Ð°Ñ Ð»Ð¸Ð¼Ð¸Ñ‚ 25 ÐœÐ‘.");
  }

  const extension = sanitizeFilename(file.name).split(".").pop();
  const path = `pending/${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new Error(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ„Ð°Ð¹Ð»: ${error.message}`);
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
    setFormMessage("Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð·Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js Ð´Ð»Ñ Ð¿Ð¾Ð´ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ñ Ðº Ð±Ð°Ð·Ðµ.", true);
    return;
  }

  const formData = new FormData(suggestForm);
  const coords = getSubmissionCoords();
  const payload = {
    title: String(formData.get("title") || "").trim(),
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    source: "ÐŸÐ¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»ÑŒÑÐºÐ¾Ðµ Ð¿Ñ€ÐµÐ´Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ",
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
    setFormMessage("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸.", true);
    return;
  }

  const file = mediaInput.files?.[0] || null;

  try {
    setFormMessage("ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð»ÑÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÑƒ Ð½Ð° Ð¼Ð¾Ð´ÐµÑ€Ð°Ñ†Ð¸ÑŽ...");
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
    setStatus("Ð¢Ð¾Ñ‡ÐºÐ° Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð° Ð½Ð° Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÑƒ. Ð¡Ð¿Ð°ÑÐ¸Ð±Ð¾.");
  } catch (error) {
    setFormMessage(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÑƒ: ${error.message}`, true);
  }
}

async function handleSearchArea() {
  await loadSheltersInBounds(getBoundsFromMap(), {
    title: "Ð¢Ð¾Ñ‡ÐºÐ¸ Ð² Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸",
    copy: "ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð²Ð½ÑƒÑ‚Ñ€Ð¸ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ³Ð¾ ÑƒÑ‡Ð°ÑÑ‚ÐºÐ° ÐºÐ°Ñ€Ñ‚Ñ‹. ÐŸÐµÑ€ÐµÐ¼ÐµÑÑ‚Ð¸ ÐºÐ°Ñ€Ñ‚Ñƒ Ð¸ Ð½Ð°Ð¶Ð¼Ð¸ ÐºÐ½Ð¾Ð¿ÐºÑƒ ÐµÑ‰Ñ‘ Ñ€Ð°Ð·, ÐµÑÐ»Ð¸ Ñ…Ð¾Ñ‡ÐµÑˆÑŒ Ð´Ñ€ÑƒÐ³Ð¾Ð¹ Ñ€Ð°Ð¹Ð¾Ð½.",
    statusText: "Ð¢Ð¾Ñ‡ÐºÐ¸ Ð² Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ñ‹.",
    referenceCoords: getBoundsCenter(getBoundsFromMap()),
    emptyMessage: "Ð’ ÑÑ‚Ð¾Ð¹ Ð¾Ð±Ð»Ð°ÑÑ‚Ð¸ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ñ… Ñ‚Ð¾Ñ‡ÐµÐº Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾."
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
setResultsPanelContext("Ð¢Ð¾Ñ‡ÐºÐ¸ Ñ€ÑÐ´Ð¾Ð¼ Ñ Ñ‚Ð¾Ð±Ð¾Ð¹", "ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÐ¼ Ð±Ð»Ð¸Ð¶Ð°Ð¹ÑˆÐ¸Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¸ ÐºÐ¾Ñ€Ð¾Ñ‚ÐºÑƒÑŽ Ð¸Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†Ð¸ÑŽ Ð¾ Ð½Ð¸Ñ…, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð¼Ð¾Ð¶Ð½Ð¾ Ð±Ñ‹Ð»Ð¾ Ð±Ñ‹ÑÑ‚Ñ€Ð¾ Ð²Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ð¿Ð¾Ð´Ñ…Ð¾Ð´ÑÑ‰ÐµÐµ Ð¼ÐµÑÑ‚Ð¾.");
setEmptyResultsState("Ð Ð°Ð·Ñ€ÐµÑˆÐ¸ Ð³ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸ÑŽ, Ð²Ð²ÐµÐ´Ð¸ Ð³Ð¾Ñ€Ð¾Ð´ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ Ð¸Ð»Ð¸ Ð¿Ñ€Ð¸Ð±Ð»Ð¸Ð·ÑŒ ÐµÑ‘ Ð¸ Ð½Ð°Ð¶Ð¼Ð¸ Â«ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚ÑƒÂ».");
loadCitySuggestions();
detectLocation();





