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
  school: "\\u0428\\u043a\\u043e\\u043b\\u0430",
  hospital: "\\u0411\\u043e\\u043b\\u044c\\u043d\\u0438\\u0446\\u0430",
  synagogue: "\\u0421\\u0438\\u043d\\u0430\\u0433\\u043e\\u0433\\u0430",
  kindergarten: "\\u0414\\u0435\\u0442\\u0441\\u043a\\u0438\\u0439 \\u0441\\u0430\\u0434",
  shopping_center: "\\u0422\\u043e\\u0440\\u0433\\u043e\\u0432\\u044b\\u0439 \\u0446\\u0435\\u043d\\u0442\\u0440",
  public_shelter: "\\u041e\\u0431\\u044b\\u0447\\u043d\\u044b\\u0439 \\u043c\\u0438\\u043a\\u043b\\u0430\\u0442 \\u043e\\u0431\\u0449\\u0435\\u0441\\u0442\\u0432\\u0435\\u043d\\u043d\\u044b\\u0439",
  parking: "Parking",
  migunit: "\\u041c\\u0438\\u0433\\u0443\\u043d\\u0438\\u0442",
  building_shelter: "\\u041c\\u0438\\u043a\\u043b\\u0430\\u0442 \\u0432 \\u0434\\u043e\\u043c\\u0435",
  public_mamad: "\\u041c\\u0410\\u041c\\u0410\\u0414 \\u043e\\u0431\\u0449\\u0435\\u0441\\u0442\\u0432\\u0435\\u043d\\u043d\\u044b\\u0439"
};

