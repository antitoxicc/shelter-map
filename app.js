import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const MAX_NEARBY = 3;
const MEDIA_BUCKET = "shelter-media";
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000;
const SHELTER_TYPE_LABELS = {
  school: "Ð¨ÐºÐ¾Ð»Ð°",
  hospital: "Ð‘Ð¾Ð»ÑŒÐ½Ð¸Ñ†Ð°",
  synagogue: "Ð¡Ð¸Ð½Ð°Ð³Ð¾Ð³Ð°",
  kindergarten: "Ð”ÐµÑ‚ÑÐºÐ¸Ð¹ ÑÐ°Ð´",
  shopping_center: "Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ñ‹Ð¹ Ñ†ÐµÐ½Ñ‚Ñ€",
  public_shelter: "ÐžÐ±Ñ‹Ñ‡Ð½Ñ‹Ð¹ Ð¼Ð¸ÐºÐ»Ð°Ñ‚ Ð¾Ð±Ñ‰ÐµÑÑ‚Ð²ÐµÐ½Ð½Ñ‹Ð¹",
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
const suggestMapElement = document.getElementById("suggestMap");

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

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let shelters = [];
let shelterMarkers = [];
let userMarker = null;
let userCoords = null;
let suggestMap = null;
let suggestMarker = null;

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

function getShelterTypeLabel(type) {
  return SHELTER_TYPE_LABELS[type] || "Ð¢Ð¸Ð¿ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½";
}

function getLocationVerificationLabel(value) {
  return LOCATION_VERIFICATION_LABELS[value] || "Ð¢Ñ€ÐµÐ±ÑƒÐµÑ‚ Ñ€ÑƒÑ‡Ð½Ð¾Ð¹ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ¸";
}

function renderNearbyCards(points) {
  nearbyCount.textContent = String(points.length);
  if (!points.length) {
    nearbyList.innerHTML = '<p class="empty-state">ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ñ‹.</p>';
    return;
  }

  nearbyList.innerHTML = points.map((point) => {
    const distance = point.distanceMeters ? formatDistance(point.distanceMeters) : "Ð‘ÐµÐ· Ñ€Ð°ÑÑÑ‚Ð¾ÑÐ½Ð¸Ñ";
    const description = String(point.description || "").trim();
    const address = formatAddress(point.address, point.city);
    const source = String(point.source || "").trim();
    const rawVerificationStatus = String(point.location_verification_status || "needs_review").trim().toLowerCase();
    const verificationStatus = rawVerificationStatus === "verified" || rawVerificationStatus === "approximate"
      ? rawVerificationStatus
      : "needs_review";
    const shelterTypeLabel = getShelterTypeLabel(point.shelter_type);
    const verificationLabel = getNormalizedVerificationLabel(verificationStatus);
    const gmUrl = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    const fallbackText = "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾ Ð¸Ð»Ð¸ Ð¿Ð¾ÐºÐ° ÑÐ»Ð¸ÑˆÐºÐ¾Ð¼ Ð¾Ð±Ñ‰ÐµÐµ. Ð¢Ð°ÐºÑƒÑŽ Ñ‚Ð¾Ñ‡ÐºÑƒ Ð»ÑƒÑ‡ÑˆÐµ Ð´Ð¾Ð¿Ð¾Ð»Ð½Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ð¾ Ð¿Ñ€Ð¾Ð²ÐµÑ€Ð¸Ñ‚ÑŒ.";

    return `
      <article class="location-card">
        <h3>${escapeHtml(point.title)}</h3>
        <p>${escapeHtml(description || fallbackText)}</p>
        ${address ? `<div class="meta-line">${escapeHtml(address)}</div>` : ""}
        ${source ? `<div class="meta-line">Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: ${escapeHtml(source)}</div>` : ""}
        <div class="badge-row">
          <span class="distance-badge">${distance}</span>
          <span class="type-badge">${escapeHtml(shelterTypeLabel)}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(verificationLabel)}</span>
        </div>
        <div class="meta-line">${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</div>
        <div class="card-actions">
          <a class="card-link" href="${gmUrl}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Google Maps</a>
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
    const address = formatAddress(point.address, point.city);
    const source = String(point.source || "").trim();
    const rawVerificationStatus = String(point.location_verification_status || "needs_review").trim().toLowerCase();
    const verificationStatus = rawVerificationStatus === "verified" || rawVerificationStatus === "approximate"
      ? rawVerificationStatus
      : "needs_review";
    const mediaLine = point.media_url
      ? `<br /><a href="${point.media_url}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ</a>`
      : "";
    const typeLine = `<br />Ð¢Ð¸Ð¿: ${escapeHtml(getShelterTypeLabel(point.shelter_type))}`;
    const addressLine = address ? `<br />ÐÐ´Ñ€ÐµÑ: ${escapeHtml(address)}` : "";
    const sourceLine = source ? `<br />Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: ${escapeHtml(source)}` : "";
    const verificationLine = `<br />Ð¢Ð¾Ñ‡Ð½Ð¾ÑÑ‚ÑŒ Ð¼ÐµÑÑ‚Ð¾Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ: ${escapeHtml(getNormalizedVerificationLabel(verificationStatus))}`;

    const marker = L.marker([point.latitude, point.longitude], {
      icon: createShelterIcon(verificationStatus)
    })
      .addTo(map)
      .bindPopup(
        `<strong>${escapeHtml(point.title)}</strong>${typeLine}${addressLine}${sourceLine}${verificationLine}<br />${escapeHtml(description || "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾")}<br /><a href="https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}" target="_blank" rel="noreferrer">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Google Maps</a>${mediaLine}`
      );

    shelterMarkers.push(marker);
  });
}

function updateUserMarker(coords) {
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindPopup("Ð¢Ñ‹ Ð·Ð´ÐµÑÑŒ");
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
  if (suggestMarker) {
    const coords = suggestMarker.getLatLng();
    return {
      lat: coords.lat,
      lng: coords.lng,
      sourceLabel: "Ð¿Ð¾ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ Ñ‚Ð¾Ñ‡ÐºÐµ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ"
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
      icon: userIcon
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
  setSuggestMarker(getSubmissionCoords(), true);
  setTimeout(() => {
    suggestMap?.invalidateSize();
  }, 0);
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
    setStatus("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸ Ð¸Ð· Ð±Ð°Ð·Ñ‹.", true);
    return;
  }

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("shelters")
      .select("id, title, description, address, city, source, shelter_type, location_verification_status, latitude, longitude, status, media_url, media_type")
      .eq("status", "approved")
      .range(from, to);

    if (error) {
      renderShelters([]);
      renderNearbyCards([]);
      setStatus(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸: ${error.message}`, true);
      return;
    }

    rows.push(...(data || []));

    if (!data || data.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  shelters = rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));

  renderShelters(shelters);

  if (userCoords) {
    const nearby = sortByDistance(shelters, userCoords);
    renderNearbyCards(nearby);
    fitMapToUserAndNearby(nearby);
    setStatus(`ÐÐ°Ð¹Ð´ÐµÐ½Ð¾ ${nearby.length} Ð±Ð»Ð¸Ð¶Ð°Ð¹ÑˆÐ¸Ñ… Ñ‚Ð¾Ñ‡ÐµÐº.`);
    return;
  }

  renderNearbyCards([]);
  setStatus("Ð¢Ð¾Ñ‡ÐºÐ¸ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ñ‹. ÐÐ°Ð¶Ð¼Ð¸ ÐºÐ½Ð¾Ð¿ÐºÑƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚ÑŒ Ð±Ð»Ð¸Ð¶Ð°Ð¹ÑˆÐ¸Ðµ Ðº Ñ‚ÐµÐ±Ðµ.");
}

async function detectLocation() {
  if (!navigator.geolocation) {
    setStatus("Ð“ÐµÐ¾Ð»Ð¾ÐºÐ°Ñ†Ð¸Ñ Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÑ‚ÑÑ Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ð¾Ð¼.", true);
    return;
  }

  setStatus("ÐžÐ¿Ñ€ÐµÐ´ÐµÐ»ÑÐµÐ¼ Ñ‚Ð²Ð¾Ñ‘ Ð¼ÐµÑÑ‚Ð¾Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
      updateUserMarker(userCoords);
      if (!suggestMarker && !suggestModal.hidden) {
        setSuggestMarker(userCoords, true);
      }
      updateLocationHint();

      if (!shelters.length) {
        map.setView([userCoords.lat, userCoords.lng], 14);
        setStatus("Ð“ÐµÐ¾Ð¿Ð¾Ð·Ð¸Ñ†Ð¸Ñ Ð¾Ð¿Ñ€ÐµÐ´ÐµÐ»ÐµÐ½Ð°. Ð—Ð°Ð³Ñ€ÑƒÐ¶Ð°ÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÐ¸...");
        await loadApprovedShelters();
        return;
      }

      const nearby = sortByDistance(shelters, userCoords);
      renderNearbyCards(nearby);
      fitMapToUserAndNearby(nearby);
      setStatus(`ÐŸÐ¾Ð·Ð¸Ñ†Ð¸Ñ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð°. ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÑŽ ${nearby.length} Ð±Ð»Ð¸Ð¶Ð°Ð¹ÑˆÐ¸Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸.`);
    },
    (error) => {
      setStatus(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ð¿Ñ€ÐµÐ´ÐµÐ»Ð¸Ñ‚ÑŒ Ð¿Ð¾Ð·Ð¸Ñ†Ð¸ÑŽ: ${error.message}`, true);
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
    address: String(formData.get("address") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    source: String(formData.get("source") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    shelter_type: String(formData.get("shelter_type") || "").trim(),
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

  if (!payload.title || !payload.address || !payload.city || !payload.source || !payload.description || !payload.shelter_type) {
    setFormMessage("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ, Ð°Ð´Ñ€ÐµÑ, Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº, Ñ‚Ð¸Ð¿ Ð¸ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ñ‚Ð¾Ñ‡ÐºÐ¸.", true);
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



