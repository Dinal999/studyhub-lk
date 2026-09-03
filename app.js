// ==========================================
// 1. GOOGLE GEMINI API CONFIGURATION
// ==========================================
const GEMINI_API_KEY = "AQ.Ab8RN6JBAo1kXcqOSPPFedi8MmqeaytSWZP_0_J1XHsgbw3rEQ";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDKaN9vCQEU_sNSZksPW4fI8pog1F5igPI",
  authDomain: "studyhub-lk-b582f.firebaseapp.com",
  projectId: "studyhub-lk-b582f",
  storageBucket: "studyhub-lk-b582f.firebasestorage.app",
  messagingSenderId: "495293321566",
  appId: "1:495293321566:web:d63853005b2aa1f8203fcf"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configure PDFJS Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let currentUser = null;
let userExamDate = null;
let selectedVaultBase64 = null;
let selectedPPBase64 = null;
let lastGeneratedShortNoteHTML = "";

// INDEXEDDB LOCAL STORAGE ENGINE (Vault & Past Papers Fix)
let idb = null;
const idbReq = indexedDB.open("StudyHubVaultDB", 1);
idbReq.onupgradeneeded = function(e) {
  idb = e.target.result;
  if (!idb.objectStoreNames.contains("vault_files")) idb.createObjectStore("vault_files", { keyPath: "id" });
  if (!idb.objectStoreNames.contains("past_papers")) idb.createObjectStore("past_papers", { keyPath: "id" });
};
idbReq.onsuccess = function(e) { idb = e.target.result; };

function saveToIDB(storeName, item) {
  return new Promise((resolve, reject) => {
    if (!idb) return resolve();
    const tx = idb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function getFromIDB(storeName, userId) {
  return new Promise((resolve) => {
    if (!idb) return resolve([]);
    const tx = idb.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      resolve(all.filter(item => item.uid === userId));
    };
    req.onerror = () => resolve([]);
  });
}

function deleteFromIDB(storeName, itemId) {
  return new Promise((resolve) => {
    if (!idb) return resolve();
    const tx = idb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.delete(itemId);
    tx.oncomplete = () => resolve();
  });
}

// Navigation Switcher
function switchTab(tabId, event) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }
}

// Authentication Handlers
function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(e => alert("Login Error: " + e.message));
}

function logout() {
  auth.signOut();
}

auth.onAuthStateChanged(user => {
  const loginScreen = document.getElementById('login-screen');
  const appScreen = document.getElementById('app-screen');

  if (user) {
    currentUser = user;
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    document.getElementById('user-name').innerText = user.displayName || user.email;
    loadUserData();
    loadVaultFiles();
    loadPastPapers();
    initCalendarSchedule();
    loadForumPosts();
    initGpaTable();
    loadScratchpadNotes();
    
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('event-date');
    if (dateInput) dateInput.value = todayStr;
  } else {
    currentUser = null;
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
});

// PDF & Image Base64 Opener
function openBase64File(base64Data) {
  try {
    const arr = base64Data.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch(e) {
    alert("Error opening file: " + e.message);
  }
}

// DASHBOARD & TO-DO TASKS
function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!currentUser || !text) return;

  db.collection('users').doc(currentUser.uid).collection('todos').add({
    text: text, completed: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => input.value = '');
}

function loadUserData() {
  db.collection('users').doc(currentUser.uid).collection('todos')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const todoList = document.getElementById('todo-list');
      todoList.innerHTML = '';
      document.getElementById('total-tasks-count').innerText = snapshot.size;

      if (snapshot.empty) {
        todoList.innerHTML = '<p class="text-slate-500 text-xs italic">No active tasks. Add one above!</p>';
        return;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const li = document.createElement('li');
        li.className = "flex items-center gap-3 bg-slate-800 p-3 rounded-xl border border-slate-700";
        li.innerHTML = `
          <input type="checkbox" ${data.completed ? 'checked' : ''} onclick="toggleTask('${doc.id}', ${data.completed})" class="w-4 h-4 accent-blue-500">
          <span class="flex-1 text-xs text-slate-200 ${data.completed ? 'line-through text-slate-500' : ''}">${data.text}</span>
          <button onclick="deleteTask('${doc.id}')" class="text-red-400 text-xs hover:underline">Delete</button>
        `;
        todoList.appendChild(li);
      });
    });

  db.collection('users').doc(currentUser.uid).collection('settings').doc('profile').get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.targetGpa) document.getElementById('target-gpa-display').innerText = parseFloat(data.targetGpa).toFixed(2);
      if (data.examTitle && data.examDate) {
        userExamDate = new Date(data.examDate);
        document.getElementById('exam-title-display').innerText = data.examTitle;
        updateExamCountdown();
      }
    }
  });
}

