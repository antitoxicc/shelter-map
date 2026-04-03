import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./supabase-config.js";

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

function renderEditForm(row) {
  return `
    <form class="admin-edit-form" data-edit-form="${row.id}">
      <label>
        Название
        <input name="title" value="${escapeHtml(row.title || "")}" maxlength="120" required />
      </label>
      <label>
        Описание
        <textarea name="description" rows="4" maxlength="500" required>${escapeHtml(row.description || "")}</textarea>
      </label>
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
    return `
      <article class="location-card">
        <h3>${escapeHtml(row.title)}</h3>
        <p>${escapeHtml(row.description || "Описание не указано")}</p>
        <div class="meta-line">Координаты: ${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</div>
        <div class="meta-line">Добавил: ${escapeHtml(row.submitter_name || "не указано")}</div>
        <div class="meta-line">Контакт: ${escapeHtml(row.submitter_contact || "не указан")}</div>
        ${renderMediaBlock(row)}
        <span class="status-badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
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

async function loadShelters() {
  if (!supabase) {
    setAuthMessage("Заполни ./supabase-config.js, чтобы админка заработала.", true);
    return;
  }

  const { data, error } = await supabase
    .from("shelters")
    .select("id, title, description, latitude, longitude, status, submitter_name, submitter_contact, media_url, media_type, media_name, created_at")
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
}

async function refreshSession() {
  if (!supabase) {
    sessionBadge.textContent = "no config";
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
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
  setAuthMessage(action === "approve" ? "Точка опубликована." : "Точка удалена.");
  await loadShelters();
}

async function saveShelterEdits(form) {
  if (!supabase) {
    return;
  }

  const shelterId = form.dataset.editForm;
  const formData = new FormData(form);
  const payload = {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    submitter_name: String(formData.get("submitter_name") || "").trim() || null,
    submitter_contact: String(formData.get("submitter_contact") || "").trim() || null
  };

  if (!payload.title || !payload.description) {
    setAuthMessage("Для сохранения нужны название и описание.", true);
    return;
  }

  setAuthMessage("Сохраняем изменения...");
  const { error } = await supabase.from("shelters").update(payload).eq("id", shelterId);

  if (error) {
    setAuthMessage(`Не удалось сохранить правки: ${error.message}`, true);
    return;
  }

  editingShelterId = null;
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
