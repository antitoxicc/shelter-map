import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const DEFAULT_ADMIN_MAP_ZOOM = 13;
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

const authMessage = document.getElementById("authMessage");
const sessionBadge = document.getElementById("sessionBadge");
const pendingList = document.getElementById("pendingList");
const approvedList = document.getElementById("approvedList");
const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const adminMapElement = document.getElementById("adminMap");
const selectedShelterPanel = document.getElementById("selectedShelterPanel");
const mapFilterButtons = Array.from(document.querySelectorAll("[data-map-filter]"));

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let adminMap = null;
let adminMarkers = [];
let allShelters = [];
let selectedShelterId = null;
let currentMapFilter = "all";
let hasFitMapToData = false;

function formatAddress(address, city) {
  const addressText = String(address || "").trim();
  const cityText = String(city || "").trim();

  if (addressText && cityText) {
    return `${addressText}, ${cityText}`;
  }

  return addressText || cityText;
}

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "var(--danger)" : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  const path = `admin/${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
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

function getShelterTypeLabel(type) {
  return SHELTER_TYPE_LABELS[type] || "Ð¢Ð¸Ð¿ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½";
}

function getNormalizedVerificationStatus(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "verified" || normalizedValue === "approximate") {
    return normalizedValue;
  }

  return "needs_review";
}

function getVerificationLabel(value) {
  const normalizedValue = getNormalizedVerificationStatus(value);
  if (normalizedValue === "verified") {
    return "Подтверждено";
  }
  if (normalizedValue === "approximate") {
    return "Скорее всего верно";
  }

  return "Не проверено";
}

function getShelterById(id) {
  return allShelters.find((row) => row.id === id) || null;
}

function setFilterButtonState() {
  mapFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mapFilter === currentMapFilter);
  });
}

function getFilteredShelters() {
  if (currentMapFilter === "all") {
    return allShelters;
  }

  return allShelters.filter((row) => row.status === currentMapFilter);
}

function createMarkerIcon(status, isSelected) {
  const normalizedStatus = getNormalizedVerificationStatus(status);
  const color = isSelected
    ? "#1f6feb"
    : normalizedStatus === "verified"
      ? "#17594a"
      : normalizedStatus === "approximate"
        ? "#b78103"
        : "#c84b31";
  const halo = isSelected
    ? "0 0 0 12px rgba(31,111,235,0.18)"
    : normalizedStatus === "verified"
      ? "0 10px 24px rgba(23,89,74,0.18)"
      : normalizedStatus === "approximate"
        ? "0 10px 24px rgba(183,129,3,0.2)"
        : "0 10px 24px rgba(200,75,49,0.2)";

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fffaf2;box-shadow:${halo};"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -18]
  });
}

function initAdminMap() {
  if (adminMap || !adminMapElement || typeof L === "undefined") {
    return;
  }

  adminMap = L.map(adminMapElement, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ADMIN_MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(adminMap);

  setTimeout(() => {
    adminMap?.invalidateSize();
  }, 0);
}

function clearAdminMarkers() {
  adminMarkers.forEach((marker) => marker.remove());
  adminMarkers = [];
}

function fitMapToShelters(points) {
  if (!adminMap || !points.length) {
    return;
  }

  const bounds = L.latLngBounds(points.map((row) => [row.latitude, row.longitude]));
  adminMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
}

function renderAdminMap() {
  initAdminMap();
  if (!adminMap) {
    return;
  }

  adminMap.invalidateSize();
  clearAdminMarkers();

  const visibleShelters = getFilteredShelters();
  visibleShelters.forEach((row) => {
    const isSelected = row.id === selectedShelterId;
    const marker = L.marker([row.latitude, row.longitude], {
      icon: createMarkerIcon(row.location_verification_status, isSelected),
      draggable: isSelected
    }).addTo(adminMap);

    marker.on("click", () => {
      selectShelter(row.id, { center: false });
    });

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      updateSelectedCoordsInputs(lat, lng);
    });

    marker.bindPopup(`
      <strong>${escapeHtml(row.title)}</strong>
      <br />${escapeHtml(getShelterTypeLabel(row.shelter_type))}
      <br />${escapeHtml(getVerificationLabel(row.location_verification_status))}
      <br />Ð¡Ñ‚Ð°Ñ‚ÑƒÑ: ${escapeHtml(row.status)}
      <br /><button type="button" class="admin-popup-button" data-action="select-from-popup" data-id="${escapeHtml(row.id)}">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð² Ð¿Ð°Ð½ÐµÐ»Ð¸</button>
    `);

    adminMarkers.push(marker);
  });

  if (!visibleShelters.length) {
    adminMap.setView(DEFAULT_CENTER, DEFAULT_ADMIN_MAP_ZOOM);
    return;
  }

  const selectedShelter = visibleShelters.find((row) => row.id === selectedShelterId);
  if (selectedShelter) {
    adminMap.setView([selectedShelter.latitude, selectedShelter.longitude], Math.max(adminMap.getZoom(), 15));
    return;
  }

  if (!hasFitMapToData) {
    fitMapToShelters(visibleShelters);
    hasFitMapToData = true;
  }
}

function renderTypeOptions(selectedType) {
  return Object.entries(SHELTER_TYPE_LABELS)
    .map(([value, label]) => `<option value="${value}"${selectedType === value ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderLocationVerificationOptions(selectedValue) {
  const normalizedValue = getNormalizedVerificationStatus(selectedValue);
  return `
    <option value="verified"${normalizedValue === "verified" ? " selected" : ""}>Подтверждено</option>
    <option value="approximate"${normalizedValue === "approximate" ? " selected" : ""}>Скорее всего верно</option>
    <option value="needs_review"${normalizedValue === "needs_review" ? " selected" : ""}>Не проверено</option>
  `;
}

function renderSelectedShelterPanel() {
  if (!supabase) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð·Ð°Ð¿Ð¾Ð»Ð½Ð¸ `./supabase-config.js`, Ñ‡Ñ‚Ð¾Ð±Ñ‹ ÐºÐ°Ñ€Ñ‚Ð° Ð°Ð´Ð¼Ð¸Ð½ÐºÐ¸ Ð·Ð°Ñ€Ð°Ð±Ð¾Ñ‚Ð°Ð»Ð°.</p>';
    return;
  }

  const row = getShelterById(selectedShelterId);
  if (!row) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ñ‚Ð¾Ñ‡ÐºÑƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ Ð¸Ð»Ð¸ Ð¸Ð· ÑÐ¿Ð¸ÑÐºÐ° Ð½Ð¸Ð¶Ðµ. ÐŸÐ¾ÑÐ»Ðµ Ð²Ñ‹Ð±Ð¾Ñ€Ð° Ð·Ð´ÐµÑÑŒ Ð¿Ð¾ÑÐ²Ð¸Ñ‚ÑÑ Ñ„Ð¾Ñ€Ð¼Ð° Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ñ.</p>';
    return;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
  const mediaBlock = row.media_url
    ? `<div class="meta-line">Ð’Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ: <a class="media-link" href="${escapeHtml(row.media_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.media_name || "ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ")}</a></div>`
    : '<div class="meta-line">Ð’Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ: Ð½Ðµ Ð´Ð¾Ð±Ð°Ð²Ð»ÐµÐ½Ð¾</div>';

  selectedShelterPanel.innerHTML = `
    <article class="selected-shelter-card">
      <h3>${escapeHtml(row.title)}</h3>
      <div class="badge-row">
        <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
        <span class="verification-badge ${escapeHtml(getNormalizedVerificationStatus(row.location_verification_status))}">${escapeHtml(getVerificationLabel(row.location_verification_status))}</span>
        <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
      </div>
      <div class="meta-line">ÐÐ´Ñ€ÐµÑ: ${escapeHtml(formatAddress(row.address, row.city) || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
      <div class="meta-line">Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: ${escapeHtml(row.source || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
      <div class="meta-line">ÐšÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹: ${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}</div>
      <div class="meta-line">Ð”Ð¾Ð±Ð°Ð²Ð¸Ð»: ${escapeHtml(row.submitter_name || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾")}</div>
      <div class="meta-line">ÐšÐ¾Ð½Ñ‚Ð°ÐºÑ‚: ${escapeHtml(row.submitter_contact || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
      ${mediaBlock}
      <div class="card-actions">
        <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
        <button class="card-button" type="button" data-action="focus-selected-map">ÐŸÐ¾ÐºÐ°Ð·Ð°Ñ‚ÑŒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ</button>
      </div>
      <form class="admin-edit-form selected-edit-form" data-selected-edit-form="${escapeHtml(row.id)}">
        <label>
          ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ
          <input name="title" value="${escapeHtml(row.title || "")}" maxlength="120" required />
        </label>
        <label>
          ÐÐ´Ñ€ÐµÑ
          <input name="address" value="${escapeHtml(row.address || "")}" maxlength="200" required />
        </label>
        <label>
          Ð“Ð¾Ñ€Ð¾Ð´
          <input name="city" value="${escapeHtml(row.city || "")}" maxlength="120" required />
        </label>
        <label>
          Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº
          <input name="source" value="${escapeHtml(row.source || "")}" maxlength="200" required />
        </label>
        <label>
          Ð¢Ð¸Ð¿ Ñ‚Ð¾Ñ‡ÐºÐ¸
          <select name="shelter_type" required>
            <option value="">ÐÐµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾</option>
            ${renderTypeOptions(row.shelter_type || "")}
          </select>
        </label>
        <label>
          Ð¢Ð¾Ñ‡Ð½Ð¾ÑÑ‚ÑŒ Ð¼ÐµÑÑ‚Ð¾Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ
          <select name="location_verification_status" required>
            ${renderLocationVerificationOptions(row.location_verification_status)}
          </select>
        </label>
        <label>
          ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ
          <textarea name="description" rows="5" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
        </label>
        <div class="grid-two">
          <label>
            Ð¨Ð¸Ñ€Ð¾Ñ‚Ð°
            <input name="latitude" value="${escapeHtml(row.latitude)}" inputmode="decimal" required />
          </label>
          <label>
            Ð”Ð¾Ð»Ð³Ð¾Ñ‚Ð°
            <input name="longitude" value="${escapeHtml(row.longitude)}" inputmode="decimal" required />
          </label>
        </div>
        <p class="form-hint">ÐŸÐµÑ€ÐµÑ‚Ð°Ñ‰Ð¸ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ñ‹Ð¹ Ð¼Ð°Ñ€ÐºÐµÑ€ Ð½Ð° Ð±Ð¾Ð»ÑŒÑˆÐ¾Ð¹ ÐºÐ°Ñ€Ñ‚Ðµ Ð¸Ð»Ð¸ Ð¿Ð¾Ð¿Ñ€Ð°Ð²ÑŒ ÐºÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹ Ð²Ñ€ÑƒÑ‡Ð½ÑƒÑŽ.</p>
        <div class="grid-two">
          <label>
            Ð˜Ð¼Ñ
            <input name="submitter_name" value="${escapeHtml(row.submitter_name || "")}" maxlength="80" />
          </label>
          <label>
            ÐšÐ¾Ð½Ñ‚Ð°ÐºÑ‚
            <input name="submitter_contact" value="${escapeHtml(row.submitter_contact || "")}" maxlength="120" />
          </label>
        </div>
        <label>
          ÐÐ¾Ð²Ð¾Ðµ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ
          <input name="media" type="file" accept="image/*,video/*" />
        </label>
        <p class="form-hint">Ð•ÑÐ»Ð¸ Ð²Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ñ„Ð°Ð¹Ð», Ð¾Ð½ Ð·Ð°Ð¼ÐµÐ½Ð¸Ñ‚ Ñ‚ÐµÐºÑƒÑ‰ÐµÐµ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ñƒ ÑÑ‚Ð¾Ð¹ Ñ‚Ð¾Ñ‡ÐºÐ¸.</p>
        <div class="card-actions">
          <button class="card-button approve" type="submit">Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ</button>
          ${row.status === "pending" ? `<button class="card-button approve" type="button" data-action="approve" data-id="${escapeHtml(row.id)}">ÐžÐ¿ÑƒÐ±Ð»Ð¸ÐºÐ¾Ð²Ð°Ñ‚ÑŒ</button>` : ""}
          <button class="card-button delete" type="button" data-action="delete" data-id="${escapeHtml(row.id)}">Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ</button>
        </div>
      </form>
    </article>
  `;
}

