import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAW1Fo3qiyJit9xUVKj4NxIF7YminZsncU",
  authDomain: "kalendar-edf3f.firebaseapp.com",
  projectId: "kalendar-edf3f",
  storageBucket: "kalendar-edf3f.firebasestorage.app",
  messagingSenderId: "604130457317",
  appId: "1:604130457317:web:6b17da98599d36c9bd860c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TAGS = [
  { id: 'sport',     label: 'Šport',      color: '#0d6efd' },
  { id: 'kultura',   label: 'Kultúra',    color: '#6f42c1' },
  { id: 'jedlo',     label: 'Jedlo',      color: '#fd7e14' },
  { id: 'deti',      label: 'Deti',       color: '#20c997' },
  { id: 'brigada',   label: 'Brigáda',    color: '#dc3545' },
  { id: 'stretnutie',label: 'Stretnutie', color: '#6c757d' },
];
const TAG_MAP = Object.fromEntries(TAGS.map(t => [t.id, t]));

const authSection = document.getElementById('authSection');
const eventForm = document.getElementById('eventForm');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('status');
const addEventBtn = document.getElementById('addEventBtn');
const authError = document.getElementById('authError');

const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalDesc = document.getElementById('modalDesc');
const modalTags = document.getElementById('modalTags');
const modalAuthor = document.getElementById('modalAuthor');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showLoginBtn = document.getElementById('showLoginBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');

const startInput = document.getElementById('eventStart');
const endInput = document.getElementById('eventEnd');

const tagPicker = document.getElementById('tagPicker');
renderTagPicker();

function renderTagPicker() {
  tagPicker.innerHTML = TAGS.map(tag => `
    <input type="checkbox" class="btn-check" id="tag-${tag.id}" autocomplete="off">
    <label class="btn btn-outline-secondary btn-sm tag-picker-label" style="--tag-color: ${tag.color}" for="tag-${tag.id}">
      <span class="tag-dot" style="background:${tag.color}"></span>${tag.label}
    </label>
  `).join('');
}

function getSelectedTags() {
  return TAGS.filter(tag => document.getElementById(`tag-${tag.id}`).checked).map(tag => tag.id);
}

function resetTagPicker() {
  TAGS.forEach(tag => { document.getElementById(`tag-${tag.id}`).checked = false; });
}

// Bootstrap modal instance
const eventModalEl = document.getElementById('eventModal');
const eventModal = new bootstrap.Modal(eventModalEl);

// Emaily vždy porovnávame v malých písmenách
const norm = (email) => (email || "").trim().toLowerCase();

let currentEventId = null;

// --- Kalendár ---
const calendarEl = document.getElementById('calendar');
const isMobile = () => window.innerWidth < 576;

const toolbarFor = () => isMobile()
    ? { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }
    : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' };

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'dayGridMonth',
  locale: 'sk',
  firstDay: 1,
  height: 'auto',
  buttonText: { today: 'Dnes', month: 'Mesiac', week: 'Týždeň', list: 'Zoznam' },
  displayEventEnd: true,
  eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  headerToolbar: toolbarFor(),
  windowResize: () => calendar.setOption('headerToolbar', toolbarFor()),
  eventClick: function (info) {
    openEventModal(info.event);
  },
  eventContent: function (arg) {
    const tags = arg.event.extendedProps.tagy || [];
    const dots = tags
        .map(id => TAG_MAP[id])
        .filter(Boolean)
        .map(tag => `<span class="fc-tag-dot" style="background:${tag.color}"></span>`)
        .join('');
    const timeHtml = arg.timeText ? `<div class="fc-event-time">${escapeHtml(arg.timeText)}</div>` : '';
    return {
      html: `<div class="fc-event-main-custom">${timeHtml}<div class="fc-event-title-row">${dots}<span class="fc-event-title">${escapeHtml(arg.event.title)}</span></div></div>`
    };
  }
});
calendar.render();

function formatRange(event) {
  const dateOpts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: false };
  const fmtDate = (d) => d.toLocaleDateString('sk-SK', dateOpts);
  const fmtTime = (d) => d.toLocaleTimeString('sk-SK', timeOpts);

  const start = event.start;
  const end = event.end;

  if (!end) return `${fmtDate(start)} ${fmtTime(start)}`;
  if (start.toDateString() === end.toDateString()) {
    return `${fmtDate(start)}, ${fmtTime(start)} – ${fmtTime(end)}`;
  }
  return `${fmtDate(start)} ${fmtTime(start)} – ${fmtDate(end)} ${fmtTime(end)}`;
}

function openEventModal(event) {
  currentEventId = event.id;
  modalTitle.textContent = event.title;
  modalDate.textContent = formatRange(event);
  modalDesc.textContent = event.extendedProps.popis || "Bez popisu.";

  // Zobrazenie tagov ako farebné odznaky
  const eventTags = event.extendedProps.tagy || [];
  modalTags.innerHTML = eventTags
      .map(id => TAG_MAP[id])
      .filter(Boolean)
      .map(tag => `<span class="tag-badge" style="background:${tag.color}">${tag.label}</span>`)
      .join('');

  // Zobrazujeme meno autora (alebo e-mail pri starých udalostiach)
  modalAuthor.textContent = event.extendedProps.autor || "neznámy";

  const currentUser = auth.currentUser;
  // Overenie vlastníctva udalosti cez skrytý autor_email
  const isOwner = currentUser && norm(currentUser.email) === norm(event.extendedProps.autor_email);
  modalDeleteBtn.hidden = !isOwner;

  eventModal.show();
}

