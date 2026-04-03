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

function renderCards(target, rows, options) {
  if (!rows.length) {
    target.innerHTML = `<p class="empty-state">${options.emptyMessage}</p>`;
    return;
  }

  target.innerHTML = rows.map((row) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`;
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
          ${options.includeApprove ? `<button class="card-button approve" data-action="approve" data-id="${row.id}" type="button">Approve</button>` : ""}
          <button class="card-button delete" data-action="delete" data-id="${row.id}" type="button">Delete</button>
        </div>
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

  setAuthMessage(action === "approve" ? "Подтверждаем точку..." : "Удаляем точку...");

  const response = action === "approve"
    ? await supabase.from("shelters").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("shelters").delete().eq("id", id);

  if (response.error) {
    setAuthMessage(`Операция не удалась: ${response.error.message}`, true);
    return;
  }

  setAuthMessage(action === "approve" ? "Точка подтверждена." : "Точка удалена.");
  await loadShelters();
}

loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
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