function renderCards(target, rows, options) {
  if (!rows.length) {
    target.innerHTML = `<p class="empty-state">${options.emptyMessage}</p>`;
    return;
  }

  target.innerHTML = rows.map((row) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
    const verificationStatus = getNormalizedVerificationStatus(row.location_verification_status);
    const isSelected = row.id === selectedShelterId;

    return `
      <article class="location-card${isSelected ? " is-selected" : ""}">
        <h3>${escapeHtml(row.title)}</h3>
        <p>${escapeHtml(row.description || "ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾")}</p>
        <div class="badge-row">
          <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(getVerificationLabel(verificationStatus))}</span>
          <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
        </div>
        <div class="meta-line">ÐÐ´Ñ€ÐµÑ: ${escapeHtml(formatAddress(row.address, row.city) || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
        <div class="meta-line">Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: ${escapeHtml(row.source || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
        <div class="meta-line">ÐšÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹: ${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</div>
        <div class="meta-line">Ð”Ð¾Ð±Ð°Ð²Ð¸Ð»: ${escapeHtml(row.submitter_name || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½Ð¾")}</div>
        <div class="meta-line">ÐšÐ¾Ð½Ñ‚Ð°ÐºÑ‚: ${escapeHtml(row.submitter_contact || "Ð½Ðµ ÑƒÐºÐ°Ð·Ð°Ð½")}</div>
        <div class="card-actions">
          <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
          <button class="card-button" data-action="edit" data-id="${escapeHtml(row.id)}" type="button">Ð’Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ</button>
          ${options.includeApprove ? `<button class="card-button approve" data-action="approve" data-id="${escapeHtml(row.id)}" type="button">ÐžÐ¿ÑƒÐ±Ð»Ð¸ÐºÐ¾Ð²Ð°Ñ‚ÑŒ</button>` : ""}
          <button class="card-button delete" data-action="delete" data-id="${escapeHtml(row.id)}" type="button">Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderLists() {
  const pending = allShelters.filter((row) => row.status === "pending");
  const approved = allShelters.filter((row) => row.status === "approved");

  pendingCount.textContent = String(pending.length);
  approvedCount.textContent = String(approved.length);

  renderCards(pendingList, pending, { includeApprove: true, emptyMessage: "ÐÐµÑ‚ pending-Ñ‚Ð¾Ñ‡ÐµÐº." });
  renderCards(approvedList, approved, { includeApprove: false, emptyMessage: "ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ñ… Ñ‚Ð¾Ñ‡ÐµÐº Ð¿Ð¾ÐºÐ° Ð½ÐµÑ‚." });
}

function updateSelectedCoordsInputs(lat, lng) {
  const latInput = selectedShelterPanel.querySelector('input[name="latitude"]');
  const lngInput = selectedShelterPanel.querySelector('input[name="longitude"]');

  if (!latInput || !lngInput || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  latInput.value = lat.toFixed(7);
  lngInput.value = lng.toFixed(7);
}

function syncSelectedMarkerFromInputs() {
  if (!adminMap || !selectedShelterId) {
    return;
  }

  const latInput = selectedShelterPanel.querySelector('input[name="latitude"]');
  const lngInput = selectedShelterPanel.querySelector('input[name="longitude"]');
  const nextLat = Number(String(latInput?.value || "").replace(",", "."));
  const nextLng = Number(String(lngInput?.value || "").replace(",", "."));

  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
    return;
  }

  const row = getShelterById(selectedShelterId);
  if (!row) {
    return;
  }

  row.latitude = nextLat;
  row.longitude = nextLng;
  renderAdminMap();
}

function selectShelter(id, options = {}) {
  const nextShelter = getShelterById(id);
  if (!nextShelter) {
    return;
  }

  selectedShelterId = id;
  renderLists();
  renderSelectedShelterPanel();
  renderAdminMap();

  if (options.center !== false && adminMap) {
    adminMap.setView([nextShelter.latitude, nextShelter.longitude], Math.max(adminMap.getZoom(), 15));
  }
}

async function loadShelters() {
  if (!supabase) {
    setAuthMessage("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸ ./supabase-config.js, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð°Ð´Ð¼Ð¸Ð½ÐºÐ° Ð·Ð°Ñ€Ð°Ð±Ð¾Ñ‚Ð°Ð»Ð°.", true);
    return;
  }

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("shelters")
      .select("id, title, description, address, city, source, shelter_type, location_verification_status, latitude, longitude, status, submitter_name, submitter_contact, media_url, media_type, media_name, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      setAuthMessage(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ñ‡ÐºÐ¸: ${error.message}`, true);
      return;
    }

    rows.push(...(data || []));

    if (!data || data.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  allShelters = rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  }));

  if (selectedShelterId && !getShelterById(selectedShelterId)) {
    selectedShelterId = null;
  }

  renderLists();
  renderSelectedShelterPanel();
  renderAdminMap();
}

