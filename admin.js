import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

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

const DEFAULT_ADMIN_MAP_ZOOM = 17;

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

const supabase = hasSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let editingShelterId = null;
let activeEditMap = null;
let activeEditMarker = null;

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

function destroyActiveEditMap() {
  if (activeEditMap) {
    activeEditMap.remove();
    activeEditMap = null;
    activeEditMarker = null;
  }
}

function renderMediaBlock(row) {
  if (!row.media_url) {
    return '<div class="meta-line">Вложение: не добавлено</div>';
  }

  const safeUrl = escapeHtml(row.media_url);
  const safeName = escapeHtml(row.media_name || "Открыть вложение");
  const isVideo = String(row.media_type || "").startsWith("video/");
  const preview = isVideo
    ? `<video controls preload="metadata" style="width:100%;margin-top:12px;border-radius:16px;"><source src="${safeUrl}" type="${escapeHtml(row.media_type || "video/mp4")}" /></video>`
    : `<img src="${safeUrl}" alt="${safeName}" style="width:100%;margin-top:12px;border-radius:16px;object-fit:cover;" />`;

  return `
    <div class="meta-line">Вложение: <a class="media-link" href="${safeUrl}" target="_blank" rel="noreferrer">${safeName}</a></div>
    ${preview}
  `;
}

function renderTypeOptions(selectedType) {
  return Object.entries(SHELTER_TYPE_LABELS).map(([value, label]) => (
    `<option value="${value}"${selectedType === value ? " selected" : ""}>${label}</option>`
  )).join("");
}

function renderLocationVerificationOptions(selectedValue) {
  return Object.entries(LOCATION_VERIFICATION_LABELS).map(([value, label]) => (
    `<option value="${value}"${selectedValue === value ? " selected" : ""}>${label}</option>`
  )).join("");
}

function renderEditForm(row) {
  return `
    <form class="admin-edit-form" data-edit-form="${row.id}">
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
        <textarea name="description" rows="4" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
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
      <div class="admin-map-block">
        <div class="meta-line">Перетащи маркер на карте или поправь координаты вручную.</div>
        <div
          class="admin-edit-map"
          data-edit-map="${row.id}"
          data-lat="${escapeHtml(row.latitude)}"
          data-lng="${escapeHtml(row.longitude)}"
        ></div>
      </div>
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
        <button class="card-button" type="button" data-action="cancel-edit" data-id="${row.id}">Отмена</button>
      </div>
    </form>
  `;
}

function renderCards(target, rows, options) {
  if (!rows.length) {
    target.innerHTML = `<p class="empty-state">${options.emptyMessage}</p>`;
    return;
  }

  target.innerHTML = rows.map((row) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
    const isEditing = editingShelterId === row.id;
    const verificationStatus = String(row.location_verification_status || "needs_review").trim();

    return `
      <article class="location-card">
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
        ${renderMediaBlock(row)}
        <div class="card-actions">
          <a class="card-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
          <button class="card-button" data-action="edit" data-id="${row.id}" type="button">Редактировать</button>
          ${options.includeApprove ? `<button class="card-button approve" data-action="approve" data-id="${row.id}" type="button">Опубликовать</button>` : ""}
          <button class="card-button delete" data-action="delete" data-id="${row.id}" type="button">Удалить</button>
        </div>
        ${isEditing ? renderEditForm(row) : ""}
      </article>
    `;
  }).join("");
}

function initializeEditMap() {
  destroyActiveEditMap();

  const mapElement = document.querySelector("[data-edit-map]");
  if (!mapElement || typeof L === "undefined") {
    return;
  }

  const form = mapElement.closest("[data-edit-form]");
  const latInput = form?.querySelector('input[name="latitude"]');
  const lngInput = form?.querySelector('input[name="longitude"]');
  const lat = Number(mapElement.dataset.lat || latInput?.value);
  const lng = Number(mapElement.dataset.lng || lngInput?.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  activeEditMap = L.map(mapElement, { zoomControl: true }).setView([lat, lng], DEFAULT_ADMIN_MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(activeEditMap);

  activeEditMarker = L.marker([lat, lng], { draggable: true }).addTo(activeEditMap);

  const syncMarkerPosition = (nextLat, nextLng) => {
    if (!latInput || !lngInput) {
      return;
    }

    latInput.value = nextLat.toFixed(7);
    lngInput.value = nextLng.toFixed(7);
  };

  activeEditMarker.on("dragend", () => {
    const { lat: nextLat, lng: nextLng } = activeEditMarker.getLatLng();
    syncMarkerPosition(nextLat, nextLng);
  });

  const updateMarkerFromInputs = () => {
    const nextLat = Number(latInput?.value);
    const nextLng = Number(lngInput?.value);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !activeEditMarker || !activeEditMap) {
      return;
    }

    activeEditMarker.setLatLng([nextLat, nextLng]);
    activeEditMap.setView([nextLat, nextLng], activeEditMap.getZoom());
  };

  latInput?.addEventListener("change", updateMarkerFromInputs);
  lngInput?.addEventListener("change", updateMarkerFromInputs);

  // Leaflet needs a size invalidation after the hidden edit form is rendered.
  setTimeout(() => {
    activeEditMap?.invalidateSize();
  }, 0);
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

  const pending = (data || []).filter((row) => row.status === "pending");
  const approved = (data || []).filter((row) => row.status === "approved");
  pendingCount.textContent = String(pending.length);
  approvedCount.textContent = String(approved.length);

  if (editingShelterId && !(data || []).some((row) => row.id === editingShelterId)) {
    editingShelterId = null;
  }

  renderCards(pendingList, pending, { includeApprove: true, emptyMessage: "Нет pending-точек." });
  renderCards(approvedList, approved, { includeApprove: false, emptyMessage: "Подтверждённых точек пока нет." });
  initializeEditMap();
}

async function refreshSession() {
  if (!supabase) {
    sessionBadge.textContent = "no config";
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    destroyActiveEditMap();
    sessionBadge.textContent = "guest";
    pendingList.innerHTML = '<p class="empty-state">Войди как администратор, чтобы увидеть модерацию.</p>';
    approvedList.innerHTML = '<p class="empty-state">После входа здесь появится список подтверждённых точек.</p>';
    pendingCount.textContent = "0";
    approvedCount.textContent = "0";
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

  destroyActiveEditMap();
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

  editingShelterId = null;
  destroyActiveEditMap();
  setAuthMessage(action === "approve" ? "Точка опубликована." : "Точка удалена.");
  await loadShelters();
}

async function saveShelterEdits(form) {
  if (!supabase) {
    return;
  }

  const shelterId = form.dataset.editForm;
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

  editingShelterId = null;
  destroyActiveEditMap();
  setAuthMessage("Изменения сохранены.");
  await loadShelters();
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  await saveShelterEdits(form);
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "edit") {
    editingShelterId = button.dataset.id;
    await loadShelters();
    return;
  }

  if (button.dataset.action === "cancel-edit") {
    editingShelterId = null;
    destroyActiveEditMap();
    await loadShelters();
    return;
  }

  await moderateShelter(button.dataset.id, button.dataset.action);
});

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshSession();
  });
}

refreshSession();
