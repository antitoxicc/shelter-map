import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

const DEFAULT_CENTER = [32.0853, 34.7818];
const DEFAULT_ADMIN_MAP_ZOOM = 13;

const SHELTER_TYPE_LABELS = {
  school: "Школа",
  hospital: "Больница",
  synagogue: "Синагога",
  kindergarten: "Детский сад",
  shopping_center: "Торговый центр",
  public_shelter: "Обычный миклат общественный",
  migunit: "Мигунит",
  building_shelter: "Миклат в доме",
  public_mamad: "МАМАД общественный"
};

const LOCATION_VERIFICATION_LABELS = {
  verified: "Подтверждено",
  approximate: "Нужно проверить",
  needs_review: "Нужно проверить"
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

function getShelterTypeLabel(type) {
  return SHELTER_TYPE_LABELS[type] || "Тип не указан";
}

function getLocationVerificationLabel(value) {
  return LOCATION_VERIFICATION_LABELS[value] || "Требует ручной проверки";
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
  const color = isSelected ? "#1f6feb" : status === "verified" ? "#17594a" : "#c84b31";
  const halo = isSelected
    ? "0 0 0 12px rgba(31,111,235,0.18)"
    : status === "verified"
      ? "0 10px 24px rgba(23,89,74,0.18)"
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

    const popupHtml = `
      <strong>${escapeHtml(row.title)}</strong>
      <br />${escapeHtml(getShelterTypeLabel(row.shelter_type))}
      <br />${escapeHtml(getLocationVerificationLabel(row.location_verification_status))}
      <br />Статус: ${escapeHtml(row.status)}
      <br /><button type="button" class="admin-popup-button" data-action="select-from-popup" data-id="${escapeHtml(row.id)}">Открыть в панели</button>
    `;

    marker.bindPopup(popupHtml);
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
  return Object.entries(LOCATION_VERIFICATION_LABELS)
    .map(([value, label]) => `<option value="${value}"${selectedValue === value ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderSelectedShelterPanel() {
  if (!supabase) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">Сначала заполни `./supabase-config.js`, чтобы карта админки заработала.</p>';
    return;
  }

  const row = getShelterById(selectedShelterId);
  if (!row) {
    selectedShelterPanel.innerHTML = '<p class="empty-state">Выбери точку на карте или из списка ниже. После выбора здесь появится форма редактирования.</p>';
    return;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
  const mediaBlock = row.media_url
    ? `<div class="meta-line">Вложение: <a class="media-link" href="${escapeHtml(row.media_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.media_name || "Открыть вложение")}</a></div>`
    : '<div class="meta-line">Вложение: не добавлено</div>';

  selectedShelterPanel.innerHTML = `
    <article class="selected-shelter-card">
      <h3>${escapeHtml(row.title)}</h3>
      <div class="badge-row">
        <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
        <span class="verification-badge ${escapeHtml(row.location_verification_status || "needs_review")}">${escapeHtml(getLocationVerificationLabel(row.location_verification_status))}</span>
        <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
      </div>
      <div class="meta-line">Адрес: ${escapeHtml(row.address || "не указан")}</div>
      <div class="meta-line">Источник: ${escapeHtml(row.source || "не указан")}</div>
      <div class="meta-line">Координаты: ${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}</div>
      <div class="meta-line">Добавил: ${escapeHtml(row.submitter_name || "не указано")}</div>
      <div class="meta-line">Контакт: ${escapeHtml(row.submitter_contact || "не указан")}</div>
      ${mediaBlock}
      <div class="card-actions">
        <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
        <button class="card-button" type="button" data-action="focus-selected-map">Показать на карте</button>
      </div>
      <form class="admin-edit-form selected-edit-form" data-selected-edit-form="${escapeHtml(row.id)}">
        <label>
          Название
          <input name="title" value="${escapeHtml(row.title || "")}" maxlength="120" required />
        </label>
        <label>
          Адрес
          <input name="address" value="${escapeHtml(row.address || "")}" maxlength="200" required />
        </label>
        <label>
          Источник
          <input name="source" value="${escapeHtml(row.source || "")}" maxlength="200" required />
        </label>
        <label>
          Тип точки
          <select name="shelter_type" required>
            <option value="">Не указано</option>
            ${renderTypeOptions(row.shelter_type || "")}
          </select>
        </label>
        <label>
          Точность местоположения
          <select name="location_verification_status" required>
            ${renderLocationVerificationOptions(row.location_verification_status || "needs_review")}
          </select>
        </label>
        <label>
          Описание
          <textarea name="description" rows="5" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
        </label>
        <div class="grid-two">
          <label>
            Широта
            <input name="latitude" value="${escapeHtml(row.latitude)}" inputmode="decimal" required />
          </label>
          <label>
            Долгота
            <input name="longitude" value="${escapeHtml(row.longitude)}" inputmode="decimal" required />
          </label>
        </div>
        <p class="form-hint">Перетащи выбранный маркер на большой карте или поправь координаты вручную.</p>
        <div class="grid-two">
          <label>
            Имя
            <input name="submitter_name" value="${escapeHtml(row.submitter_name || "")}" maxlength="80" />
          </label>
          <label>
            Контакт
            <input name="submitter_contact" value="${escapeHtml(row.submitter_contact || "")}" maxlength="120" />
          </label>
        </div>
        <div class="card-actions">
          <button class="card-button approve" type="submit">Сохранить</button>
          ${row.status === "pending" ? '<button class="card-button approve" type="button" data-action="approve" data-id="' + escapeHtml(row.id) + '">Опубликовать</button>' : ""}
          <button class="card-button delete" type="button" data-action="delete" data-id="${escapeHtml(row.id)}">Удалить</button>
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
    const verificationStatus = String(row.location_verification_status || "needs_review").trim();
    const isSelected = row.id === selectedShelterId;

    return `
      <article class="location-card${isSelected ? " is-selected" : ""}">
        <h3>${escapeHtml(row.title)}</h3>
        <p>${escapeHtml(row.description || "Описание не указано")}</p>
        <div class="badge-row">
          <span class="type-badge">${escapeHtml(getShelterTypeLabel(row.shelter_type))}</span>
          <span class="verification-badge ${escapeHtml(verificationStatus)}">${escapeHtml(getLocationVerificationLabel(verificationStatus))}</span>
          <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
        </div>
        <div class="meta-line">Адрес: ${escapeHtml(row.address || "не указан")}</div>
        <div class="meta-line">Источник: ${escapeHtml(row.source || "не указан")}</div>
        <div class="meta-line">Координаты: ${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</div>
        <div class="meta-line">Добавил: ${escapeHtml(row.submitter_name || "не указано")}</div>
        <div class="meta-line">Контакт: ${escapeHtml(row.submitter_contact || "не указан")}</div>
        <div class="card-actions">
          <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
          <button class="card-button" data-action="edit" data-id="${escapeHtml(row.id)}" type="button">Выбрать на карте</button>
          ${options.includeApprove ? `<button class="card-button approve" data-action="approve" data-id="${escapeHtml(row.id)}" type="button">Опубликовать</button>` : ""}
          <button class="card-button delete" data-action="delete" data-id="${escapeHtml(row.id)}" type="button">Удалить</button>
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

  renderCards(pendingList, pending, { includeApprove: true, emptyMessage: "Нет pending-точек." });
  renderCards(approvedList, approved, { includeApprove: false, emptyMessage: "Подтверждённых точек пока нет." });
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
    setAuthMessage("Заполни ./supabase-config.js, чтобы админка заработала.", true);
    return;
  }

  const { data, error } = await supabase
    .from("shelters")
    .select("id, title, description, address, source, shelter_type, location_verification_status, latitude, longitude, status, submitter_name, submitter_contact, media_url, media_type, media_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    setAuthMessage(`Не удалось загрузить точки: ${error.message}`, true);
    return;
  }

  allShelters = (data || []).map((row) => ({
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
  selectedShelterPanel.innerHTML = '<p class="empty-state">Войди как администратор, чтобы открыть карту модерации и редактирование точек.</p>';
  pendingList.innerHTML = '<p class="empty-state">Войди как администратор, чтобы увидеть модерацию.</p>';
  approvedList.innerHTML = '<p class="empty-state">После входа здесь появится список подтверждённых точек.</p>';
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
    setAuthMessage("Сначала настрой Supabase в ./supabase-config.js.", true);
    return;
  }

  setAuthMessage("Входим...");
  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });

  if (error) {
    setAuthMessage(`Ошибка входа: ${error.message}`, true);
    return;
  }

  passwordInput.value = "";
  setAuthMessage("Вход выполнен.");
  await refreshSession();
}

async function handleLogout() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
  setAuthMessage("Сессия завершена.");
  await refreshSession();
}

async function moderateShelter(id, action) {
  if (!supabase) {
    return;
  }

  setAuthMessage(action === "approve" ? "Публикуем точку..." : "Удаляем точку...");

  const response = action === "approve"
    ? await supabase.from("shelters").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("shelters").delete().eq("id", id);

  if (response.error) {
    setAuthMessage(`Операция не удалась: ${response.error.message}`, true);
    return;
  }

  if (action === "delete" && selectedShelterId === id) {
    selectedShelterId = null;
  }

  setAuthMessage(action === "approve" ? "Точка опубликована." : "Точка удалена.");
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
    source: String(formData.get("source") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    shelter_type: String(formData.get("shelter_type") || "").trim(),
    location_verification_status: String(formData.get("location_verification_status") || "").trim(),
    latitude,
    longitude,
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null
  };

  if (!payload.title || !payload.address || !payload.source || !payload.description || !payload.shelter_type || !payload.location_verification_status) {
    setAuthMessage("Для сохранения нужны название, адрес, источник, тип, точность местоположения и описание.", true);
    return;
  }

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    setAuthMessage("Для сохранения нужны корректные координаты широты и долготы.", true);
    return;
  }

  setAuthMessage("Сохраняем изменения...");
  const { error } = await supabase.from("shelters").update(payload).eq("id", shelterId);

  if (error) {
    setAuthMessage(`Не удалось сохранить правки: ${error.message}`, true);
    return;
  }

  selectedShelterId = shelterId;
  setAuthMessage("Изменения сохранены.");
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
