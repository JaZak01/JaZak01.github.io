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

// Bootstrap modal instance
const eventModalEl = document.getElementById('eventModal');
const eventModal = new bootstrap.Modal(eventModalEl);

// Emaily vždy porovnávame v malých písmenách, nech prihlásenie/registrácia
// s odlišnou veľkosťou písmen nespôsobí, že si autor sám nevie zmazať udalosť.
const norm = (email) => (email || "").trim().toLowerCase();

let currentEventId = null;

// --- Kalendár ---
const calendarEl = document.getElementById('calendar');
const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'dayGridMonth',
  locale: 'sk',
  firstDay: 1,
  height: 'auto',
  buttonText: { today: 'Dnes' },

  eventClick: function (info) {
    openEventModal(info.event);
  }
});
calendar.render();

function openEventModal(event) {
  currentEventId = event.id;
  modalTitle.textContent = event.title;
  modalDate.textContent = formatDate(event.startStr);
  modalDesc.textContent = event.extendedProps.popis || "Bez popisu.";
  modalAuthor.textContent = event.extendedProps.autor || "neznámy";

  const currentUser = auth.currentUser;
  const isOwner = currentUser && norm(currentUser.email) === norm(event.extendedProps.autor);
  modalDeleteBtn.hidden = !isOwner;

  eventModal.show();
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
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
      start: data.datum,
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
  createUserWithEmailAndPassword(auth, document.getElementById('email').value.trim(), document.getElementById('password').value)
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
  const dateInput = document.getElementById('eventDate').value;
  const descInput = document.getElementById('eventDesc').value.trim();
  const currentUser = auth.currentUser;

  if (!nameInput || !dateInput) {
    alert("Prosím, vyplň názov aj dátum udalosti.");
    return;
  }

  try {
    await addDoc(collection(db, "udalosti"), {
      nazov: nameInput,
      datum: dateInput,
      popis: descInput,
      autor_email: norm(currentUser.email),
      cas_pridania: new Date()
    });

    document.getElementById('eventName').value = "";
    document.getElementById('eventDate').value = "";
    document.getElementById('eventDesc').value = "";
  } catch (error) {
    console.error("Chyba pri ukladaní:", error.code, error.message);
    alert("Chyba pri ukladaní: " + error.message);
  }
});