function resetAdminViewForGuest() {
  clearAdminMarkers();
  selectedShelterId = null;
  allShelters = [];
  hasFitMapToData = false;
  selectedShelterPanel.innerHTML = '<p class="empty-state">Ð’Ð¾Ð¹Ð´Ð¸ ÐºÐ°Ðº Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑ‚Ñ€Ð°Ñ‚Ð¾Ñ€, Ñ‡Ñ‚Ð¾Ð±Ñ‹ Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚Ñƒ Ð¼Ð¾Ð´ÐµÑ€Ð°Ñ†Ð¸Ð¸ Ð¸ Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ñ‚Ð¾Ñ‡ÐµÐº.</p>';
  pendingList.innerHTML = '<p class="empty-state">Ð’Ð¾Ð¹Ð´Ð¸ ÐºÐ°Ðº Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑ‚Ñ€Ð°Ñ‚Ð¾Ñ€, Ñ‡Ñ‚Ð¾Ð±Ñ‹ ÑƒÐ²Ð¸Ð´ÐµÑ‚ÑŒ Ð¼Ð¾Ð´ÐµÑ€Ð°Ñ†Ð¸ÑŽ.</p>';
  approvedList.innerHTML = '<p class="empty-state">ÐŸÐ¾ÑÐ»Ðµ Ð²Ñ…Ð¾Ð´Ð° Ð·Ð´ÐµÑÑŒ Ð¿Ð¾ÑÐ²Ð¸Ñ‚ÑÑ ÑÐ¿Ð¸ÑÐ¾Ðº Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´Ñ‘Ð½Ð½Ñ‹Ñ… Ñ‚Ð¾Ñ‡ÐµÐº.</p>';
  pendingCount.textContent = "0";
  approvedCount.textContent = "0";
}