const LOCATION_VERIFICATION_LABELS = {
  verified: "\\u041f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0435\\u043d\\u043e",
  approximate: "\\u0421\\u043a\\u043e\\u0440\\u0435\\u0435 \\u0432\\u0441\\u0435\\u0433\\u043e \\u0432\\u0435\\u0440\\u043d\\u043e",
  needs_review: "\\u041d\\u0435 \\u043f\\u0440\\u043e\\u0432\\u0435\\u0440\\u0435\\u043d\\u043e"
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
    return "\\u041f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0435\\u043d\\u043e";
  }
  if (normalizedValue === "approximate") {
    return "\\u0421\\u043a\\u043e\\u0440\\u0435\\u0435 \\u0432\\u0441\\u0435\\u0433\\u043e \\u0432\\u0435\\u0440\\u043d\\u043e";
  }

  return "\\u041d\\u0435 \\u043f\\u0440\\u043e\\u0432\\u0435\\u0440\\u0435\\u043d\\u043e";
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
    return `${Math.round(distanceMeters)} \\u043c`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} \\u043a\\u043c`;
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
    return "\\u041e\\u043f\\u0438\\u0441\\u0430\\u043d\\u0438\\u0435 \\u043d\\u0435 \\u0443\\u043a\\u0430\\u0437\\u0430\\u043d\\u043e.";
  }

  const preferredPatterns = [
    /(?:notes?|\\u05d4\\u05e2\\u05e8\\u05d5\\u05ea|\\u043f\\u0440\\u0438\\u043c\\u0435\\u0447\\u0430\\u043d\\u0438[\\u0435\\u044f])\s*:\s*([^.]*(?:\.[^.]*){0,2})/i,
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
    return "\\u041e\\u043f\\u0438\\u0441\\u0430\\u043d\\u0438\\u0435 \\u043d\\u0435 \\u0443\\u043a\\u0430\\u0437\\u0430\\u043d\\u043e.";
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
    label: label || "\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0438\\u0441\\u0442\\u043e\\u0447\\u043d\\u0438\\u043a",
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
  return SHELTER_TYPE_LABELS[type] || "\\u0422\\u0438\\u043f \\u043d\\u0435 \\u0443\\u043a\\u0430\\u0437\\u0430\\u043d";
}

function getLocationVerificationLabel(value) {
  return LOCATION_VERIFICATION_LABELS[value] || "\\u0422\\u0440\\u0435\\u0431\\u0443\\u0435\\u0442 \\u0440\\u0443\\u0447\\u043d\\u043e\\u0439 \\u043f\\u0440\\u043e\\u0432\\u0435\\u0440\\u043a\\u0438";
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
    nearbyList.innerHTML = '<p class="empty-state">\\u041f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0451\\u043d\\u043d\\u044b\\u0435 \\u0442\\u043e\\u0447\\u043a\\u0438 \\u043f\\u043e\\u043a\\u0430 \\u043d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u044b.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "\\u0411\\u0435\\u0437 \\u0440\\u0430\\u0441\\u0441\\u0442\\u043e\\u044f\\u043d\\u0438\\u044f";
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
          <button class="card-button" type="button" data-action="open-details" data-id="${escapeHtml(point.id)}">\\u041f\\u043e\\u0434\\u0440\\u043e\\u0431\\u043d\\u0435\\u0435</button>
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0432 Google Maps</a>
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
    const popupDescription = escapeHtml(description || "\\u041e\\u043f\\u0438\\u0441\\u0430\\u043d\\u0438\\u0435 \\u043d\\u0435 \\u0443\\u043a\\u0430\\u0437\\u0430\\u043d\\u043e");
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    const mediaAction = point.media_url
      ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0432\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435</a>`
      : "";
    const sourceLine = sourceMeta
      ? sourceMeta.url
        ? `<div class="meta-line">\\u0418\\u0441\\u0442\\u043e\\u0447\\u043d\\u0438\\u043a: <a class="source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceMeta.label)}</a></div>`
        : `<div class="meta-line">\\u0418\\u0441\\u0442\\u043e\\u0447\\u043d\\u0438\\u043a: ${escapeHtml(sourceMeta.label)}</div>`
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
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0432 Google Maps</a>
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
        stroke: false,
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

  userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindPopup("\\u0422\\u044b \\u0437\\u0434\\u0435\\u0441\\u044c");
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
      sourceLabel: "\\u043f\\u043e \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u043c\\u0443 \\u0444\\u043b\\u0430\\u0436\\u043a\\u0443 \\u043d\\u0430 \\u043a\\u0430\\u0440\\u0442\\u0435"
    };
  }

  if (userCoords) {
    return {
      lat: userCoords.lat,
      lng: userCoords.lng,
      sourceLabel: "\\u043f\\u043e \\u0442\\u0432\\u043e\\u0435\\u0439 \\u0442\\u0435\\u043a\\u0443\\u0449\\u0435\\u0439 \\u0433\\u0435\\u043e\\u043f\\u043e\\u0437\\u0438\\u0446\\u0438\\u0438"
    };
  }

  const center = map.getCenter();
  return {
    lat: center.lat,
    lng: center.lng,
    sourceLabel: "\\u043f\\u043e \\u0446\\u0435\\u043d\\u0442\\u0440\\u0443 \\u043a\\u0430\\u0440\\u0442\\u044b"
  };
}

