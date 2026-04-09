import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const DEFAULT_ADMIN_MAP_ZOOM = 13;
const MEDIA_BUCKET = "shelter-media";
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000;
const MARKER_ICON_BASE_URL = new URL("./", import.meta.url).href;
const MARKER_ICON_TYPES = new Set([
  "building_shelter",
  "hospital",
  "kindergarten",
  "migunit",
  "parking",
  "public_mamad",
  "public_shelter",
  "school",
  "shopping_center",
  "synagogue"
]);

const SHELTER_TYPE_LABELS = {
  school: "\u0428\u043a\u043e\u043b\u0430",
  hospital: "\u0411\u043e\u043b\u044c\u043d\u0438\u0446\u0430",
  synagogue: "\u0421\u0438\u043d\u0430\u0433\u043e\u0433\u0430",
  kindergarten: "\u0414\u0435\u0442\u0441\u043a\u0438\u0439 \u0441\u0430\u0434",
  shopping_center: "\u0422\u043e\u0440\u0433\u043e\u0432\u044b\u0439 \u0446\u0435\u043d\u0442\u0440",
  public_shelter: "\u041e\u0431\u044b\u0447\u043d\u044b\u0439 \u043c\u0438\u043a\u043b\u0430\u0442 \u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439",
  parking: "Parking",
  migunit: "\u041c\u0438\u0433\u0443\u043d\u0438\u0442",
  building_shelter: "\u041c\u0438\u043a\u043b\u0430\u0442 \u0432 \u0434\u043e\u043c\u0435",
  public_mamad: "\u041c\u0410\u041c\u0410\u0414 \u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439"
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
const createShelterBtn = document.getElementById("createShelterBtn");

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let adminMap = null;
let adminMarkers = [];
let allShelters = [];
let selectedShelterId = null;
let currentMapFilter = "all";
let hasFitMapToData = false;
let isAuthenticated = false;
let isCreatingShelter = false;
let newShelterDraft = null;
let draftMarker = null;

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
    throw new Error("\u0424\u0430\u0439\u043b \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439. \u0421\u0435\u0439\u0447\u0430\u0441 \u043b\u0438\u043c\u0438\u0442 25 \u041c\u0411.");
  }

  const extension = sanitizeFilename(file.name).split(".").pop();
  const path = `admin/${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new Error(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(data.path);
  return {
    media_url: publicUrlData.publicUrl,
    media_type: file.type || null,
    media_name: file.name || null
  };
}

function getShelterTypeLabel(type) {
  return SHELTER_TYPE_LABELS[type] || "\u0422\u0438\u043f \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d";
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
    return "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e";
  }
  if (normalizedValue === "approximate") {
    return "\u0421\u043a\u043e\u0440\u0435\u0435 \u0432\u0441\u0435\u0433\u043e \u0432\u0435\u0440\u043d\u043e";
  }

  return "\u041d\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e";
}

function getShelterById(id) {
  return allShelters.find((row) => row.id === id) || null;
}

function setFilterButtonState() {
  mapFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mapFilter === currentMapFilter);
  });
}

function setCreateButtonState() {
  if (!createShelterBtn) {
    return;
  }

  createShelterBtn.classList.toggle("is-active", isCreatingShelter);
  createShelterBtn.textContent = isCreatingShelter ? "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435" : "\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430";
}

function createEmptyShelterDraft(latitude = DEFAULT_CENTER[0], longitude = DEFAULT_CENTER[1]) {
  return {
    title: "",
    address: "",
    city: "",
    source: "\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0447\u0435\u0440\u0435\u0437 \u0430\u0434\u043c\u0438\u043d\u043a\u0443",
    description: "",
    shelter_type: "",
    location_verification_status: "needs_review",
    latitude,
    longitude,
    submitter_name: "",
    submitter_contact: "",
    media_url: null,
    media_name: null,
    status: "pending"
  };
}

function updateDraftCoordinates(lat, lng, options = {}) {
  if (!newShelterDraft || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  newShelterDraft.latitude = lat;
  newShelterDraft.longitude = lng;
  updateActiveCoordsInputs(lat, lng);

  if (options.render !== false) {
    renderAdminMap();
  }

  if (options.center !== false && adminMap) {
    adminMap.setView([lat, lng], Math.max(adminMap.getZoom(), 15));
  }
}

function startCreateShelter(latlng) {
  if (!supabase) {
    setAuthMessage("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043d\u0430\u0441\u0442\u0440\u043e\u0439 Supabase \u0432 ./supabase-config.js.", true);
    return;
  }

  if (!isAuthenticated) {
    setAuthMessage("\u0412\u043e\u0439\u0434\u0438 \u043a\u0430\u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440, \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c \u043d\u043e\u0432\u044b\u0435 \u0442\u043e\u0447\u043a\u0438.", true);
    return;
  }

  const latitude = Number.isFinite(latlng?.lat) ? latlng.lat : adminMap?.getCenter().lat ?? DEFAULT_CENTER[0];
  const longitude = Number.isFinite(latlng?.lng) ? latlng.lng : adminMap?.getCenter().lng ?? DEFAULT_CENTER[1];

  selectedShelterId = null;
  isCreatingShelter = true;
  newShelterDraft = createEmptyShelterDraft(latitude, longitude);
  setCreateButtonState();
  renderLists();
  renderSelectedShelterPanel();
  renderAdminMap();

  if (adminMap) {
    adminMap.setView([latitude, longitude], Math.max(adminMap.getZoom(), 15));
  }
}

function cancelCreateShelter() {
  isCreatingShelter = false;
  newShelterDraft = null;
  setCreateButtonState();
  renderSelectedShelterPanel();
  renderAdminMap();
}

function getFilteredShelters() {
  if (currentMapFilter === "all") {
    return allShelters;
  }

  return allShelters.filter((row) => row.status === currentMapFilter);
}

function getMarkerIconPath(shelterType, verificationStatus) {
  const normalizedType = String(shelterType || "").trim().toLowerCase();
  if (!MARKER_ICON_TYPES.has(normalizedType)) {
    return null;
  }

  return new URL(`${normalizedType}-${getNormalizedVerificationStatus(verificationStatus)}.png`, MARKER_ICON_BASE_URL).href;
}

function createMarkerIcon(shelterType, status, isSelected) {
  const normalizedStatus = getNormalizedVerificationStatus(status);
  const iconPath = getMarkerIconPath(shelterType, status);
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

  if (iconPath) {
    return L.divIcon({
      className: "custom-marker",
      html: `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;"><img src="${iconPath}" alt="" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 8px 16px rgba(20,24,28,0.22));${isSelected ? "box-shadow:0 0 0 6px rgba(31,111,235,0.18);border-radius:999px;" : ""}" /></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 40],
      popupAnchor: [0, -30]
    });
  }

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

  adminMap.on("click", (event) => {
    if (!isCreatingShelter) {
      return;
    }

    updateDraftCoordinates(event.latlng.lat, event.latlng.lng);
  });

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
  if (draftMarker) {
    draftMarker.remove();
    draftMarker = null;
  }

  const visibleShelters = getFilteredShelters();
  visibleShelters.forEach((row) => {
    const isSelected = row.id === selectedShelterId;
    const marker = L.marker([row.latitude, row.longitude], {
      icon: createMarkerIcon(row.shelter_type, row.location_verification_status, isSelected),
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
      <br />\u0421\u0442\u0430\u0442\u0443\u0441: ${escapeHtml(row.status)}
      <br /><button type="button" class="admin-popup-button" data-action="select-from-popup" data-id="${escapeHtml(row.id)}">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0432 \u043f\u0430\u043d\u0435\u043b\u0438</button>
    `);

    adminMarkers.push(marker);
  });

  if (isCreatingShelter && newShelterDraft) {
    draftMarker = L.marker([newShelterDraft.latitude, newShelterDraft.longitude], {
      icon: createMarkerIcon(newShelterDraft.shelter_type, newShelterDraft.location_verification_status, true),
      draggable: true
    }).addTo(adminMap);

    draftMarker.on("dragend", () => {
      const { lat, lng } = draftMarker.getLatLng();
      updateDraftCoordinates(lat, lng, { render: false, center: false });
    });

    draftMarker.bindPopup(`
      <strong>\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430</strong>
      <br />\u041a\u043b\u0438\u043a\u043d\u0438 \u043f\u043e \u043a\u0430\u0440\u0442\u0435 \u0438\u043b\u0438 \u043f\u0435\u0440\u0435\u0442\u0430\u0449\u0438 \u043c\u0430\u0440\u043a\u0435\u0440
      <br />\u0438 \u0437\u0430\u0442\u0435\u043c \u0437\u0430\u043f\u043e\u043b\u043d\u0438 \u0444\u043e\u0440\u043c\u0443 \u0441\u043f\u0440\u0430\u0432\u0430.
    `);
  }

  if (!visibleShelters.length) {
    if (isCreatingShelter && newShelterDraft) {
      adminMap.setView([newShelterDraft.latitude, newShelterDraft.longitude], Math.max(adminMap.getZoom(), 15));
    } else {
      adminMap.setView(DEFAULT_CENTER, DEFAULT_ADMIN_MAP_ZOOM);
    }
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
    <option value="verified"${normalizedValue === "verified" ? " selected" : ""}>\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e</option>
    <option value="approximate"${normalizedValue === "approximate" ? " selected" : ""}>\u0421\u043a\u043e\u0440\u0435\u0435 \u0432\u0441\u0435\u0433\u043e \u0432\u0435\u0440\u043d\u043e</option>
    <option value="needs_review"${normalizedValue === "needs_review" ? " selected" : ""}>\u041d\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e</option>
  `;
}

function renderCreateShelterPanel() {
  const row = newShelterDraft || createEmptyShelterDraft();

  selectedShelterPanel.innerHTML = `
    <article class="selected-shelter-card">
      <h3>\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430 \u043d\u0430 \u043a\u0430\u0440\u0442\u0435</h3>
      <p class="panel-copy">\u041a\u043b\u0438\u043a\u043d\u0438 \u043f\u043e \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u043a\u0430\u0440\u0442\u0435 \u0438\u043b\u0438 \u043f\u0435\u0440\u0435\u0442\u0430\u0449\u0438 \u043c\u0430\u0440\u043a\u0435\u0440, \u0437\u0430\u0442\u0435\u043c \u0437\u0430\u043f\u043e\u043b\u043d\u0438 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443 \u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438 \u043d\u043e\u0432\u0443\u044e \u0442\u043e\u0447\u043a\u0443.</p>
      <div class="badge-row">
        <span class="status-badge pending">pending</span>
      </div>
      <form class="admin-edit-form selected-edit-form" data-create-form="true">
        <label>
          \u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435
          <input name="title" value="${escapeHtml(row.title || "")}" maxlength="120" required />
        </label>
        <label>
          \u0410\u0434\u0440\u0435\u0441
          <input name="address" value="${escapeHtml(row.address || "")}" maxlength="200" required />
        </label>
        <label>
          \u0413\u043e\u0440\u043e\u0434
          <input name="city" value="${escapeHtml(row.city || "")}" maxlength="120" required />
        </label>
        <label>
          \u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a
          <input name="source" value="${escapeHtml(row.source || "")}" maxlength="200" required />
        </label>
        <label>
          \u0422\u0438\u043f \u0442\u043e\u0447\u043a\u0438
          <select name="shelter_type" required>
            <option value="">\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e</option>
            ${renderTypeOptions(row.shelter_type || "")}
          </select>
        </label>
        <label>
          \u0422\u043e\u0447\u043d\u043e\u0441\u0442\u044c \u043c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u044f
          <select name="location_verification_status" required>
            ${renderLocationVerificationOptions(row.location_verification_status)}
          </select>
        </label>
        <label>
          \u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435
          <textarea name="description" rows="5" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
        </label>
        <div class="grid-two">
          <label>
            \u0428\u0438\u0440\u043e\u0442\u0430
            <input name="latitude" value="${escapeHtml(row.latitude)}" inputmode="decimal" required />
          </label>
          <label>
            \u0414\u043e\u043b\u0433\u043e\u0442\u0430
            <input name="longitude" value="${escapeHtml(row.longitude)}" inputmode="decimal" required />
          </label>
        </div>
        <p class="form-hint">\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u0441\u043e \u0441\u0442\u0430\u0442\u0443\u0441\u043e\u043c pending. \u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u0435\u0451 \u043c\u043e\u0436\u043d\u043e \u0431\u0443\u0434\u0435\u0442 \u0441\u0440\u0430\u0437\u0443 \u043e\u0442\u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0438\u043b\u0438 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c.</p>
        <div class="grid-two">
          <label>
            \u0418\u043c\u044f
            <input name="submitter_name" value="${escapeHtml(row.submitter_name || "")}" maxlength="80" />
          </label>
          <label>
            \u041a\u043e\u043d\u0442\u0430\u043a\u0442
            <input name="submitter_contact" value="${escapeHtml(row.submitter_contact || "")}" maxlength="120" />
          </label>
        </div>
        <label>
          \u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435
          <input name="media" type="file" accept="image/*,video/*" />
        </label>
        <div class="card-actions">
          <button class="card-button approve" type="submit">\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0442\u043e\u0447\u043a\u0443</button>
          <button class="card-button" type="button" data-action="cancel-create">\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c</button>
        </div>
      </form>
    </article>
  `;
}

function renderSelectedShelterPanel() {
  if (!supabase) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438 `./supabase-config.js`, \u0447\u0442\u043e\u0431\u044b \u043a\u0430\u0440\u0442\u0430 \u0430\u0434\u043c\u0438\u043d\u043a\u0438 \u0437\u0430\u0440\u0430\u0431\u043e\u0442\u0430\u043b\u0430.</p>';
    return;
  }

  if (!isAuthenticated) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">\u0412\u043e\u0439\u0434\u0438 \u043a\u0430\u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0430\u0440\u0442\u0443 \u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u0438, \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u0447\u043a\u0438 \u0438 \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435.</p>';
    return;
  }

  if (isCreatingShelter) {
    renderCreateShelterPanel();
    return;
  }

  const row = getShelterById(selectedShelterId);
  if (!row) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">\u0412\u044b\u0431\u0435\u0440\u0438 \u0442\u043e\u0447\u043a\u0443 \u043d\u0430 \u043a\u0430\u0440\u0442\u0435 \u0438\u043b\u0438 \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430 \u043d\u0438\u0436\u0435 \u043b\u0438\u0431\u043e \u043d\u0430\u0436\u043c\u0438 "\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430", \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0443\u0431\u0435\u0436\u0438\u0449\u0435 \u0432\u0440\u0443\u0447\u043d\u0443\u044e.</p>';
    return;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
  const mediaBlock = row.media_url
    ? `<div class="meta-line">\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435: <a class="media-link" href="${escapeHtml(row.media_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.media_name || "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435")}</a></div>`
    : '<div class="meta-line">\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435: \u043d\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e</div>';

  selectedShelterPanel.innerHTML = `
    <article class="selected-shelter-card">
      <h3>${escapeHtml(row.title)}</h3>
      <div class="badge-row">
        <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
        <span class="verification-badge ${escapeHtml(getNormalizedVerificationStatus(row.location_verification_status))}">${escapeHtml(getVerificationLabel(row.location_verification_status))}</span>
        <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
      </div>
      <div class="meta-line">\u0410\u0434\u0440\u0435\u0441: ${escapeHtml(formatAddress(row.address, row.city) || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
      <div class="meta-line">\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ${escapeHtml(row.source || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
      <div class="meta-line">\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b: ${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}</div>
      <div class="meta-line">\u0414\u043e\u0431\u0430\u0432\u0438\u043b: ${escapeHtml(row.submitter_name || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e")}</div>
      <div class="meta-line">\u041a\u043e\u043d\u0442\u0430\u043a\u0442: ${escapeHtml(row.submitter_contact || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
      ${mediaBlock}
      <div class="card-actions">
        <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
        <button class="card-button" type="button" data-action="focus-selected-map">\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043d\u0430 \u043a\u0430\u0440\u0442\u0435</button>
      </div>
      <form class="admin-edit-form selected-edit-form" data-selected-edit-form="${escapeHtml(row.id)}">
        <label>
          \u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435
          <input name="title" value="${escapeHtml(row.title || "")}" maxlength="120" required />
        </label>
        <label>
          \u0410\u0434\u0440\u0435\u0441
          <input name="address" value="${escapeHtml(row.address || "")}" maxlength="200" required />
        </label>
        <label>
          \u0413\u043e\u0440\u043e\u0434
          <input name="city" value="${escapeHtml(row.city || "")}" maxlength="120" required />
        </label>
        <label>
          \u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a
          <input name="source" value="${escapeHtml(row.source || "")}" maxlength="200" required />
        </label>
        <label>
          \u0422\u0438\u043f \u0442\u043e\u0447\u043a\u0438
          <select name="shelter_type" required>
            <option value="">\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e</option>
            ${renderTypeOptions(row.shelter_type || "")}
          </select>
        </label>
        <label>
          \u0422\u043e\u0447\u043d\u043e\u0441\u0442\u044c \u043c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u044f
          <select name="location_verification_status" required>
            ${renderLocationVerificationOptions(row.location_verification_status)}
          </select>
        </label>
        <label>
          \u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435
          <textarea name="description" rows="5" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
        </label>
        <div class="grid-two">
          <label>
            \u0428\u0438\u0440\u043e\u0442\u0430
            <input name="latitude" value="${escapeHtml(row.latitude)}" inputmode="decimal" required />
          </label>
          <label>
            \u0414\u043e\u043b\u0433\u043e\u0442\u0430
            <input name="longitude" value="${escapeHtml(row.longitude)}" inputmode="decimal" required />
          </label>
        </div>
        <p class="form-hint">\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043c\u0430\u0440\u043a\u0435\u0440 \u043d\u0430 \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u043a\u0430\u0440\u0442\u0435 \u0438\u043b\u0438 \u043f\u043e\u043f\u0440\u0430\u0432\u044c \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0432\u0440\u0443\u0447\u043d\u0443\u044e.</p>
        <div class="grid-two">
          <label>
            \u0418\u043c\u044f
            <input name="submitter_name" value="${escapeHtml(row.submitter_name || "")}" maxlength="80" />
          </label>
          <label>
            \u041a\u043e\u043d\u0442\u0430\u043a\u0442
            <input name="submitter_contact" value="${escapeHtml(row.submitter_contact || "")}" maxlength="120" />
          </label>
        </div>
        <label>
          \u041d\u043e\u0432\u043e\u0435 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435
          <input name="media" type="file" accept="image/*,video/*" />
        </label>
        <p class="form-hint">\u0415\u0441\u043b\u0438 \u0432\u044b\u0431\u0440\u0430\u0442\u044c \u0444\u0430\u0439\u043b, \u043e\u043d \u0437\u0430\u043c\u0435\u043d\u0438\u0442 \u0442\u0435\u043a\u0443\u0449\u0435\u0435 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0443 \u044d\u0442\u043e\u0439 \u0442\u043e\u0447\u043a\u0438.</p>
        <div class="card-actions">
          <button class="card-button approve" type="submit">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button>
          ${row.status === "pending" ? `<button class="card-button approve" type="button" data-action="approve" data-id="${escapeHtml(row.id)}">\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c</button>` : ""}
          <button class="card-button delete" type="button" data-action="delete" data-id="${escapeHtml(row.id)}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>
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
        <p>${escapeHtml(row.description || "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e")}</p>
        <div class="badge-row">
          <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(getVerificationLabel(verificationStatus))}</span>
          <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
        </div>
        <div class="meta-line">\u0410\u0434\u0440\u0435\u0441: ${escapeHtml(formatAddress(row.address, row.city) || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
        <div class="meta-line">\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ${escapeHtml(row.source || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
        <div class="meta-line">\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b: ${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</div>
        <div class="meta-line">\u0414\u043e\u0431\u0430\u0432\u0438\u043b: ${escapeHtml(row.submitter_name || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e")}</div>
        <div class="meta-line">\u041a\u043e\u043d\u0442\u0430\u043a\u0442: ${escapeHtml(row.submitter_contact || "\u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
        <div class="card-actions">
          <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
          <button class="card-button" data-action="edit" data-id="${escapeHtml(row.id)}" type="button">\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043d\u0430 \u043a\u0430\u0440\u0442\u0435</button>
          ${options.includeApprove ? `<button class="card-button approve" data-action="approve" data-id="${escapeHtml(row.id)}" type="button">\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c</button>` : ""}
          <button class="card-button delete" data-action="delete" data-id="${escapeHtml(row.id)}" type="button">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>
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

  renderCards(pendingList, pending, { includeApprove: true, emptyMessage: "\u041d\u0435\u0442 pending-\u0442\u043e\u0447\u0435\u043a." });
  renderCards(approvedList, approved, { includeApprove: false, emptyMessage: "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442." });
}

function updateActiveCoordsInputs(lat, lng) {
  const latInput = selectedShelterPanel.querySelector('input[name="latitude"]');
  const lngInput = selectedShelterPanel.querySelector('input[name="longitude"]');

  if (!latInput || !lngInput || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  latInput.value = lat.toFixed(7);
  lngInput.value = lng.toFixed(7);
}

function syncActiveMarkerFromInputs() {
  if (!adminMap) {
    return;
  }

  const latInput = selectedShelterPanel.querySelector('input[name="latitude"]');
  const lngInput = selectedShelterPanel.querySelector('input[name="longitude"]');
  const nextLat = Number(String(latInput?.value || "").replace(",", "."));
  const nextLng = Number(String(lngInput?.value || "").replace(",", "."));

  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
    return;
  }

  if (isCreatingShelter && newShelterDraft) {
    updateDraftCoordinates(nextLat, nextLng, { center: false });
    return;
  }

  if (!selectedShelterId) {
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

  isCreatingShelter = false;
  newShelterDraft = null;
  selectedShelterId = id;
  setCreateButtonState();
  renderLists();
  renderSelectedShelterPanel();
  renderAdminMap();

  if (options.center !== false && adminMap) {
    adminMap.setView([nextShelter.latitude, nextShelter.longitude], Math.max(adminMap.getZoom(), 15));
  }
}

async function loadShelters() {
  if (!supabase) {
    setAuthMessage("\u0417\u0430\u043f\u043e\u043b\u043d\u0438 ./supabase-config.js, \u0447\u0442\u043e\u0431\u044b \u0430\u0434\u043c\u0438\u043d\u043a\u0430 \u0437\u0430\u0440\u0430\u0431\u043e\u0442\u0430\u043b\u0430.", true);
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
      setAuthMessage(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0442\u043e\u0447\u043a\u0438: ${error.message}`, true);
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
  if (draftMarker) {
    draftMarker.remove();
    draftMarker = null;
  }
  isAuthenticated = false;
  isCreatingShelter = false;
  newShelterDraft = null;
  selectedShelterId = null;
  allShelters = [];
  hasFitMapToData = false;
  setCreateButtonState();
  selectedShelterPanel.innerHTML = '<p class="empty-state">\u0412\u043e\u0439\u0434\u0438 \u043a\u0430\u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0430\u0440\u0442\u0443 \u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u0438 \u0438 \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0442\u043e\u0447\u0435\u043a.</p>';
  pendingList.innerHTML = '<p class="empty-state">\u0412\u043e\u0439\u0434\u0438 \u043a\u0430\u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u044e.</p>';
  approvedList.innerHTML = '<p class="empty-state">\u041f\u043e\u0441\u043b\u0435 \u0432\u0445\u043e\u0434\u0430 \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0441\u043f\u0438\u0441\u043e\u043a \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a.</p>';
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

  isAuthenticated = true;
  setCreateButtonState();
  sessionBadge.textContent = session.user.email || "admin";
  await loadShelters();
}

