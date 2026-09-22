import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 🔴 TVOJA FIREBASE KONFIGURÁCIA
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

// --- UI elementy ---
const authSection = document.getElementById('authSection');
const eventForm = document.getElementById('eventForm');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('status');
const addEventBtn = document.getElementById('addEventBtn');
const authError = document.getElementById('authError');

const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalDesc = document.getElementById('modalDesc');
const modalAuthor = document.getElementById('modalAuthor');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');

// Polia formulára pre čas
const allDayCb = document.getElementById('allDay');
const startInput = document.getElementById('eventStart');
const endInput = document.getElementById('eventEnd');

// Bootstrap modal instance
const eventModalEl = document.getElementById('eventModal');
const eventModal = new bootstrap.Modal(eventModalEl);

// Emaily vždy porovnávame v malých písmenách, nech prihlásenie/registrácia
// s odlišnou veľkosťou písmen nespôsobí, že si autor sám nevie zmazať udalosť.
const norm = (email) => (email || "").trim().toLowerCase();

let currentEventId = null;

// --- Prepínač "Celý deň" ---
allDayCb.addEventListener('change', () => {
  // pri zmene typu inputu sa hodnota vymaže, preto si zachováme dátumovú časť
  const s = startInput.value.slice(0, 10);
  const e = endInput.value.slice(0, 10);
  const type = allDayCb.checked ? 'date' : 'datetime-local';
  startInput.type = type;
  endInput.type = type;
  startInput.value = allDayCb.checked ? s : (s ? s + "T09:00" : "");
  endInput.value = allDayCb.checked ? e : (e ? e + "T10:00" : "");
});

// --- Kalendár ---
const calendarEl = document.getElementById('calendar');
const isMobile = () => window.innerWidth < 576;

const toolbarFor = () => isMobile()
    ? { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }
    : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' };

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

  if (event.allDay) {
    if (!end) return fmtDate(start);
    // FullCalendar má pri celodenných udalostiach koniec exkluzívny (+1 deň)
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    return lastDay.toDateString() === start.toDateString()
        ? fmtDate(start)
        : `${fmtDate(start)} – ${fmtDate(lastDay)}`;
  }

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
  modalAuthor.textContent = event.extendedProps.autor || "neznámy";

  const currentUser = auth.currentUser;
  const isOwner = currentUser && norm(currentUser.email) === norm(event.extendedProps.autor);
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
    alert("Zmazanie zlyhalo (" + error.code + "). Over si Firestore pravidlá — " +
        "e-mail prihláseného používateľa sa musí zhodovať s e-mailom autora udalosti.");
  } finally {
    modalDeleteBtn.disabled = false;
  }
});

// Vyčistenie stavu po zatvorení modálu (kliknutím mimo, na X, na Escape...)
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
      start: data.zaciatok || data.datum,   // staré udalosti majú len "datum"
      end: data.koniec || undefined,
      allDay: data.cely_den ?? true,
      extendedProps: {
        popis: data.popis,
        autor: data.autor_email
      }
    });
  });
});

// --- Autentifikácia ---
document.getElementById('registerBtn').addEventListener('click', () => {
  clearAuthError();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;

  // Kontrola zhody hesiel
  if (password !== passwordConfirm) {
    showAuthError({ message: "Heslá sa nezhodujú! Skús to znova." });
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
      .catch(showAuthError);
});

document.getElementById('loginBtn').addEventListener('click', () => {
  clearAuthError();
  signInWithEmailAndPassword(auth, document.getElementById('email').value.trim(), document.getElementById('password').value)
      .catch(showAuthError);
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
    statusText.textContent = "Prihlásený: " + user.email;
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
  const isAllDay = allDayCb.checked;
  const currentUser = auth.currentUser;

  if (!nameInput || !startVal) {
    alert("Prosím, vyplň názov aj začiatok udalosti.");
    return;
  }
  if (endVal && endVal < startVal) {
    alert("Koniec nemôže byť skôr ako začiatok.");
    return;
  }

  let endToSave = endVal || null;
  if (isAllDay && endVal) {
    // FullCalendar očakáva pri celodennej udalosti koniec exkluzívny → +1 deň
    // (počítame v UTC, aby sa deň neposunul kvôli časovému pásmu)
    const d = new Date(endVal + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    endToSave = d.toISOString().slice(0, 10);
  }

  try {
    await addDoc(collection(db, "udalosti"), {
      nazov: nameInput,
      zaciatok: startVal,
      koniec: endToSave,
      cely_den: isAllDay,
      popis: descInput,
      autor_email: norm(currentUser.email),
      cas_pridania: new Date()
    });

    document.getElementById('eventName').value = "";
    startInput.value = "";
    endInput.value = "";
    document.getElementById('eventDesc').value = "";
  } catch (error) {
    console.error("Chyba pri ukladaní:", error.code, error.message);
    alert("Chyba pri ukladaní: " + error.message);
  }
});