function updateLocationHint() {
  const coords = getSubmissionCoords();
  locationHint.textContent = `\\u0422\\u043e\\u0447\\u043a\\u0430 \\u0431\\u0443\\u0434\\u0435\\u0442 \\u0441\\u043e\\u0445\\u0440\\u0430\\u043d\\u0435\\u043d\\u0430 ${coords.sourceLabel}: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}.`;
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
    ? `<a class="card-link" href="${escapeHtml(point.media_url)}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0432\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435</a>`
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
        <h4>\\u041e\\u043f\\u0438\\u0441\\u0430\\u043d\\u0438\\u0435</h4>
        <p>${escapeHtml(description)}</p>
      </section>
      ${sourceMeta ? `
        <section class="details-section">
          <h4>\\u0418\\u0441\\u0442\\u043e\\u0447\\u043d\\u0438\\u043a</h4>
          <p>${escapeHtml(sourceMeta.label)}</p>
          ${sourceMeta.url ? `<div class="card-actions popup-actions"><a class="card-link source-link" href="${escapeHtml(sourceMeta.url)}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u043f\\u043e\\u043b\\u043d\\u044b\\u0439 \\u0438\\u0441\\u0442\\u043e\\u0447\\u043d\\u0438\\u043a</a></div>` : ""}
        </section>
      ` : ""}
      <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
      <div class="card-actions popup-actions">
        <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">\\u041e\\u0442\\u043a\\u0440\\u044b\\u0442\\u044c \\u0432 Google Maps</a>
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
    title = "\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438",
    copy = "\\u041f\\u043e\\u043a\\u0430\\u0437\\u044b\\u0432\\u0430\\u0435\\u043c \\u0442\\u043e\\u043b\\u044c\\u043a\\u043e \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0432\\u043d\\u0443\\u0442\\u0440\\u0438 \\u0442\\u0435\\u043a\\u0443\\u0449\\u0435\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438 \\u043a\\u0430\\u0440\\u0442\\u044b.",
    statusText = "\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0436\\u0435\\u043d\\u044b.",
    fitToResults = false,
    referenceCoords = null,
    emptyMessage = "\\u0412 \\u044d\\u0442\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438 \\u043f\\u043e\\u043a\\u0430 \\u043d\\u0435\\u0442 \\u043f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0451\\u043d\\u043d\\u044b\\u0445 \\u0442\\u043e\\u0447\\u0435\\u043a."
  } = options;

  if (!supabase) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("\\u0417\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 ./supabase-config.js, \\u0447\\u0442\\u043e\\u0431\\u044b \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0438\\u0437 \\u0431\\u0430\\u0437\\u044b.");
    setStatus("\\u0417\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 ./supabase-config.js, \\u0447\\u0442\\u043e\\u0431\\u044b \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0438\\u0437 \\u0431\\u0430\\u0437\\u044b.", true);
    return;
  }

  if (areBoundsTooWide(bounds)) {
    setStatus("\\u0421\\u043b\\u0438\\u0448\\u043a\\u043e\\u043c \\u0448\\u0438\\u0440\\u043e\\u043a\\u0438\\u0439 \\u043c\\u0430\\u0441\\u0448\\u0442\\u0430\\u0431. \\u041f\\u0440\\u0438\\u0431\\u043b\\u0438\\u0437\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443 \\u0434\\u043e \\u0433\\u043e\\u0440\\u043e\\u0434\\u0430 \\u0438\\u043b\\u0438 \\u0440\\u0430\\u0439\\u043e\\u043d\\u0430 \\u0438 \\u043f\\u043e\\u043f\\u0440\\u043e\\u0431\\u0443\\u0439 \\u0441\\u043d\\u043e\\u0432\\u0430.", true);
    setResultsPanelContext("\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438", "\\u0421\\u043d\\u0430\\u0447\\u0430\\u043b\\u0430 \\u043f\\u0440\\u0438\\u0431\\u043b\\u0438\\u0437\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443 \\u0434\\u043e \\u0433\\u043e\\u0440\\u043e\\u0434\\u0430 \\u0438\\u043b\\u0438 \\u0440\\u0430\\u0439\\u043e\\u043d\\u0430, \\u0447\\u0442\\u043e\\u0431\\u044b \\u043d\\u0435 \\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0441\\u043b\\u0438\\u0448\\u043a\\u043e\\u043c \\u043c\\u043d\\u043e\\u0433\\u043e \\u0442\\u043e\\u0447\\u0435\\u043a.");
    setEmptyResultsState("\\u041f\\u0440\\u0438\\u0431\\u043b\\u0438\\u0437\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443 \\u0438 \\u043d\\u0430\\u0436\\u043c\\u0438 \\u00ab\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443\\u00bb \\u0435\\u0449\\u0451 \\u0440\\u0430\\u0437.");
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

    setStatus(`${statusText} \\u0421\\u0435\\u0439\\u0447\\u0430\\u0441 \\u043d\\u0430 \\u043a\\u0430\\u0440\\u0442\\u0435 ${rows.length} \\u0442\\u043e\\u0447\\u0435\\u043a.`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438.");
    setStatus(`\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438: ${error.message}`, true);
  }
}

async function loadSheltersNearUser(coords) {
  const bounds = getBoundsAroundCoords(coords, DEFAULT_NEARBY_RADIUS_KM);
  await loadSheltersInBounds(bounds, {
    title: "\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0440\\u044f\\u0434\\u043e\\u043c \\u0441 \\u0442\\u043e\\u0431\\u043e\\u0439",
    copy: `\\u041f\\u043e\\u043a\\u0430\\u0437\\u044b\\u0432\\u0430\\u0435\\u043c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u043f\\u0440\\u0438\\u043c\\u0435\\u0440\\u043d\\u043e \\u0432 \\u0440\\u0430\\u0434\\u0438\\u0443\\u0441\\u0435 ${DEFAULT_NEARBY_RADIUS_KM} \\u043a\\u043c \\u043e\\u0442 \\u0442\\u0432\\u043e\\u0435\\u0439 \\u0433\\u0435\\u043e\\u043f\\u043e\\u0437\\u0438\\u0446\\u0438\\u0438.`,
    statusText: "\\u0411\\u043b\\u0438\\u0436\\u0430\\u0439\\u0448\\u0438\\u0435 \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0436\\u0435\\u043d\\u044b.",
    fitToResults: true,
    referenceCoords: coords,
    emptyMessage: "\\u0420\\u044f\\u0434\\u043e\\u043c \\u0441 \\u0442\\u043e\\u0431\\u043e\\u0439 \\u043f\\u043e\\u043a\\u0430 \\u043d\\u0435\\u0442 \\u043f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0451\\u043d\\u043d\\u044b\\u0445 \\u0442\\u043e\\u0447\\u0435\\u043a."
  });
}

async function searchShelters(queryText) {
  const queryValue = String(queryText || "").trim();
  if (!queryValue) {
    setStatus("\\u0412\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u0434\\u043b\\u044f \\u043f\\u043e\\u0438\\u0441\\u043a\\u0430.", true);
    return;
  }

  if (queryValue.length < 2) {
    setStatus("\\u0414\\u043b\\u044f \\u043f\\u043e\\u0438\\u0441\\u043a\\u0430 \\u0432\\u0432\\u0435\\u0434\\u0438 \\u0445\\u043e\\u0442\\u044f \\u0431\\u044b 2 \\u0441\\u0438\\u043c\\u0432\\u043e\\u043b\\u0430.", true);
    return;
  }

  if (!supabase) {
    setEmptyResultsState("\\u0417\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 ./supabase-config.js, \\u0447\\u0442\\u043e\\u0431\\u044b \\u0438\\u0441\\u043a\\u0430\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u043f\\u043e \\u0431\\u0430\\u0437\\u0435.");
    setStatus("\\u0417\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 ./supabase-config.js, \\u0447\\u0442\\u043e\\u0431\\u044b \\u0438\\u0441\\u043a\\u0430\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u043f\\u043e \\u0431\\u0430\\u0437\\u0435.", true);
    return;
  }

  try {
    const escapedQuery = queryValue.replaceAll(",", "\\,");
    const rows = await fetchApprovedShelters((query) => query.ilike("city", `%${escapedQuery}%`));

    shelters = rows;
    renderShelters(rows);
    setResultsPanelContext(
      `\\u0420\\u0435\\u0437\\u0443\\u043b\\u044c\\u0442\\u0430\\u0442\\u044b \\u0434\\u043b\\u044f \\u00ab${queryValue}\\u00bb`,
      "\\u041f\\u043e\\u0438\\u0441\\u043a \\u0440\\u0430\\u0431\\u043e\\u0442\\u0430\\u0435\\u0442 \\u0442\\u043e\\u043b\\u044c\\u043a\\u043e \\u043f\\u043e \\u0433\\u043e\\u0440\\u043e\\u0434\\u0430\\u043c \\u0438\\u0437 \\u0431\\u0430\\u0437\\u044b. \\u041f\\u043e\\u0441\\u043b\\u0435 \\u0432\\u044b\\u0431\\u043e\\u0440\\u0430 \\u0433\\u043e\\u0440\\u043e\\u0434\\u0430 \\u043a\\u0430\\u0440\\u0442\\u0430 \\u043f\\u043e\\u043a\\u0430\\u0437\\u044b\\u0432\\u0430\\u0435\\u0442 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043d\\u044b\\u0435 \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u044d\\u0442\\u043e\\u043c \\u0433\\u043e\\u0440\\u043e\\u0434\\u0435."
    );

    if (!rows.length) {
      setEmptyResultsState(`\\u041f\\u043e \\u0437\\u0430\\u043f\\u0440\\u043e\\u0441\\u0443 \\u00ab${queryValue}\\u00bb \\u043d\\u0438\\u0447\\u0435\\u0433\\u043e \\u043d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e.`);
      setStatus(`\\u041f\\u043e \\u0437\\u0430\\u043f\\u0440\\u043e\\u0441\\u0443 \\u00ab${queryValue}\\u00bb \\u043d\\u0438\\u0447\\u0435\\u0433\\u043e \\u043d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e.`);
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
    setStatus(`\\u041d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e ${rows.length} \\u0442\\u043e\\u0447\\u0435\\u043a \\u043f\\u043e \\u0437\\u0430\\u043f\\u0440\\u043e\\u0441\\u0443 \\u00ab${queryValue}\\u00bb.`);
  } catch (error) {
    shelters = [];
    renderShelters([]);
    setEmptyResultsState("\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u0432\\u044b\\u043f\\u043e\\u043b\\u043d\\u0438\\u0442\\u044c \\u043f\\u043e\\u0438\\u0441\\u043a.");
    setStatus(`\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u0432\\u044b\\u043f\\u043e\\u043b\\u043d\\u0438\\u0442\\u044c \\u043f\\u043e\\u0438\\u0441\\u043a: ${error.message}`, true);
  }
}

async function detectLocation() {
  if (!navigator.geolocation) {
    if (!shelters.length) {
      setResultsPanelContext("\\u0412\\u044b\\u0431\\u0435\\u0440\\u0438 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u044c \\u043f\\u043e\\u0438\\u0441\\u043a\\u0430", "\\u0420\\u0430\\u0437\\u0440\\u0435\\u0448\\u0438 \\u0433\\u0435\\u043e\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044e \\u0438\\u043b\\u0438 \\u0432\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u0432\\u0440\\u0443\\u0447\\u043d\\u0443\\u044e.");
      setEmptyResultsState("\\u0413\\u0435\\u043e\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044f \\u043d\\u0435\\u0434\\u043e\\u0441\\u0442\\u0443\\u043f\\u043d\\u0430. \\u0412\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u0438\\u043b\\u0438 \\u043d\\u0430\\u0436\\u043c\\u0438 \\u00ab\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443\\u00bb \\u043f\\u043e\\u0441\\u043b\\u0435 \\u043f\\u0435\\u0440\\u0435\\u043c\\u0435\\u0449\\u0435\\u043d\\u0438\\u044f \\u043a\\u0430\\u0440\\u0442\\u044b.");
    }
    setStatus("\\u0413\\u0435\\u043e\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044f \\u043d\\u0435 \\u043f\\u043e\\u0434\\u0434\\u0435\\u0440\\u0436\\u0438\\u0432\\u0430\\u0435\\u0442\\u0441\\u044f \\u0431\\u0440\\u0430\\u0443\\u0437\\u0435\\u0440\\u043e\\u043c.", true);
    return;
  }

  setStatus("\\u041e\\u043f\\u0440\\u0435\\u0434\\u0435\\u043b\\u044f\\u0435\\u043c \\u0442\\u0432\\u043e\\u0451 \\u043c\\u0435\\u0441\\u0442\\u043e\\u043f\\u043e\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435...");

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
        setResultsPanelContext("\\u0412\\u044b\\u0431\\u0435\\u0440\\u0438 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u044c \\u043f\\u043e\\u0438\\u0441\\u043a\\u0430", "\\u0420\\u0430\\u0437\\u0440\\u0435\\u0448\\u0438 \\u0433\\u0435\\u043e\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044e \\u0438\\u043b\\u0438 \\u0432\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u0432\\u0440\\u0443\\u0447\\u043d\\u0443\\u044e.");
        setEmptyResultsState("\\u041f\\u043e\\u043a\\u0430 \\u043d\\u0438\\u0447\\u0435\\u0433\\u043e \\u043d\\u0435 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0436\\u0435\\u043d\\u043e. \\u0412\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u043d\\u0430 \\u043a\\u0430\\u0440\\u0442\\u0435 \\u0438\\u043b\\u0438 \\u043f\\u0440\\u0438\\u0431\\u043b\\u0438\\u0437\\u044c \\u0435\\u0451 \\u0438 \\u043d\\u0430\\u0436\\u043c\\u0438 \\u00ab\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443\\u00bb.");
      }
      setStatus(`\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u043e\\u043f\\u0440\\u0435\\u0434\\u0435\\u043b\\u0438\\u0442\\u044c \\u043f\\u043e\\u0437\\u0438\\u0446\\u0438\\u044e: ${error.message}`, true);
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
    throw new Error("\\u0424\\u0430\\u0439\\u043b \\u0441\\u043b\\u0438\\u0448\\u043a\\u043e\\u043c \\u0431\\u043e\\u043b\\u044c\\u0448\\u043e\\u0439. \\u0421\\u0435\\u0439\\u0447\\u0430\\u0441 \\u043b\\u0438\\u043c\\u0438\\u0442 25 \\u041c\\u0411.");
  }

  const extension = sanitizeFilename(file.name).split(".").pop();
  const path = `pending/${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new Error(`\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u0437\\u0430\\u0433\\u0440\\u0443\\u0437\\u0438\\u0442\\u044c \\u0444\\u0430\\u0439\\u043b: ${error.message}`);
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
    setFormMessage("\\u0421\\u043d\\u0430\\u0447\\u0430\\u043b\\u0430 \\u0437\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 ./supabase-config.js \\u0434\\u043b\\u044f \\u043f\\u043e\\u0434\\u043a\\u043b\\u044e\\u0447\\u0435\\u043d\\u0438\\u044f \\u043a \\u0431\\u0430\\u0437\\u0435.", true);
    return;
  }

  const formData = new FormData(suggestForm);
  const coords = getSubmissionCoords();
  const payload = {
    title: String(formData.get("title") || "").trim(),
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    source: "\\u041f\\u043e\\u043b\\u044c\\u0437\\u043e\\u0432\\u0430\\u0442\\u0435\\u043b\\u044c\\u0441\\u043a\\u043e\\u0435 \\u043f\\u0440\\u0435\\u0434\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435",
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
    setFormMessage("\\u0417\\u0430\\u043f\\u043e\\u043b\\u043d\\u0438 \\u043d\\u0430\\u0437\\u0432\\u0430\\u043d\\u0438\\u0435 \\u0442\\u043e\\u0447\\u043a\\u0438.", true);
    return;
  }

  const file = mediaInput.files?.[0] || null;

  try {
    setFormMessage("\\u041e\\u0442\\u043f\\u0440\\u0430\\u0432\\u043b\\u044f\\u0435\\u043c \\u0442\\u043e\\u0447\\u043a\\u0443 \\u043d\\u0430 \\u043c\\u043e\\u0434\\u0435\\u0440\\u0430\\u0446\\u0438\\u044e...");
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
    setStatus("\\u0422\\u043e\\u0447\\u043a\\u0430 \\u043e\\u0442\\u043f\\u0440\\u0430\\u0432\\u043b\\u0435\\u043d\\u0430 \\u043d\\u0430 \\u043f\\u0440\\u043e\\u0432\\u0435\\u0440\\u043a\\u0443. \\u0421\\u043f\\u0430\\u0441\\u0438\\u0431\\u043e.");
  } catch (error) {
    setFormMessage(`\\u041d\\u0435 \\u0443\\u0434\\u0430\\u043b\\u043e\\u0441\\u044c \\u043e\\u0442\\u043f\\u0440\\u0430\\u0432\\u0438\\u0442\\u044c \\u0442\\u043e\\u0447\\u043a\\u0443: ${error.message}`, true);
  }
}

async function handleSearchArea() {
  await loadSheltersInBounds(getBoundsFromMap(), {
    title: "\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438",
    copy: "\\u041f\\u043e\\u043a\\u0430\\u0437\\u044b\\u0432\\u0430\\u0435\\u043c \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0442\\u043e\\u043b\\u044c\\u043a\\u043e \\u0432\\u043d\\u0443\\u0442\\u0440\\u0438 \\u0442\\u0435\\u043a\\u0443\\u0449\\u0435\\u0433\\u043e \\u0443\\u0447\\u0430\\u0441\\u0442\\u043a\\u0430 \\u043a\\u0430\\u0440\\u0442\\u044b. \\u041f\\u0435\\u0440\\u0435\\u043c\\u0435\\u0441\\u0442\\u0438 \\u043a\\u0430\\u0440\\u0442\\u0443 \\u0438 \\u043d\\u0430\\u0436\\u043c\\u0438 \\u043a\\u043d\\u043e\\u043f\\u043a\\u0443 \\u0435\\u0449\\u0451 \\u0440\\u0430\\u0437, \\u0435\\u0441\\u043b\\u0438 \\u0445\\u043e\\u0447\\u0435\\u0448\\u044c \\u0434\\u0440\\u0443\\u0433\\u043e\\u0439 \\u0440\\u0430\\u0439\\u043e\\u043d.",
    statusText: "\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0432 \\u0432\\u044b\\u0431\\u0440\\u0430\\u043d\\u043d\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0436\\u0435\\u043d\\u044b.",
    referenceCoords: getBoundsCenter(getBoundsFromMap()),
    emptyMessage: "\\u0412 \\u044d\\u0442\\u043e\\u0439 \\u043e\\u0431\\u043b\\u0430\\u0441\\u0442\\u0438 \\u043f\\u043e\\u0434\\u0442\\u0432\\u0435\\u0440\\u0436\\u0434\\u0451\\u043d\\u043d\\u044b\\u0445 \\u0442\\u043e\\u0447\\u0435\\u043a \\u043f\\u043e\\u043a\\u0430 \\u043d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e."
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
setResultsPanelContext("\\u0422\\u043e\\u0447\\u043a\\u0438 \\u0440\\u044f\\u0434\\u043e\\u043c \\u0441 \\u0442\\u043e\\u0431\\u043e\\u0439", "\\u041f\\u043e\\u043a\\u0430\\u0437\\u044b\\u0432\\u0430\\u0435\\u043c \\u0431\\u043b\\u0438\\u0436\\u0430\\u0439\\u0448\\u0438\\u0435 \\u0442\\u043e\\u0447\\u043a\\u0438 \\u0438 \\u043a\\u043e\\u0440\\u043e\\u0442\\u043a\\u0443\\u044e \\u0438\\u043d\\u0444\\u043e\\u0440\\u043c\\u0430\\u0446\\u0438\\u044e \\u043e \\u043d\\u0438\\u0445, \\u0447\\u0442\\u043e\\u0431\\u044b \\u043c\\u043e\\u0436\\u043d\\u043e \\u0431\\u044b\\u043b\\u043e \\u0431\\u044b\\u0441\\u0442\\u0440\\u043e \\u0432\\u044b\\u0431\\u0440\\u0430\\u0442\\u044c \\u043f\\u043e\\u0434\\u0445\\u043e\\u0434\\u044f\\u0449\\u0435\\u0435 \\u043c\\u0435\\u0441\\u0442\\u043e.");
setEmptyResultsState("\\u0420\\u0430\\u0437\\u0440\\u0435\\u0448\\u0438 \\u0433\\u0435\\u043e\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044e, \\u0432\\u0432\\u0435\\u0434\\u0438 \\u0433\\u043e\\u0440\\u043e\\u0434 \\u043d\\u0430 \\u043a\\u0430\\u0440\\u0442\\u0435 \\u0438\\u043b\\u0438 \\u043f\\u0440\\u0438\\u0431\\u043b\\u0438\\u0437\\u044c \\u0435\\u0451 \\u0438 \\u043d\\u0430\\u0436\\u043c\\u0438 \\u00ab\\u041e\\u0431\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c \\u043a\\u0430\\u0440\\u0442\\u0443\\u00bb.");
loadCitySuggestions();
detectLocation();