async function handleLogin(event) {
  event.preventDefault();

  if (!supabase) {
    setAuthMessage("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043d\u0430\u0441\u0442\u0440\u043e\u0439 Supabase \u0432 ./supabase-config.js.", true);
    return;
  }

  setAuthMessage("\u0412\u0445\u043e\u0434\u0438\u043c...");
  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });

  if (error) {
    setAuthMessage(`\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0445\u043e\u0434\u0430: ${error.message}`, true);
    return;
  }

  passwordInput.value = "";
  setAuthMessage("\u0412\u0445\u043e\u0434 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d.");
  await refreshSession();
}

async function handleLogout() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
  setAuthMessage("\u0421\u0435\u0441\u0441\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430.");
  await refreshSession();
}

async function moderateShelter(id, action) {
  if (!supabase) {
    return;
  }

  setAuthMessage(action === "approve" ? "\u041f\u0443\u0431\u043b\u0438\u043a\u0443\u0435\u043c \u0442\u043e\u0447\u043a\u0443..." : "\u0423\u0434\u0430\u043b\u044f\u0435\u043c \u0442\u043e\u0447\u043a\u0443...");

  const response = action === "approve"
    ? await supabase.from("shelters").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("shelters").delete().eq("id", id);

  if (response.error) {
    setAuthMessage(`\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c: ${response.error.message}`, true);
    return;
  }

  if (action === "delete" && selectedShelterId === id) {
    selectedShelterId = null;
  }

  setAuthMessage(action === "approve" ? "\u0422\u043e\u0447\u043a\u0430 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u0430." : "\u0422\u043e\u0447\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0430.");
  await loadShelters();
}