function toggleTask(id, currentStatus) {
  db.collection('users').doc(currentUser.uid).collection('todos').doc(id).update({ completed: !currentStatus });
}
function deleteTask(id) {
  db.collection('users').doc(currentUser.uid).collection('todos').doc(id).delete();
}

function editExamSettings() {
  const title = prompt("Enter Exam Name:", "A/L Exam / Semester Exam");
  if (!title) return;
  const dateStr = prompt("Enter Target Date (YYYY-MM-DD):", "2026-11-01");
  if (!dateStr) return;
  db.collection('users').doc(currentUser.uid).collection('settings').doc('profile').set({
    examTitle: title, examDate: dateStr
  }, { merge: true }).then(() => {
    document.getElementById('exam-title-display').innerText = title;
    userExamDate = new Date(dateStr);
    updateExamCountdown();
  });
}

function updateExamCountdown() {
  if (!userExamDate) return;
  const diffDays = Math.ceil((userExamDate - new Date()) / (1000 * 60 * 60 * 24));
  document.getElementById('exam-days-display').innerText = diffDays > 0 ? `${diffDays} Days` : 'TODAY!';
  document.getElementById('exam-date-subtitle').innerText = `Target Date: ${userExamDate.toISOString().split('T')[0]}`;
}

function editTargetGPA() {
  const gpa = prompt("Enter Target Mark/GPA Goal:", "3.70");
  if (!gpa || isNaN(gpa)) return;
  db.collection('users').doc(currentUser.uid).collection('settings').doc('profile').set({ targetGpa: parseFloat(gpa) }, { merge: true })
    .then(() => document.getElementById('target-gpa-display').innerText = parseFloat(gpa).toFixed(2));
}

// MY PDF & NOTES VAULT
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('selected-file-name').innerText = `Selected: ${file.name}`;
  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedVaultBase64 = { name: file.name, type: file.type.includes('pdf') ? 'pdf' : 'image', data: evt.target.result };
  };
  reader.readAsDataURL(file);
}

async function uploadVaultFile() {
  const title = document.getElementById('vault-title').value.trim();
  if (!title || !selectedVaultBase64) return alert("Please type a title and select a file!");

  const docId = 'vault_' + Date.now();
  const fileObj = {
    id: docId,
    uid: currentUser.uid,
    title: title,
    fileType: selectedVaultBase64.type,
    fileData: selectedVaultBase64.data,
    createdAt: new Date().toISOString()
  };

  await saveToIDB("vault_files", fileObj);

  db.collection('users').doc(currentUser.uid).collection('vault').doc(docId).set({
    title: title, fileType: selectedVaultBase64.type, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});

  document.getElementById('vault-title').value = '';
  document.getElementById('selected-file-name').innerText = '';
  selectedVaultBase64 = null;
  alert("Saved into your Vault!");
  loadVaultFiles();
}