modalDeleteBtn.addEventListener('click', async () => {
  if (!currentEventId) return;
  if (!confirm("Naozaj chceš zmazať túto udalosť?")) return;

  modalDeleteBtn.disabled = true;
  try {
    await deleteDoc(doc(db, "udalosti", currentEventId));
    eventModal.hide();
  } catch (error) {
    console.error("Chyba pri mazaní:", error.code, error.message);
    alert("Zmazanie zlyhalo (" + error.code + "). Over si Firestore pravidlá — e-mail prihláseného používateľa sa musí zhodovať s e-mailom autora udalosti.");
  } finally {
    modalDeleteBtn.disabled = false;
  }
});

eventModalEl.addEventListener('hidden.bs.modal', () => {
  currentEventId = null;
});

// --- Synchronizácia udalostí z Firestore v reálnom čase ---
onSnapshot(collection(db, "udalosti"), (snapshot) => {
  calendar.removeAllEvents();
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    calendar.addEvent({
      id: docSnap.id,
      title: data.nazov,
      start: data.zaciatok || data.datum,
      end: data.koniec || undefined,
      extendedProps: {
        popis: data.popis,
        tagy: data.tagy || [],
        autor: data.autor_meno || data.autor_email, // Meno na zobrazenie
        autor_email: data.autor_email // E-mail na overenie práv mazania
      }
    });
  });
});

// --- Autentifikácia: UI Prepínanie ---
showLoginBtn.addEventListener('click', () => {
  loginForm.hidden = false;
  registerForm.hidden = true;
  showLoginBtn.className = "btn btn-sm btn-primary";
  showRegisterBtn.className = "btn btn-sm btn-outline-primary";
  clearAuthError();
});

showRegisterBtn.addEventListener('click', () => {
  loginForm.hidden = true;
  registerForm.hidden = false;
  showLoginBtn.className = "btn btn-sm btn-outline-primary";
  showRegisterBtn.className = "btn btn-sm btn-primary";
  clearAuthError();
});

// --- Autentifikácia: Logika ---
document.getElementById('registerBtn').addEventListener('click', async () => {
  clearAuthError();
  const name = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const passwordConfirm = document.getElementById('regPasswordConfirm').value;

  if (!name) return showAuthError({ message: "Zadaj prosím používateľské meno." });
  if (password !== passwordConfirm) return showAuthError({ message: "Heslá sa nezhodujú! Skús to znova." });

  try {
    const userCreds = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCreds.user, { displayName: name });
    statusText.textContent = "Prihlásený: " + name;
  } catch (error) {
    showAuthError(error);
  }
});

document.getElementById('loginBtn').addEventListener('click', () => {
  clearAuthError();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  signInWithEmailAndPassword(auth, email, password).catch(showAuthError);
});

logoutBtn.addEventListener('click', () => signOut(auth));

function showAuthError(error) {
  authError.textContent = error.message;
  authError.hidden = false;
}
function clearAuthError() {
  authError.hidden = true;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    const displayName = user.displayName || user.email;
    statusText.textContent = "Prihlásený: " + displayName;
    authSection.hidden = true;
    logoutBtn.hidden = false;
    eventForm.hidden = false;
  } else {
    statusText.textContent = "Neprihlásený";
    authSection.hidden = false;
    logoutBtn.hidden = true;
    eventForm.hidden = true;
  }
});

// --- Pridávanie novej udalosti ---
addEventBtn.addEventListener('click', async () => {
  const nameInput = document.getElementById('eventName').value.trim();
  const descInput = document.getElementById('eventDesc').value.trim();
  const startVal = startInput.value;
  const endVal = endInput.value;
  const selectedTags = getSelectedTags();
  const currentUser = auth.currentUser;

  if (!nameInput || !startVal) {
    alert("Prosím, vyplň názov aj začiatok udalosti.");
    return;
  }
  if (endVal && endVal < startVal) {
    alert("Koniec nemôže byť skôr ako začiatok.");
    return;
  }

  try {
    await addDoc(collection(db, "udalosti"), {
      nazov: nameInput,
      zaciatok: startVal,
      koniec: endVal || null,
      popis: descInput,
      tagy: selectedTags,
      autor_email: norm(currentUser.email),
      autor_meno: currentUser.displayName || "Neznámy", // Uloženie používateľského mena do databázy
      cas_pridania: new Date()
    });

    document.getElementById('eventName').value = "";
    startInput.value = "";
    endInput.value = "";
    document.getElementById('eventDesc').value = "";
    resetTagPicker();
  } catch (error) {
    console.error("Chyba pri ukladaní:", error.code, error.message);
    alert("Chyba pri ukladaní: " + error.message);
  }
});