async function refreshSession() {
  if (!supabase) {
    sessionBadge.textContent = "no config";
    renderSelectedShelterPanel();
    return;
  }

  initAdminMap();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    sessionBadge.textContent = "guest";
    resetAdminViewForGuest();
    return;
  }

  sessionBadge.textContent = session.user.email || "admin";
  await loadShelters();
}

async function handleLogin(event) {
  event.preventDefault();

  if (!supabase) {
    setAuthMessage("Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð½Ð°ÑÑ‚Ñ€Ð¾Ð¹ Supabase Ð² ./supabase-config.js.", true);
    return;
  }

  setAuthMessage("Ð’Ñ…Ð¾Ð´Ð¸Ð¼...");
  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });

  if (error) {
    setAuthMessage(`ÐžÑˆÐ¸Ð±ÐºÐ° Ð²Ñ…Ð¾Ð´Ð°: ${error.message}`, true);
    return;
  }

  passwordInput.value = "";
  setAuthMessage("Ð’Ñ…Ð¾Ð´ Ð²Ñ‹Ð¿Ð¾Ð»Ð½ÐµÐ½.");
  await refreshSession();
}

async function handleLogout() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
  setAuthMessage("Ð¡ÐµÑÑÐ¸Ñ Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°.");
  await refreshSession();
}

