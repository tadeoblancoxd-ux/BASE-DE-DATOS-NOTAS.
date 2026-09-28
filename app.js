// Planificador semanal — PWA móvil + desktop. Datos en Supabase.
import {
  getSession, signIn, signUp, signOut, onAuthStateChange,
  fetchTasks, createTask, updateTask, deleteTask, toggleTaskDone
} from './supabase.js';

const LS_THEME = 'plan_sem_theme';
let tasks = [], weekOffset = 0, editingId = null, deferredPrompt = null, currentUser = null;
const $ = id => document.getElementById(id);
const cal = $('calendar'), modal = $('modal'), form = $('taskForm');

// ------------------------------------------------------------
// UTILIDADES (sin cambios)
// ------------------------------------------------------------
function mondayOf(offset = 0) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
function weekKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function visibleTasks(monday) {
  const wk = weekKey(monday);
  return tasks.filter(t => !t.recurring ? t.week_key === wk : t.week_key <= wk);
}
function isDone(t, wk) {
  return !!(t.done && t.done[wk]);
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} }
let toastT = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ------------------------------------------------------------
// AUTENTICACIÓN
// ------------------------------------------------------------
let authMode = 'login'; // 'login' | 'signup'

function showAuthModal() {
  $('authModal').classList.remove('hidden');
  updateAuthUI();
}
function hideAuthModal() {
  $('authModal').classList.add('hidden');
  $('authError').classList.add('hidden');
}
function updateAuthUI() {
  $('authTitle').textContent = authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  $('authSubmit').textContent = authMode === 'login' ? 'Entrar' : 'Registrarse';
  $('authToggle').textContent = authMode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta';
  $('authPassword').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
}
function showAuthError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

$('authToggle').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  updateAuthUI();
  $('authError').classList.add('hidden');
});

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if (!email || !password) return;
  try {
    if (authMode === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }
    hideAuthModal();
  } catch (err) {
    showAuthError(err.message || 'Error de autenticación');
  }
});

// ------------------------------------------------------------
// CARGA DE DATOS
// ------------------------------------------------------------
async function loadTasks() {
  try {
    tasks = await fetchTasks();
  } catch (err) {
    console.error('Error cargando tareas:', err);
    toast('Error al cargar tareas');
    tasks = [];
  }
}

// ------------------------------------------------------------
// RENDER (sin cambios en la UI)
// ------------------------------------------------------------
function render() {
  const monday = mondayOf(weekOffset), wk = weekKey(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  $('weekLabel').textContent = monday.toLocaleDateString('es', { day: 'numeric', month: 'long' }) + ' — ' + sunday.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) + (weekOffset === 0 ? ' · Esta semana' : '');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  cal.innerHTML = '';
  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const col = document.createElement('section');
    col.className = 'day' + (date.getTime() === today.getTime() ? ' today' : '');
    const dayTasks = visibleTasks(monday).filter(t => t.day === i).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    total += dayTasks.length;
    done += dayTasks.filter(t => isDone(t, wk)).length;
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = '<div><strong></strong><br><small></small></div><span class="date-num"></span>';
    head.querySelector('strong').textContent = names[i];
    head.querySelector('small').textContent = date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    head.querySelector('.date-num').textContent = date.getDate();
    col.appendChild(head);
    const list = document.createElement('div');
    list.className = 'tasks';
    if (!dayTasks.length) { list.innerHTML = '<span style="color:var(--muted);font-size:13px;text-align:center;padding:12px">Sin tareas — tocá + Agregar</span>'; }
    dayTasks.forEach(t => {
      const d = isDone(t, wk);
      const el = document.createElement('div');
      el.className = 'task prio-' + (t.prio || 'media') + (d ? ' done' : '');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.innerHTML = '<input type="checkbox" title="Marcar completada" aria-label="Completada">'
        + '<div class="t-body"><div class="t-title"></div><div class="t-meta"></div></div>'
        + '<div class="t-actions"><button class="t-edit" title="Editar">✎</button><button class="t-del" title="Eliminar">×</button></div>';
      el.querySelector('.t-title').textContent = t.title;
      const meta = el.querySelector('.t-meta');
      if (t.time) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = '⏰ ' + t.time; meta.appendChild(s); }
      if (t.cat) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = t.cat; meta.appendChild(s); }
      const p = document.createElement('span'); p.className = 'badge'; p.textContent = t.prio || 'media'; meta.appendChild(p);
      if (t.recurring) { const s = document.createElement('span'); s.className = 'rec'; s.title = 'Se repite cada semana'; s.textContent = '↻ semanal'; meta.appendChild(s); }
      const box = el.querySelector('input');
      box.checked = d;
      const toggle = async (ev) => {
        if (ev) ev.stopPropagation();
        try {
          await toggleTaskDone(t.id, wk, t.done || {});
          t.done = t.done || {};
          if (t.done[wk]) { delete t.done[wk]; } else { t.done[wk] = true; }
          buzz(15);
          render();
        } catch (err) {
          console.error('Error al completar tarea:', err);
          toast('Error al guardar');
        }
      };
      box.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await toggleTaskDone(t.id, wk, t.done || {});
          t.done = t.done || {};
          if (t.done[wk]) { delete t.done[wk]; } else { t.done[wk] = true; }
          buzz(15);
          render();
        } catch (err) {
          console.error('Error al completar tarea:', err);
          toast('Error al guardar');
        }
      });
      el.addEventListener('click', () => toggle());
      el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
      el.querySelector('.t-edit').addEventListener('click', (e) => { e.stopPropagation(); openModal(i, t); });
      el.querySelector('.t-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('¿Eliminar "' + t.title + '"?')) {
          try {
            await deleteTask(t.id);
            tasks = tasks.filter(x => x.id !== t.id);
            toast('Tarea eliminada');
            render();
          } catch (err) {
            console.error('Error al eliminar:', err);
            toast('Error al eliminar');
          }
        }
      });
      list.appendChild(el);
    });
    const add = document.createElement('button');
    add.className = 'add-day';
    add.textContent = '+ Agregar';
    add.addEventListener('click', () => openModal(i));
    col.appendChild(list);
    col.appendChild(add);
    cal.appendChild(col);
  }
  $('kpiTotal').textContent = total;
  $('kpiDone').textContent = done;
  $('kpiPending').textContent = total - done;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('kpiPct').textContent = pct + '%';
  $('barFill').style.width = pct + '%';
}