async function saveShelterEdits(form) {
  if (!supabase) {
    return;
  }

  const isCreateForm = form.hasAttribute("data-create-form");
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
    setAuthMessage("\u0414\u043b\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043d\u0443\u0436\u043d\u044b \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435, \u0430\u0434\u0440\u0435\u0441, \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a, \u0442\u0438\u043f, \u0442\u043e\u0447\u043d\u043e\u0441\u0442\u044c \u043c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435.", true);
    return;
  }

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    setAuthMessage("\u0414\u043b\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043d\u0443\u0436\u043d\u044b \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u044b \u0448\u0438\u0440\u043e\u0442\u044b \u0438 \u0434\u043e\u043b\u0433\u043e\u0442\u044b.", true);
    return;
  }

  try {
    setAuthMessage(file
      ? isCreateForm
        ? "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438 \u0441\u043e\u0437\u0434\u0430\u0451\u043c \u0442\u043e\u0447\u043a\u0443..."
        : "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f..."
      : isCreateForm
        ? "\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u043d\u043e\u0432\u0443\u044e \u0442\u043e\u0447\u043a\u0443..."
        : "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f...");
    if (file) {
      const mediaPayload = await uploadMediaFile(file);
      Object.assign(payload, mediaPayload);
    }

    if (isCreateForm) {
      const { data, error } = await supabase
        .from("shelters")
        .insert({
          ...payload,
          status: "pending"
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      selectedShelterId = data?.id || null;
      isCreatingShelter = false;
      newShelterDraft = null;
      setCreateButtonState();
    } else {
      const { error } = await supabase.from("shelters").update(payload).eq("id", shelterId);
      if (error) {
        throw new Error(error.message);
      }

      selectedShelterId = shelterId;
    }
  } catch (error) {
    setAuthMessage(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0440\u0430\u0432\u043a\u0438: ${error.message}`, true);
    return;
  }

  setAuthMessage(isCreateForm ? "\u041d\u043e\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0430." : "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b.");
  await loadShelters();
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);
createShelterBtn?.addEventListener("click", () => {
  if (isCreatingShelter) {
    cancelCreateShelter();
    return;
  }

  startCreateShelter();
});

mapFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentMapFilter = button.dataset.mapFilter || "all";
    hasFitMapToData = false;
    setFilterButtonState();
    renderAdminMap();
  });
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-selected-edit-form], [data-edit-form], [data-create-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  await saveShelterEdits(form);
});

document.addEventListener("input", (event) => {
  const field = event.target;
  if (!field.closest("[data-selected-edit-form], [data-create-form]")) {
    return;
  }

  if (field.name === "latitude" || field.name === "longitude") {
    syncActiveMarkerFromInputs();
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

  if (button.dataset.action === "cancel-create") {
    cancelCreateShelter();
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
setCreateButtonState();
initAdminMap();
renderSelectedShelterPanel();
refreshSession();