async function loadVaultFiles() {
  if (!currentUser) return;
  const grid = document.getElementById('vault-grid');
  grid.innerHTML = '';

  const localFiles = await getFromIDB("vault_files", currentUser.uid);

  if (localFiles.length === 0) {
    grid.innerHTML = '<p class="text-slate-500 text-xs italic col-span-3">Vault is empty. Upload handwritten notes or PDFs above!</p>';
    return;
  }

  localFiles.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  localFiles.forEach(item => {
    const card = document.createElement('div');
    card.className = "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col justify-between shadow-md";
    card.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <i class="${item.fileType === 'pdf' ? 'fa-solid fa-file-pdf text-red-400' : 'fa-solid fa-file-image text-blue-400'} text-2xl"></i>
        <div class="overflow-hidden">
          <h4 class="font-bold text-xs truncate text-slate-200">${item.title}</h4>
          <span class="text-[10px] text-slate-400 uppercase">${item.fileType}</span>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="openBase64File('${item.fileData}')" class="flex-1 bg-blue-600/20 text-blue-400 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 hover:bg-blue-600/30 transition">Open File</button>
        <button onclick="deleteVaultFile('${item.id}')" class="text-red-400 text-xs px-2 hover:text-red-300"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function deleteVaultFile(id) {
  await deleteFromIDB("vault_files", id);
  db.collection('users').doc(currentUser.uid).collection('vault').doc(id).delete().catch(() => {});
  loadVaultFiles();
}

// SAVED PAST PAPERS COLLECTION
function handlePPFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('pp-file-name').innerText = `Selected: ${file.name}`;
  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedPPBase64 = { name: file.name, data: evt.target.result };
  };
  reader.readAsDataURL(file);
}

async function uploadPastPaper() {
  const title = document.getElementById('pp-title').value.trim();
  const category = document.getElementById('pp-category').value;
  if (!title || !selectedPPBase64) return alert("Fill paper name and select a file!");

  const docId = 'pp_' + Date.now();
  const paperObj = {
    id: docId,
    uid: currentUser.uid,
    title: title,
    category: category,
    fileData: selectedPPBase64.data,
    createdAt: new Date().toISOString()
  };

  await saveToIDB("past_papers", paperObj);

  db.collection('users').doc(currentUser.uid).collection('past_papers').doc(docId).set({
    title: title, category: category, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});

  document.getElementById('pp-title').value = '';
  document.getElementById('pp-file-name').innerText = '';
  selectedPPBase64 = null;
  alert("Past Paper saved!");
  loadPastPapers();
}

async function loadPastPapers() {
  if (!currentUser) return;
  const grid = document.getElementById('pastpaper-grid');
  grid.innerHTML = '';

  const localPapers = await getFromIDB("past_papers", currentUser.uid);

  if (localPapers.length === 0) {
    grid.innerHTML = '<p class="text-slate-500 text-xs italic col-span-2">No saved past papers yet. Upload downloaded papers above!</p>';
    return;
  }

  localPapers.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  localPapers.forEach(item => {
    const card = document.createElement('div');
    card.className = "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between";
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <i class="fa-solid fa-file-pdf text-purple-400 text-2xl"></i>
        <div>
          <h4 class="font-bold text-xs text-slate-200">${item.title}</h4>
          <span class="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full mt-1 inline-block">${item.category}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="openBase64File('${item.fileData}')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-xl font-bold transition">Open</button>
        <button onclick="deletePastPaper('${item.id}')" class="text-red-400 text-xs px-1 hover:text-red-300"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function deletePastPaper(id) {
  await deleteFromIDB("past_papers", id);
  db.collection('users').doc(currentUser.uid).collection('past_papers').doc(id).delete().catch(() => {});
  loadPastPapers();
}

// ==========================================
// 2. GOOGLE GEMINI CHATBOT
// ==========================================
function setPrompt(text) {
  const input = document.getElementById('chat-user-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

function clearAIChat() {
  const chatContainer = document.getElementById('chat-messages');
  if (chatContainer) {
    chatContainer.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center shrink-0">
          <i class="fa-solid fa-robot text-purple-400 text-sm"></i>
        </div>
        <div class="bg-slate-900 border border-slate-700 text-slate-200 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed">
          Hello! 👋 I am your <strong>StudyHub AI Assistant</strong>. You can ask me ANY question—coding, math, science, essay writing, subject concepts, or general chatting! How can I help you?
        </div>
      </div>
    `;
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

async function sendChatMessage() {
  const input = document.getElementById('chat-user-input');
  const container = document.getElementById('chat-messages');
  if (!input || !container) return;

  const userText = input.value.trim();
  if (!userText) return;

  const cleanKey = GEMINI_API_KEY ? GEMINI_API_KEY.trim() : "";

  if (!cleanKey || cleanKey.includes("YOUR_GEMINI")) {
    alert("කරුණාකර API Key එක app.js හි ඇතුළත් කරන්න!");
    return;
  }

  // 1. User Message Display
  const userBubble = document.createElement('div');
  userBubble.className = "flex items-start gap-3 justify-end";
  userBubble.innerHTML = `
    <div class="bg-purple-600 text-white p-3.5 rounded-2xl rounded-tr-none text-xs max-w-[85%] leading-relaxed">
      ${escapeHTML(userText)}
    </div>
  `;
  container.appendChild(userBubble);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // 2. Loading Indicator
  const loadingId = 'loading-' + Date.now();
  const aiBubble = document.createElement('div');
  aiBubble.className = "flex items-start gap-3";
  aiBubble.id = loadingId;
  aiBubble.innerHTML = `
    <div class="w-8 h-8 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center shrink-0">
      <i class="fa-solid fa-robot text-purple-400 text-sm"></i>
    </div>
    <div class="bg-slate-900 border border-slate-700 text-slate-200 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed flex items-center gap-2">
      <i class="fa-solid fa-spinner fa-spin text-purple-400"></i> Gemini AI is thinking...
    </div>
  `;
  container.appendChild(aiBubble);
  container.scrollTop = container.scrollHeight;

  // 3. Gemini API Call (Updated to latest active model: gemini-3.6-flash)
  const models = ['gemini-3.6-flash'];
  let aiAnswerText = "";
  let realErrorMsg = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }]
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        aiAnswerText = data.candidates[0].content.parts[0].text;
        break;
      } else if (data.error) {
        realErrorMsg = `[${data.error.code || response.status}] ${data.error.message}`;
      }
    } catch (err) {
      realErrorMsg = err.message;
    }
  }

  if (!aiAnswerText) {
    aiAnswerText = `⚠️ API Connection Error: ${realErrorMsg || 'Please check your connection.'}`;
  }

  const formattedAnswer = escapeHTML(aiAnswerText)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  const loadingElem = document.getElementById(loadingId);
  if (loadingElem) {
    loadingElem.innerHTML = `
      <div class="w-8 h-8 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center shrink-0">
        <i class="fa-solid fa-robot text-purple-400 text-sm"></i>
      </div>
      <div class="bg-slate-900 border border-slate-700 text-slate-200 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed">
        ${formattedAnswer}
      </div>
    `;
  }
  container.scrollTop = container.scrollHeight;
}

// CALENDAR CLASS SCHEDULER
function addCalendarEvent() {
  const dateStr = document.getElementById('event-date').value;
  const timeStr = document.getElementById('event-time').value.trim();
  const subjectStr = document.getElementById('event-subject').value.trim();

  if (!dateStr || !timeStr || !subjectStr) {
    return alert("Please select a date, enter time, and class/subject name!");
  }

  db.collection('users').doc(currentUser.uid).collection('calendar_events').add({
    date: dateStr,
    time: timeStr,
    subject: subjectStr,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('event-time').value = '';
    document.getElementById('event-subject').value = '';
    alert("Class Scheduled on " + dateStr + "!");
  });
}

function initCalendarSchedule() {
  db.collection('users').doc(currentUser.uid).collection('calendar_events')
    .orderBy('date', 'asc')
    .onSnapshot(snapshot => {
      const container = document.getElementById('calendar-events-list');
      const dashboardToday = document.getElementById('dashboard-today-schedule');
      container.innerHTML = '';
      
      const todayStr = new Date().toISOString().split('T')[0];
      let todayEventsHTML = '';

      if (snapshot.empty) {
        container.innerHTML = '<p class="text-slate-500 italic text-xs">No scheduled events yet. Select a date above to add one!</p>';
        dashboardToday.innerHTML = '<p class="text-slate-500 italic text-xs">No entries for today. Add classes in the Calendar tab!</p>';
        return;
      }

      snapshot.forEach(doc => {
        const event = doc.data();
        const isToday = event.date === todayStr;

        if (isToday) {
          todayEventsHTML += `
            <div class="flex items-center gap-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-700">
              <i class="fa-solid fa-clock text-blue-400"></i>
              <span class="font-bold text-blue-400 text-xs">${event.time}</span>
              <span class="text-slate-200 font-medium text-xs">${event.subject}</span>
            </div>
          `;
        }

        const card = document.createElement('div');
        card.className = `flex items-center justify-between p-3.5 rounded-xl border ${isToday ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-900 border-slate-700'}`;
        card.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-center">
              <span class="text-[10px] text-blue-400 uppercase font-bold block">${event.date}</span>
              <span class="text-xs font-semibold text-slate-300">${event.time}</span>
            </div>
            <div>
              <h4 class="font-bold text-xs text-slate-100">${event.subject}</h4>
              ${isToday ? '<span class="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">Today</span>' : ''}
            </div>
          </div>
          <button onclick="db.collection('users').doc(currentUser.uid).collection('calendar_events').doc('${doc.id}').delete()" class="text-red-400 hover:text-red-300 text-xs px-2"><i class="fa-solid fa-trash-can"></i></button>
        `;
        container.appendChild(card);
      });

      dashboardToday.innerHTML = todayEventsHTML || '<p class="text-slate-500 italic text-xs">No entries scheduled for today.</p>';
    });
}

// AI SHORT NOTE GENERATOR & PDF CREATOR
async function extractPdfText() {
  const fileInput = document.getElementById('ai-pdf-file');
  const file = fileInput.files[0];
  const status = document.getElementById('pdf-status');
  
  if (!file) return alert("Please choose a PDF file first!");

  status.innerText = "Extracting text from PDF...";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    document.getElementById('ai-input-text').value = cleanAcademicText(fullText);
    status.innerText = `✓ Successfully extracted ${pdf.numPages} pages! Cleaned header noise.`;
  } catch (e) {
    status.innerText = "Error reading PDF: " + e.message;
  }
}

function cleanAcademicText(text) {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
    .replace(/(lecturer|instructor|dr\.|prof\.|university|department|module|author):?\s*[\w\s.]+/gi, '')
    .replace(/^\d+\s+|\s+\d+$/gm, '')
    .trim();
}

function generateAIShortNote() {
  const rawText = document.getElementById('ai-input-text').value.trim();
  if (!rawText) return alert("Please paste note text or upload a PDF first!");

  const cleanedText = cleanAcademicText(rawText);
  document.getElementById('ai-output-title').innerText = "AI Generated Structured Short Note";

  const sentences = cleanedText.split(/(?:\r\n|\r|\n|\. )+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  const keyFacts = sentences.slice(0, 5);
  const definitions = sentences.slice(5, 10);
  const examPoints = sentences.slice(10, 15);

  let htmlContent = `
    <div id="printable-short-note" class="bg-slate-900 border border-slate-700 p-5 rounded-xl space-y-4 text-slate-200">
      <div class="border-b border-slate-700 pb-3 text-center">
        <h2 class="text-lg font-extrabold text-blue-400">STUDYHUB LK - AI SHORT NOTE</h2>
        <p class="text-[10px] text-slate-400">Generated on ${new Date().toLocaleDateString()}</p>
      </div>

      <div>
        <h4 class="font-bold text-xs text-purple-400 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-star"></i> 1. Core Principles & Overview</h4>
        <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">
          ${keyFacts.map(f => `<li>${f}${f.endsWith('.') ? '' : '.'}</li>`).join('') || '<li>Main lesson principles summarized accurately.</li>'}
        </ul>
      </div>

      <div>
        <h4 class="font-bold text-xs text-emerald-400 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-book-bookmark"></i> 2. Key Terms & Concepts</h4>
        <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">
          ${definitions.map(d => `<li><strong>Key Definition:</strong> ${d}${d.endsWith('.') ? '' : '.'}</li>`).join('') || '<li>Key terms extracted for fast revision.</li>'}
        </ul>
      </div>

      <div>
        <h4 class="font-bold text-xs text-amber-400 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-lightbulb"></i> 3. High-Priority Exam Tips</h4>
        <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">
          ${examPoints.length > 0 ? examPoints.map(e => `<li>${e}${e.endsWith('.') ? '' : '.'}</li>`).join('') : '<li>Focus on definitions and primary operational steps during revision.</li>'}
        </ul>
      </div>
    </div>
  `;

  lastGeneratedShortNoteHTML = htmlContent;
  document.getElementById('ai-output-content').innerHTML = htmlContent;
  document.getElementById('download-note-btn').classList.remove('hidden');
}

function printGeneratedShortNote() {
  if (!lastGeneratedShortNoteHTML) return;
  const printWin = window.open('', '', 'width=800,height=900');
  printWin.document.write(`
    <html>
      <head>
        <title>StudyHub LK - Printable Short Note</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.6; }
          h2 { color: #2563eb; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; }
          h4 { color: #0f172a; margin-top: 20px; font-size: 14px; }
          ul { padding-left: 20px; font-size: 12px; }
          li { margin-bottom: 6px; }
        </style>
      </head>
      <body>
        ${lastGeneratedShortNoteHTML}
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
    </html>
  `);
  printWin.document.close();
}

// GLOBAL COMMUNITY FORUM
function createForumPost() {
  const title = document.getElementById('forum-post-title').value.trim();
  const content = document.getElementById('forum-post-content').value.trim();

  if (!currentUser || !title || !content) return alert("Fill in title and content!");

  db.collection('forum_posts').add({
    author: currentUser.displayName || currentUser.email,
    title: title, content: content, likes: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('forum-post-title').value = '';
    document.getElementById('forum-post-content').value = '';
  });
}

function loadForumPosts() {
  db.collection('forum_posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const container = document.getElementById('forum-posts-container');
      container.innerHTML = '';
      if (snapshot.empty) {
        container.innerHTML = '<p class="text-slate-500 text-xs italic">No public posts yet. Be the first to post!</p>';
        return;
      }
      snapshot.forEach(doc => {
        const post = doc.data();
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700 p-4 rounded-2xl";
        card.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-blue-400">${post.author}</span>
            <span class="text-[10px] text-slate-500">Global Public Board</span>
          </div>
          <h4 class="font-bold text-xs text-slate-100 mb-1">${post.title}</h4>
          <p class="text-xs text-slate-300 mb-3 leading-relaxed">${post.content}</p>
          <div class="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-700/60 pt-2">
            <button onclick="db.collection('forum_posts').doc('${doc.id}').update({ likes: ${ (post.likes || 0) + 1 } })" class="hover:text-red-400 transition flex items-center gap-1.5"><i class="fa-solid fa-heart text-red-500"></i> ${post.likes || 0} Helpful</button>
          </div>
        `;
        container.appendChild(card);
      });
    });
}

// GPA CALCULATOR & POMODORO TIMER
let gpaRowCount = 0;
function initGpaTable() {
  const container = document.getElementById('gpa-rows-container');
  container.innerHTML = '';
  gpaRowCount = 0;
  addGpaRow("Subject 1", 3, "4.0");
  addGpaRow("Subject 2", 3, "3.7");
}

function addGpaRow(subName = '', credits = 3, grade = "4.0") {
  gpaRowCount++;
  const container = document.getElementById('gpa-rows-container');
  const tr = document.createElement('tr');
  tr.className = "border-b border-slate-700/50";
  tr.id = `gpa-row-${gpaRowCount}`;
  tr.innerHTML = `
    <td class="py-2 pr-2"><input type="text" value="${subName || 'Subject ' + gpaRowCount}" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full"></td>
    <td class="py-2 pr-2"><input type="number" value="${credits}" class="gpa-credit bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full"></td>
    <td class="py-2 pr-2">
      <select class="gpa-grade bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full">
        <option value="4.0" ${grade === "4.0" ? "selected" : ""}>A (4.0)</option>
        <option value="3.7" ${grade === "3.7" ? "selected" : ""}>A- (3.7)</option>
        <option value="3.3" ${grade === "3.3" ? "selected" : ""}>B+ (3.3)</option>
        <option value="3.0" ${grade === "3.0" ? "selected" : ""}>B (3.0)</option>
        <option value="2.0" ${grade === "2.0" ? "selected" : ""}>C (2.0)</option>
      </select>
    </td>
    <td class="py-2 text-center"><button onclick="document.getElementById('gpa-row-${gpaRowCount}').remove()" class="text-red-400 text-xs hover:text-red-300"><i class="fa-solid fa-trash-can"></i></button></td>
  `;
  container.appendChild(tr);
}

function resetGpaCalculator() {
  initGpaTable();
  document.getElementById('gpa-result').innerText = '0.00';
}

function calculateGPA() {
  const credits = document.querySelectorAll('.gpa-credit');
  const grades = document.querySelectorAll('.gpa-grade');
  let totalPoints = 0, totalCredits = 0;
  credits.forEach((cInput, i) => {
    const c = parseFloat(cInput.value) || 0;
    const g = parseFloat(grades[i].value) || 0;
    totalPoints += c * g; totalCredits += c;
  });
  const gpaVal = totalCredits > 0 ? (totalPoints / totalCredits) : 0;
  document.getElementById('gpa-result').innerText = gpaVal.toFixed(2);
}

let timeLeft = 25 * 60, timerId = null;
function toggleTimer() {
  const btn = document.getElementById('timer-btn');
  if (timerId) { clearInterval(timerId); timerId = null; btn.innerText = 'Start'; }
  else {
    timerId = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
        const secs = String(timeLeft % 60).padStart(2, '0');
        document.getElementById('timer-display').innerText = `${mins}:${secs}`;
      }
    }, 1000);
    btn.innerText = 'Pause';
  }
}
function resetTimer() { clearInterval(timerId); timerId = null; timeLeft = 25 * 60; document.getElementById('timer-display').innerText = '25:00'; document.getElementById('timer-btn').innerText = 'Start'; }

// QUICK SCRATCHPAD
function saveScratchpadNote() {
  const title = document.getElementById('scratchpad-title').value.trim() || 'Untitled Scratchpad Note';
  const content = document.getElementById('scratchpad-content').value.trim();

  if (!currentUser || !content) return alert("Please type your note content before saving!");

  db.collection('users').doc(currentUser.uid).collection('scratchpad_notes').add({
    title: title,
    content: content,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById('scratchpad-title').value = '';
    document.getElementById('scratchpad-content').value = '';
    alert("Note saved to Cloud!");
  });
}

function clearScratchpadInput() {
  document.getElementById('scratchpad-title').value = '';
  document.getElementById('scratchpad-content').value = '';
}

function loadScratchpadNotes() {
  if (!currentUser) return;
  db.collection('users').doc(currentUser.uid).collection('scratchpad_notes')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const grid = document.getElementById('scratchpad-history-grid');
      grid.innerHTML = '';

      if (snapshot.empty) {
        grid.innerHTML = '<p class="text-slate-500 italic text-xs col-span-2">No saved notes yet. Type a note above and click save!</p>';
        return;
      }

      snapshot.forEach(doc => {
        const note = doc.data();
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col justify-between space-y-3";
        card.innerHTML = `
          <div>
            <div class="flex items-center justify-between mb-1">
              <h4 class="font-bold text-xs text-blue-400 truncate pr-2">${note.title}</h4>
              <button onclick="deleteScratchpadNote('${doc.id}')" class="text-red-400 text-xs hover:text-red-300"><i class="fa-solid fa-trash-can"></i></button>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed whitespace-pre-line">${note.content}</p>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-slate-700/60 text-[10px] text-slate-400">
            <span>Saved in Cloud</span>
            <button onclick="copyScratchpadText('${encodeURIComponent(note.content)}')" class="text-emerald-400 hover:underline flex items-center gap-1 font-bold">
              <i class="fa-solid fa-copy"></i> Copy Text
            </button>
          </div>
        `;
        grid.appendChild(card);
      });
    });
}

function copyScratchpadText(encodedText) {
  const text = decodeURIComponent(encodedText);
  navigator.clipboard.writeText(text).then(() => alert("Note copied to clipboard!"));
}

function deleteScratchpadNote(id) {
  if (confirm("Are you sure you want to delete this note?")) {
    db.collection('users').doc(currentUser.uid).collection('scratchpad_notes').doc(id).delete();
  }
}