// ------------------------------------------------------------
// MODAL DE TAREAS
// ------------------------------------------------------------
function openModal(day = 0, task = null) {
  editingId = task ? task.id : null;
  $('modalTitle').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  $('fTitle').value = task ? task.title : '';
  $('fDay').value = task ? task.day : day;
  $('fTime').value = task ? (task.time || '') : '';
  $('fCat').value = task ? (task.cat || '') : '';
  $('fPrio').value = task ? (task.prio || 'media') : 'media';
  $('fRec').checked = task ? !!task.recurring : false;
  $('btnDelete').classList.toggle('hidden', !task);
  modal.classList.remove('hidden');
  setTimeout(() => $('fTitle').focus(), 50);
}
function closeModal() {
  modal.classList.add('hidden');
  form.reset();
  editingId = null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const monday = mondayOf(weekOffset), wk = weekKey(monday);
  const data = {
    title: $('fTitle').value.trim(),
    day: +$('fDay').value,
    time: $('fTime').value || '',
    cat: $('fCat').value.trim(),
    prio: $('fPrio').value,
    recurring: $('fRec').checked,
    week_key: wk,
    done: {}
  };
  if (!data.title) return;
  try {
    if (editingId) {
      const t = tasks.find(x => x.id === editingId);
      if (t) {
        const { done } = t;
        await updateTask(editingId, { ...data, done });
        Object.assign(t, data);
      }
    } else {
      const newTask = await createTask(data);
      tasks.push(newTask);
    }
    closeModal();
    buzz(20);
    toast('Tarea guardada');
    render();
  } catch (err) {
    console.error('Error guardando tarea:', err);
    toast('Error al guardar');
  }
});

$('btnDelete').addEventListener('click', async () => {
  if (!editingId) return;
  const t = tasks.find(x => x.id === editingId);
  if (t && confirm('¿Eliminar "' + t.title + '"?')) {
    try {
      await deleteTask(editingId);
      tasks = tasks.filter(x => x.id !== editingId);
      closeModal();
      toast('Tarea eliminada');
      render();
    } catch (err) {
      console.error('Error al eliminar:', err);
      toast('Error al eliminar');
    }
  }
});

// ------------------------------------------------------------
// NAVEGACIÓN Y OTROS (sin cambios)
// ------------------------------------------------------------
function todayIdx() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
$('btnNew').addEventListener('click', () => openModal(todayIdx()));
$('btnCancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
function go(d) { weekOffset += d; render(); }
$('btnPrev').addEventListener('click', () => go(-1));
$('btnNext').addEventListener('click', () => go(1));
$('btnToday').addEventListener('click', () => { weekOffset = 0; render(); });
const mP = $('mPrev'), mT = $('mToday'), mN = $('mNext'), mA = $('mAdd');
if (mP) mP.addEventListener('click', () => go(-1));
if (mN) mN.addEventListener('click', () => go(1));
if (mT) mT.addEventListener('click', () => { weekOffset = 0; render(); });
if (mA) mA.addEventListener('click', () => openModal(todayIdx()));
$('btnTheme').addEventListener('click', () => {
  const h = document.documentElement;
  h.dataset.theme = h.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(LS_THEME, h.dataset.theme); } catch {}
  syncThemeBtn();
});
function syncThemeBtn() { try { $('btnTheme').textContent = document.documentElement.dataset.theme === 'dark' ? '🌙' : '☀️'; } catch {} }

// Swipe para cambiar semana (móvil)
(function () {
  let x0 = null, y0 = null, dx = 0, dy = 0;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; dy = 0; }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    dx = e.touches[0].clientX - x0; dy = e.touches[0].clientY - y0;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    if (modal && !modal.classList.contains('hidden')) { x0 = null; return; }
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) go(1); else go(-1); buzz(10); }
    x0 = null;
  }, { passive: true });
})();

// PWA: instalar + service worker
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = $('btnInstall');
  if (b) b.classList.remove('hidden');
});
$('btnInstall').addEventListener('click', async () => {
  if (!deferredPrompt) { toast('Abrí el menú ⋮ > Instalar app'); return; }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btnInstall').classList.add('hidden');
});
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ------------------------------------------------------------
// INICIO: verificar sesión y cargar datos
// ------------------------------------------------------------
(async function init() {
  // Tema
  let s = 'dark';
  try { s = localStorage.getItem(LS_THEME) || 'dark'; } catch {}
  document.documentElement.dataset.theme = s;
  syncThemeBtn();

  // Verificar sesión
  try {
    const session = await getSession();
    if (session) {
      currentUser = session.user;
      await loadTasks();
      render();
    } else {
      showAuthModal();
    }
  } catch (err) {
    console.error('Error en init:', err);
    showAuthModal();
  }

  // Escuchar cambios de autenticación
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      await loadTasks();
      render();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      tasks = [];
      showAuthModal();
    }
  });
})();

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