async function moderateShelter(id, action) {
  if (!supabase) {
    return;
  }

  setAuthMessage(action === "approve" ? "ÐŸÑƒÐ±Ð»Ð¸ÐºÑƒÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÑƒ..." : "Ð£Ð´Ð°Ð»ÑÐµÐ¼ Ñ‚Ð¾Ñ‡ÐºÑƒ...");

  const response = action === "approve"
    ? await supabase.from("shelters").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("shelters").delete().eq("id", id);

  if (response.error) {
    setAuthMessage(`ÐžÐ¿ÐµÑ€Ð°Ñ†Ð¸Ñ Ð½Ðµ ÑƒÐ´Ð°Ð»Ð°ÑÑŒ: ${response.error.message}`, true);
    return;
  }

  if (action === "delete" && selectedShelterId === id) {
    selectedShelterId = null;
  }

  setAuthMessage(action === "approve" ? "Ð¢Ð¾Ñ‡ÐºÐ° Ð¾Ð¿ÑƒÐ±Ð»Ð¸ÐºÐ¾Ð²Ð°Ð½Ð°." : "Ð¢Ð¾Ñ‡ÐºÐ° ÑƒÐ´Ð°Ð»ÐµÐ½Ð°.");
  await loadShelters();
}

async function saveShelterEdits(form) {
  if (!supabase) {
    return;
  }

  const shelterId = form.dataset.selectedEditForm || form.dataset.editForm;
  const formData = new FormData(form);
  const latitude = Number(String(formData.get("latitude") || "").trim().replace(",", "."));
  const longitude = Number(String(formData.get("longitude") || "").trim().replace(",", "."));
  const payload = {
    title: String(formData.get("title") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    source: String(formData.get("source") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    shelter_type: String(formData.get("shelter_type") || "").trim(),
    location_verification_status: getNormalizedVerificationStatus(formData.get("location_verification_status")),
    latitude,
    longitude,
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null
  };
  const file = form.querySelector('input[name="media"]')?.files?.[0] || null;

  if (!payload.title || !payload.address || !payload.city || !payload.source || !payload.description || !payload.shelter_type || !payload.location_verification_status) {
    setAuthMessage("Ð”Ð»Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ Ð½ÑƒÐ¶Ð½Ñ‹ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ, Ð°Ð´Ñ€ÐµÑ, Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº, Ñ‚Ð¸Ð¿, Ñ‚Ð¾Ñ‡Ð½Ð¾ÑÑ‚ÑŒ Ð¼ÐµÑÑ‚Ð¾Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ Ð¸ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ.", true);
    return;
  }

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    setAuthMessage("Ð”Ð»Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ Ð½ÑƒÐ¶Ð½Ñ‹ ÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ñ‹Ðµ ÐºÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹ ÑˆÐ¸Ñ€Ð¾Ñ‚Ñ‹ Ð¸ Ð´Ð¾Ð»Ð³Ð¾Ñ‚Ñ‹.", true);
    return;
  }

  try {
    setAuthMessage(file ? "Ð—Ð°Ð³Ñ€ÑƒÐ¶Ð°ÐµÐ¼ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ð¸ ÑÐ¾Ñ…Ñ€Ð°Ð½ÑÐµÐ¼ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ..." : "Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÑÐµÐ¼ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ...");
    if (file) {
      const mediaPayload = await uploadMediaFile(file);
      Object.assign(payload, mediaPayload);
    }

    const { error } = await supabase.from("shelters").update(payload).eq("id", shelterId);
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    setAuthMessage(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ Ð¿Ñ€Ð°Ð²ÐºÐ¸: ${error.message}`, true);
    return;
  }

  selectedShelterId = shelterId;
  setAuthMessage("Ð˜Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹.");
  await loadShelters();
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);

mapFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentMapFilter = button.dataset.mapFilter || "all";
    hasFitMapToData = false;
    setFilterButtonState();
    renderAdminMap();
  });
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-selected-edit-form], [data-edit-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  await saveShelterEdits(form);
});

document.addEventListener("input", (event) => {
  const field = event.target;
  if (!field.closest("[data-selected-edit-form]")) {
    return;
  }

  if (field.name === "latitude" || field.name === "longitude") {
    syncSelectedMarkerFromInputs();
  }
});

document.addEventListener("click", async (event) => {
  const popupButton = event.target.closest(".admin-popup-button");
  if (popupButton) {
    selectShelter(popupButton.dataset.id);
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "edit" || button.dataset.action === "select-from-popup") {
    selectShelter(button.dataset.id);
    return;
  }

  if (button.dataset.action === "focus-selected-map") {
    const row = getShelterById(selectedShelterId);
    if (row && adminMap) {
      adminMap.setView([row.latitude, row.longitude], Math.max(adminMap.getZoom(), 16));
    }
    return;
  }

  await moderateShelter(button.dataset.id, button.dataset.action);
});

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshSession();
  });
}

window.addEventListener("load", () => {
  adminMap?.invalidateSize();
});

window.addEventListener("resize", () => {
  adminMap?.invalidateSize();
});

setFilterButtonState();
initAdminMap();
renderSelectedShelterPanel();
refreshSession();




