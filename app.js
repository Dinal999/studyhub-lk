// ==========================================
// STUDYHUB LK - MAIN APP.JS
// ==========================================

// ==========================================
// 1. GOOGLE GEMINI API CONFIGURATION
// ==========================================

// IMPORTANT:
// Put your NEW Gemini API key here.
// Do NOT use the key that was exposed in chat.
const GEMINI_API_KEY = "AQ.Ab8RN6K7Rik7CwmgqTrixLuEdY9oBgD6OZJGS51bF3Q3BDUueA";


// ==========================================
// FIREBASE CONFIGURATION
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyDKaN9vCQEU_sNSZksPW4fI8pog1F5igPI",
    authDomain: "studyhub-lk-b582f.firebaseapp.com",
    projectId: "studyhub-lk-b582f",
    storageBucket: "studyhub-lk-b582f.firebasestorage.app",
    messagingSenderId: "495293321566",
    appId: "1:495293321566:web:d63853005b2aa1f8203fcf"
};


// ==========================================
// INITIALIZE FIREBASE
// ==========================================

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();


// ==========================================
// GOOGLE AUTH PROVIDER
// ==========================================

const googleProvider = new firebase.auth.GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account"
});


// ==========================================
// PDF.JS WORKER
// ==========================================

if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}


// ==========================================
// GLOBAL VARIABLES
// ==========================================

let currentUser = null;
let userExamDate = null;
let selectedVaultBase64 = null;
let selectedPPBase64 = null;
let lastGeneratedShortNoteHTML = "";


// ==========================================
// INDEXEDDB LOCAL STORAGE ENGINE
// ==========================================

let idb = null;

const idbReq = indexedDB.open("StudyHubVaultDB", 1);

idbReq.onupgradeneeded = function (e) {

    idb = e.target.result;

    if (!idb.objectStoreNames.contains("vault_files")) {
        idb.createObjectStore("vault_files", {
            keyPath: "id"
        });
    }

    if (!idb.objectStoreNames.contains("past_papers")) {
        idb.createObjectStore("past_papers", {
            keyPath: "id"
        });
    }
};

idbReq.onsuccess = function (e) {
    idb = e.target.result;
};

idbReq.onerror = function (e) {
    console.error("IndexedDB Error:", e);
};


function saveToIDB(storeName, item) {

    return new Promise((resolve, reject) => {

        if (!idb) {
            resolve();
            return;
        }

        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        store.put(item);

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}


function getFromIDB(storeName, userId) {

    return new Promise((resolve) => {

        if (!idb) {
            resolve([]);
            return;
        }

        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {

            const all = req.result || [];

            resolve(
                all.filter(item => item.uid === userId)
            );
        };

        req.onerror = () => resolve([]);
    });
}


function deleteFromIDB(storeName, itemId) {

    return new Promise((resolve) => {

        if (!idb) {
            resolve();
            return;
        }

        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        store.delete(itemId);

        tx.oncomplete = () => resolve();
    });
}


// ==========================================
// NAVIGATION
// ==========================================

function switchTab(tabId, event) {

    document
        .querySelectorAll(".tab-content")
        .forEach(tab => {
            tab.classList.add("hidden");
        });

    document
        .querySelectorAll(".nav-btn")
        .forEach(btn => {
            btn.classList.remove("active");
        });

    const tab = document.getElementById(`tab-${tabId}`);

    if (tab) {
        tab.classList.remove("hidden");
    }

    if (event && event.currentTarget) {
        event.currentTarget.classList.add("active");
    }
}


// ==========================================
// GOOGLE LOGIN
// ==========================================

function loginWithGoogle() {

    console.log("Google Login button clicked");

    auth.signInWithPopup(googleProvider)
        .then(result => {

            console.log(
                "Google Login Successful:",
                result.user.email
            );

        })
        .catch(error => {

            console.error(
                "Google Login Error:",
                error
            );

            alert(
                "Login Error:\n\n" +
                (error.code || "unknown-error") +
                "\n\n" +
                error.message
            );
        });
}


// Make available to inline HTML onclick
window.loginWithGoogle = loginWithGoogle;


// ==========================================
// LOGOUT
// ==========================================

function logout() {

    auth.signOut()
        .catch(error => {

            console.error(
                "Logout Error:",
                error
            );

            alert(
                "Logout Error:\n\n" +
                error.message
            );
        });
}

window.logout = logout;


// ==========================================
// FIREBASE AUTH STATE
// ==========================================

auth.onAuthStateChanged(function (user) {

    const loginScreen =
        document.getElementById("login-screen");

    const appScreen =
        document.getElementById("app-screen");

    if (user) {

        console.log(
            "Logged in:",
            user.email
        );

        currentUser = user;

        if (loginScreen) {
            loginScreen.classList.add("hidden");
        }

        if (appScreen) {
            appScreen.classList.remove("hidden");
        }

        const userName =
            document.getElementById("user-name");

        if (userName) {
            userName.innerText =
                user.displayName || user.email;
        }

        loadUserData();
        loadVaultFiles();
        loadPastPapers();
        initCalendarSchedule();
        loadForumPosts();
        initGpaTable();
        loadScratchpadNotes();

        const todayStr =
            new Date().toISOString().split("T")[0];

        const dateInput =
            document.getElementById("event-date");

        if (dateInput) {
            dateInput.value = todayStr;
        }

    } else {

        console.log("No user logged in");

        currentUser = null;

        if (loginScreen) {
            loginScreen.classList.remove("hidden");
        }

        if (appScreen) {
            appScreen.classList.add("hidden");
        }
    }
});


// ==========================================
// PDF & IMAGE BASE64 OPENER
// ==========================================

function openBase64File(base64Data) {

    try {

        const arr = base64Data.split(",");

        if (arr.length < 2) {
            throw new Error("Invalid file data.");
        }

        const mimeMatch =
            arr[0].match(/:(.*?);/);

        if (!mimeMatch) {
            throw new Error("Could not detect file type.");
        }

        const mime = mimeMatch[1];

        const bstr = atob(arr[1]);

        let n = bstr.length;

        const u8arr = new Uint8Array(n);

        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }

        const blob =
            new Blob(
                [u8arr],
                { type: mime }
            );

        const blobUrl =
            URL.createObjectURL(blob);

        window.open(blobUrl, "_blank");

    } catch (e) {

        console.error(e);

        alert(
            "Error opening file: " +
            e.message
        );
    }
}

window.openBase64File = openBase64File;


// ==========================================
// DASHBOARD & TO-DO TASKS
// ==========================================

function addTodo() {

    const input =
        document.getElementById("todo-input");

    const text =
        input.value.trim();

    if (!currentUser || !text) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("todos")
        .add({
            text: text,
            completed: false,
            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {

            input.value = "";

        })
        .catch(error => {

            console.error(
                "Add Todo Error:",
                error
            );

            alert(
                "Could not add task:\n" +
                error.message
            );
        });
}

window.addTodo = addTodo;


function loadUserData() {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("todos")
        .orderBy("createdAt", "desc")
        .onSnapshot(
            snapshot => {

                const todoList =
                    document.getElementById("todo-list");

                if (!todoList) {
                    return;
                }

                todoList.innerHTML = "";

                const count =
                    document.getElementById(
                        "total-tasks-count"
                    );

                if (count) {
                    count.innerText =
                        snapshot.size;
                }

                if (snapshot.empty) {

                    todoList.innerHTML =
                        '<p class="text-slate-500 text-xs italic">No active tasks. Add one above!</p>';

                    return;
                }

                snapshot.forEach(doc => {

                    const data = doc.data();

                    const li =
                        document.createElement("li");

                    li.className =
                        "flex items-center gap-3 bg-slate-800 p-3 rounded-xl border border-slate-700";

                    const checkbox =
                        document.createElement("input");

                    checkbox.type = "checkbox";
                    checkbox.checked =
                        !!data.completed;

                    checkbox.className =
                        "w-4 h-4 accent-blue-500";

                    checkbox.onclick =
                        function () {
                            toggleTask(
                                doc.id,
                                !!data.completed
                            );
                        };

                    const span =
                        document.createElement("span");

                    span.className =
                        "flex-1 text-xs text-slate-200";

                    if (data.completed) {
                        span.classList.add(
                            "line-through",
                            "text-slate-500"
                        );
                    }

                    span.textContent =
                        data.text || "";

                    const button =
                        document.createElement("button");

                    button.className =
                        "text-red-400 text-xs hover:underline";

                    button.textContent =
                        "Delete";

                    button.onclick =
                        function () {
                            deleteTask(doc.id);
                        };

                    li.appendChild(checkbox);
                    li.appendChild(span);
                    li.appendChild(button);

                    todoList.appendChild(li);
                });
            },
            error => {

                console.error(
                    "Todo Snapshot Error:",
                    error
                );
            }
        );


    db.collection("users")
        .doc(currentUser.uid)
        .collection("settings")
        .doc("profile")
        .get()
        .then(doc => {

            if (!doc.exists) {
                return;
            }

            const data = doc.data();

            if (data.targetGpa !== undefined) {

                const target =
                    document.getElementById(
                        "target-gpa-display"
                    );

                if (target) {
                    target.innerText =
                        parseFloat(
                            data.targetGpa
                        ).toFixed(2);
                }
            }

            if (
                data.examTitle &&
                data.examDate
            ) {

                userExamDate =
                    new Date(data.examDate);

                const title =
                    document.getElementById(
                        "exam-title-display"
                    );

                if (title) {
                    title.innerText =
                        data.examTitle;
                }

                updateExamCountdown();
            }
        })
        .catch(error => {

            console.error(
                "Profile Load Error:",
                error
            );
        });
}


function toggleTask(id, currentStatus) {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("todos")
        .doc(id)
        .update({
            completed: !currentStatus
        })
        .catch(error => {

            console.error(
                "Toggle Task Error:",
                error
            );
        });
}

window.toggleTask = toggleTask;


function deleteTask(id) {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("todos")
        .doc(id)
        .delete()
        .catch(error => {

            console.error(
                "Delete Task Error:",
                error
            );
        });
}

window.deleteTask = deleteTask;


function editExamSettings() {

    if (!currentUser) {
        return;
    }

    const title =
        prompt(
            "Enter Exam Name:",
            "A/L Exam / Semester Exam"
        );

    if (!title) {
        return;
    }

    const dateStr =
        prompt(
            "Enter Target Date (YYYY-MM-DD):",
            "2026-11-01"
        );

    if (!dateStr) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("settings")
        .doc("profile")
        .set(
            {
                examTitle: title,
                examDate: dateStr
            },
            { merge: true }
        )
        .then(() => {

            const titleDisplay =
                document.getElementById(
                    "exam-title-display"
                );

            if (titleDisplay) {
                titleDisplay.innerText =
                    title;
            }

            userExamDate =
                new Date(dateStr);

            updateExamCountdown();

        })
        .catch(error => {

            console.error(
                "Exam Settings Error:",
                error
            );

            alert(
                "Could not save exam settings:\n" +
                error.message
            );
        });
}

window.editExamSettings = editExamSettings;


function updateExamCountdown() {

    if (!userExamDate) {
        return;
    }

    const diffDays =
        Math.ceil(
            (
                userExamDate - new Date()
            ) /
            (1000 * 60 * 60 * 24)
        );

    const daysDisplay =
        document.getElementById(
            "exam-days-display"
        );

    const dateSubtitle =
        document.getElementById(
            "exam-date-subtitle"
        );

    if (daysDisplay) {

        daysDisplay.innerText =
            diffDays > 0
                ? `${diffDays} Days`
                : "TODAY!";
    }

    if (dateSubtitle) {

        dateSubtitle.innerText =
            `Target Date: ${
                userExamDate
                    .toISOString()
                    .split("T")[0]
            }`;
    }
}


function editTargetGPA() {

    if (!currentUser) {
        return;
    }

    const gpa =
        prompt(
            "Enter Target Mark/GPA Goal:",
            "3.70"
        );

    if (!gpa || isNaN(gpa)) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("settings")
        .doc("profile")
        .set(
            {
                targetGpa: parseFloat(gpa)
            },
            { merge: true }
        )
        .then(() => {

            const target =
                document.getElementById(
                    "target-gpa-display"
                );

            if (target) {
                target.innerText =
                    parseFloat(gpa).toFixed(2);
            }

        })
        .catch(error => {

            console.error(
                "Target GPA Error:",
                error
            );

            alert(
                "Could not save target GPA:\n" +
                error.message
            );
        });
}

window.editTargetGPA = editTargetGPA;


// ==========================================
// MY PDF & NOTES VAULT
// ==========================================

function handleFileSelect(e) {

    const file =
        e.target.files[0];

    if (!file) {
        return;
    }

    const selected =
        document.getElementById(
            "selected-file-name"
        );

    if (selected) {
        selected.innerText =
            `Selected: ${file.name}`;
    }

    const reader =
        new FileReader();

    reader.onload =
        function (evt) {

            selectedVaultBase64 = {

                name: file.name,

                type:
                    file.type.includes("pdf")
                        ? "pdf"
                        : "image",

                data:
                    evt.target.result
            };
        };

    reader.readAsDataURL(file);
}

window.handleFileSelect = handleFileSelect;


async function uploadVaultFile() {

    if (!currentUser) {
        return alert("Please login first!");
    }

    const title =
        document
            .getElementById("vault-title")
            .value
            .trim();

    if (!title || !selectedVaultBase64) {

        return alert(
            "Please type a title and select a file!"
        );
    }

    try {

        const docId =
            "vault_" + Date.now();

        const fileObj = {

            id: docId,

            uid: currentUser.uid,

            title: title,

            fileType:
                selectedVaultBase64.type,

            fileData:
                selectedVaultBase64.data,

            createdAt:
                new Date().toISOString()
        };

        await saveToIDB(
            "vault_files",
            fileObj
        );

        await db.collection("users")
            .doc(currentUser.uid)
            .collection("vault")
            .doc(docId)
            .set({

                title: title,

                fileType:
                    selectedVaultBase64.type,

                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp()
            });

        document.getElementById(
            "vault-title"
        ).value = "";

        document.getElementById(
            "selected-file-name"
        ).innerText = "";

        selectedVaultBase64 = null;

        alert(
            "Saved into your Vault!"
        );

        loadVaultFiles();

    } catch (error) {

        console.error(
            "Vault Upload Error:",
            error
        );

        alert(
            "Could not save file:\n" +
            error.message
        );
    }
}

window.uploadVaultFile = uploadVaultFile;


async function loadVaultFiles() {

    if (!currentUser) {
        return;
    }

    const grid =
        document.getElementById(
            "vault-grid"
        );

    if (!grid) {
        return;
    }

    grid.innerHTML = "";

    const localFiles =
        await getFromIDB(
            "vault_files",
            currentUser.uid
        );

    if (localFiles.length === 0) {

        grid.innerHTML =
            '<p class="text-slate-500 text-xs italic col-span-3">Vault is empty. Upload handwritten notes or PDFs above!</p>';

        return;
    }

    localFiles.sort(
        (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
    );

    localFiles.forEach(item => {

        const card =
            document.createElement("div");

        card.className =
            "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col justify-between shadow-md";


        const top =
            document.createElement("div");

        top.className =
            "flex items-center gap-3 mb-3";


        const icon =
            document.createElement("i");

        icon.className =
            item.fileType === "pdf"
                ? "fa-solid fa-file-pdf text-red-400 text-2xl"
                : "fa-solid fa-file-image text-blue-400 text-2xl";


        const info =
            document.createElement("div");

        info.className =
            "overflow-hidden";


        const title =
            document.createElement("h4");

        title.className =
            "font-bold text-xs truncate text-slate-200";

        title.textContent =
            item.title;


        const type =
            document.createElement("span");

        type.className =
            "text-[10px] text-slate-400 uppercase";

        type.textContent =
            item.fileType;


        info.appendChild(title);
        info.appendChild(type);

        top.appendChild(icon);
        top.appendChild(info);


        const buttons =
            document.createElement("div");

        buttons.className =
            "flex gap-2";


        const openButton =
            document.createElement("button");

        openButton.className =
            "flex-1 bg-blue-600/20 text-blue-400 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 hover:bg-blue-600/30 transition";

        openButton.textContent =
            "Open File";

        openButton.onclick =
            function () {
                openBase64File(
                    item.fileData
                );
            };


        const deleteButton =
            document.createElement("button");

        deleteButton.className =
            "text-red-400 text-xs px-2 hover:text-red-300";

        deleteButton.innerHTML =
            '<i class="fa-solid fa-trash-can"></i>';

        deleteButton.onclick =
            function () {
                deleteVaultFile(item.id);
            };


        buttons.appendChild(openButton);
        buttons.appendChild(deleteButton);

        card.appendChild(top);
        card.appendChild(buttons);

        grid.appendChild(card);
    });
}


async function deleteVaultFile(id) {

    if (!currentUser) {
        return;
    }

    await deleteFromIDB(
        "vault_files",
        id
    );

    db.collection("users")
        .doc(currentUser.uid)
        .collection("vault")
        .doc(id)
        .delete()
        .catch(error => {

            console.error(
                "Firestore Vault Delete Error:",
                error
            );
        });

    loadVaultFiles();
}

window.deleteVaultFile = deleteVaultFile;


// ==========================================
// SAVED PAST PAPERS
// ==========================================

function handlePPFileSelect(e) {

    const file =
        e.target.files[0];

    if (!file) {
        return;
    }

    const name =
        document.getElementById(
            "pp-file-name"
        );

    if (name) {
        name.innerText =
            `Selected: ${file.name}`;
    }

    const reader =
        new FileReader();

    reader.onload =
        function (evt) {

            selectedPPBase64 = {

                name: file.name,

                data:
                    evt.target.result
            };
        };

    reader.readAsDataURL(file);
}

window.handlePPFileSelect = handlePPFileSelect;


async function uploadPastPaper() {

    if (!currentUser) {
        return alert("Please login first!");
    }

    const title =
        document
            .getElementById("pp-title")
            .value
            .trim();

    const category =
        document.getElementById(
            "pp-category"
        ).value;

    if (!title || !selectedPPBase64) {

        return alert(
            "Fill paper name and select a file!"
        );
    }

    try {

        const docId =
            "pp_" + Date.now();

        const paperObj = {

            id: docId,

            uid: currentUser.uid,

            title: title,

            category: category,

            fileData:
                selectedPPBase64.data,

            createdAt:
                new Date().toISOString()
        };

        await saveToIDB(
            "past_papers",
            paperObj
        );

        await db.collection("users")
            .doc(currentUser.uid)
            .collection("past_papers")
            .doc(docId)
            .set({

                title: title,

                category: category,

                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp()
            });

        document.getElementById(
            "pp-title"
        ).value = "";

        document.getElementById(
            "pp-file-name"
        ).innerText = "";

        selectedPPBase64 = null;

        alert(
            "Past Paper saved!"
        );

        loadPastPapers();

    } catch (error) {

        console.error(
            "Past Paper Upload Error:",
            error
        );

        alert(
            "Could not save past paper:\n" +
            error.message
        );
    }
}

window.uploadPastPaper = uploadPastPaper;


async function loadPastPapers() {

    if (!currentUser) {
        return;
    }

    const grid =
        document.getElementById(
            "pastpaper-grid"
        );

    if (!grid) {
        return;
    }

    grid.innerHTML = "";

    const localPapers =
        await getFromIDB(
            "past_papers",
            currentUser.uid
        );

    if (localPapers.length === 0) {

        grid.innerHTML =
            '<p class="text-slate-500 text-xs italic col-span-2">No saved past papers yet. Upload downloaded papers above!</p>';

        return;
    }

    localPapers.sort(
        (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
    );

    localPapers.forEach(item => {

        const card =
            document.createElement("div");

        card.className =
            "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between";


        const left =
            document.createElement("div");

        left.className =
            "flex items-center gap-3";


        const icon =
            document.createElement("i");

        icon.className =
            "fa-solid fa-file-pdf text-purple-400 text-2xl";


        const info =
            document.createElement("div");


        const title =
            document.createElement("h4");

        title.className =
            "font-bold text-xs text-slate-200";

        title.textContent =
            item.title;


        const category =
            document.createElement("span");

        category.className =
            "text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full mt-1 inline-block";

        category.textContent =
            item.category;


        info.appendChild(title);
        info.appendChild(category);

        left.appendChild(icon);
        left.appendChild(info);


        const buttons =
            document.createElement("div");

        buttons.className =
            "flex items-center gap-2";


        const open =
            document.createElement("button");

        open.className =
            "bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-xl font-bold transition";

        open.textContent =
            "Open";

        open.onclick =
            function () {
                openBase64File(
                    item.fileData
                );
            };


        const del =
            document.createElement("button");

        del.className =
            "text-red-400 text-xs px-1 hover:text-red-300";

        del.innerHTML =
            '<i class="fa-solid fa-trash-can"></i>';

        del.onclick =
            function () {
                deletePastPaper(item.id);
            };


        buttons.appendChild(open);
        buttons.appendChild(del);

        card.appendChild(left);
        card.appendChild(buttons);

        grid.appendChild(card);
    });
}


async function deletePastPaper(id) {

    if (!currentUser) {
        return;
    }

    await deleteFromIDB(
        "past_papers",
        id
    );

    db.collection("users")
        .doc(currentUser.uid)
        .collection("past_papers")
        .doc(id)
        .delete()
        .catch(error => {

            console.error(
                "Past Paper Delete Error:",
                error
            );
        });

    loadPastPapers();
}

window.deletePastPaper = deletePastPaper;


// ==========================================
// 2. GEMINI AI CHATBOT
// ==========================================

function setPrompt(text) {

    const input =
        document.getElementById(
            "chat-user-input"
        );

    if (input) {

        input.value = text;
        input.focus();
    }
}

window.setPrompt = setPrompt;


function clearAIChat() {

    const chatContainer =
        document.getElementById(
            "chat-messages"
        );

    if (!chatContainer) {
        return;
    }

    chatContainer.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-8 h-8 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center shrink-0">
                <i class="fa-solid fa-robot text-purple-400 text-sm"></i>
            </div>

            <div class="bg-slate-900 border border-slate-700 text-slate-200 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed">
                Hello! 👋 I am your
                <strong>StudyHub AI Assistant</strong>.
                You can ask me ANY question—coding, math, science,
                essay writing, subject concepts, or general chatting!
                How can I help you?
            </div>
        </div>
    `;
}

window.clearAIChat = clearAIChat;


function escapeHTML(str) {

    if (!str) {
        return "";
    }

    return String(str).replace(
        /[&<>'"]/g,
        tag => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        }[tag] || tag)
    );
}


// ==========================================
// GEMINI CHAT
// ==========================================

async function sendChatMessage() {

    const input =
        document.getElementById(
            "chat-user-input"
        );

    const container =
        document.getElementById(
            "chat-messages"
        );

    if (!input || !container) {
        return;
    }

    const userText =
        input.value.trim();

    if (!userText) {
        return;
    }

    const cleanKey =
        GEMINI_API_KEY.trim();

    if (
        !cleanKey ||
        cleanKey === "YOUR_NEW_GEMINI_API_KEY"
    ) {

        alert(
            "Gemini API Key eka missing!\n\nPlease add your new Gemini API key inside app.js."
        );

        return;
    }


    // USER MESSAGE

    const userBubble =
        document.createElement("div");

    userBubble.className =
        "flex items-start gap-3 justify-end";

    userBubble.innerHTML = `
        <div class="bg-purple-600 text-white p-3.5 rounded-2xl rounded-tr-none text-xs max-w-[85%] leading-relaxed">
            ${escapeHTML(userText)}
        </div>
    `;

    container.appendChild(userBubble);

    input.value = "";

    container.scrollTop =
        container.scrollHeight;


    // LOADING MESSAGE

    const loadingId =
        "loading-" + Date.now();

    const aiBubble =
        document.createElement("div");

    aiBubble.className =
        "flex items-start gap-3";

    aiBubble.id =
        loadingId;

    aiBubble.innerHTML = `
        <div class="w-8 h-8 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-robot text-purple-400 text-sm"></i>
        </div>

        <div class="bg-slate-900 border border-slate-700 text-slate-200 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed flex items-center gap-2">
            <i class="fa-solid fa-spinner fa-spin text-purple-400"></i>
            Gemini AI is thinking...
        </div>
    `;

    container.appendChild(aiBubble);

    container.scrollTop =
        container.scrollHeight;


    // ==========================================
    // GEMINI MODEL
    // ==========================================

    const model =
        "gemini-3.5-flash-lite";

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;


    try {

        const response =
            await fetch(
                url,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            contents: [
                                {
                                    parts: [
                                        {
                                            text: `
You are StudyHub AI Assistant.

You are an AI assistant designed for students.

Help students with:

- English
- Grammar
- Mathematics
- Programming
- Computer Science
- Academic subjects
- Study techniques
- Exam preparation
- General questions

Give accurate, clear and easy-to-understand answers.

Keep answers reasonably concise unless the student asks for detailed explanations.

Student question:

${userText}
`
                                        }
                                    ]
                                }
                            ],

                            generationConfig: {
                                temperature: 0.7,
                                maxOutputTokens: 600
                            }
                        })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data?.error?.message ||
                `HTTP Error ${response.status}`
            );
        }


        const aiAnswerText =
            data
                ?.candidates
                ?.[0]
                ?.content
                ?.parts
                ?.map(
                    part => part.text || ""
                )
                .join("") || "";


        if (!aiAnswerText) {

            throw new Error(
                "Gemini did not return a response."
            );
        }


        // SAFE FORMATTING

        const formattedAnswer =
            escapeHTML(aiAnswerText)
                .replace(
                    /\*\*(.*?)\*\*/g,
                    "<strong>$1</strong>"
                )
                .replace(
                    /\*(.*?)\*/g,
                    "<em>$1</em>"
                )
                .replace(
                    /\n/g,
                    "<br>"
                );


        const loadingElem =
            document.getElementById(
                loadingId
            );

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

        container.scrollTop =
            container.scrollHeight;

    } catch (error) {

        console.error(
            "Gemini API Error:",
            error
        );

        const loadingElem =
            document.getElementById(
                loadingId
            );

        if (loadingElem) {

            loadingElem.innerHTML = `
                <div class="w-8 h-8 bg-red-600/20 border border-red-500/40 rounded-xl flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-triangle-exclamation text-red-400 text-sm"></i>
                </div>

                <div class="bg-slate-900 border border-red-500/30 text-red-300 p-3.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] leading-relaxed">
                    <strong>AI Connection Error</strong>
                    <br><br>
                    ${escapeHTML(error.message)}
                </div>
            `;
        }

        container.scrollTop =
            container.scrollHeight;
    }
}

window.sendChatMessage = sendChatMessage;


// ==========================================
// CALENDAR CLASS SCHEDULER
// ==========================================

function addCalendarEvent() {

    if (!currentUser) {
        return alert("Please login first!");
    }

    const dateStr =
        document.getElementById(
            "event-date"
        ).value;

    const timeStr =
        document.getElementById(
            "event-time"
        ).value
        .trim();

    const subjectStr =
        document.getElementById(
            "event-subject"
        ).value
        .trim();

    if (
        !dateStr ||
        !timeStr ||
        !subjectStr
    ) {

        return alert(
            "Please select a date, enter time, and class/subject name!"
        );
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("calendar_events")
        .add({

            date: dateStr,

            time: timeStr,

            subject: subjectStr,

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {

            document.getElementById(
                "event-time"
            ).value = "";

            document.getElementById(
                "event-subject"
            ).value = "";

            alert(
                "Class Scheduled on " +
                dateStr +
                "!"
            );
        })
        .catch(error => {

            console.error(
                "Calendar Error:",
                error
            );

            alert(
                "Could not schedule class:\n" +
                error.message
            );
        });
}

window.addCalendarEvent = addCalendarEvent;


function deleteCalendarEvent(id) {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("calendar_events")
        .doc(id)
        .delete()
        .catch(error => {

            console.error(
                "Calendar Delete Error:",
                error
            );
        });
}

window.deleteCalendarEvent =
    deleteCalendarEvent;


function initCalendarSchedule() {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("calendar_events")
        .orderBy("date", "asc")
        .onSnapshot(
            snapshot => {

                const container =
                    document.getElementById(
                        "calendar-events-list"
                    );

                const dashboardToday =
                    document.getElementById(
                        "dashboard-today-schedule"
                    );

                if (!container) {
                    return;
                }

                container.innerHTML = "";

                const todayStr =
                    new Date()
                        .toISOString()
                        .split("T")[0];

                let todayEventsHTML = "";

                if (snapshot.empty) {

                    container.innerHTML =
                        '<p class="text-slate-500 italic text-xs">No scheduled events yet. Select a date above to add one!</p>';

                    if (dashboardToday) {

                        dashboardToday.innerHTML =
                            '<p class="text-slate-500 italic text-xs">No entries for today. Add classes in the Calendar tab!</p>';
                    }

                    return;
                }

                snapshot.forEach(doc => {

                    const event =
                        doc.data();

                    const isToday =
                        event.date === todayStr;


                    if (isToday) {

                        todayEventsHTML += `
                            <div class="flex items-center gap-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-700">
                                <i class="fa-solid fa-clock text-blue-400"></i>

                                <span class="font-bold text-blue-400 text-xs">
                                    ${escapeHTML(event.time || "")}
                                </span>

                                <span class="text-slate-200 font-medium text-xs">
                                    ${escapeHTML(event.subject || "")}
                                </span>
                            </div>
                        `;
                    }


                    const card =
                        document.createElement("div");

                    card.className =
                        "flex items-center justify-between p-3.5 rounded-xl border " +
                        (
                            isToday
                                ? "bg-blue-900/20 border-blue-500"
                                : "bg-slate-900 border-slate-700"
                        );


                    const left =
                        document.createElement("div");

                    left.className =
                        "flex items-center gap-3";


                    const dateBox =
                        document.createElement("div");

                    dateBox.className =
                        "bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-center";


                    const date =
                        document.createElement("span");

                    date.className =
                        "text-[10px] text-blue-400 uppercase font-bold block";

                    date.textContent =
                        event.date || "";


                    const time =
                        document.createElement("span");

                    time.className =
                        "text-xs font-semibold text-slate-300";

                    time.textContent =
                        event.time || "";


                    dateBox.appendChild(date);
                    dateBox.appendChild(time);


                    const info =
                        document.createElement("div");


                    const subject =
                        document.createElement("h4");

                    subject.className =
                        "font-bold text-xs text-slate-100";

                    subject.textContent =
                        event.subject || "";


                    info.appendChild(subject);


                    if (isToday) {

                        const today =
                            document.createElement("span");

                        today.className =
                            "text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold";

                        today.textContent =
                            "Today";

                        info.appendChild(today);
                    }


                    left.appendChild(dateBox);
                    left.appendChild(info);


                    const deleteButton =
                        document.createElement("button");

                    deleteButton.className =
                        "text-red-400 hover:text-red-300 text-xs px-2";

                    deleteButton.innerHTML =
                        '<i class="fa-solid fa-trash-can"></i>';

                    deleteButton.onclick =
                        function () {
                            deleteCalendarEvent(
                                doc.id
                            );
                        };


                    card.appendChild(left);
                    card.appendChild(deleteButton);

                    container.appendChild(card);
                });


                if (dashboardToday) {

                    dashboardToday.innerHTML =
                        todayEventsHTML ||
                        '<p class="text-slate-500 italic text-xs">No entries scheduled for today.</p>';
                }
            },
            error => {

                console.error(
                    "Calendar Snapshot Error:",
                    error
                );
            }
        );
}


// ==========================================
// AI SHORT NOTE GENERATOR
// ==========================================

async function extractPdfText() {

    const fileInput =
        document.getElementById(
            "ai-pdf-file"
        );

    const file =
        fileInput.files[0];

    const status =
        document.getElementById(
            "pdf-status"
        );

    if (!file) {

        return alert(
            "Please choose a PDF file first!"
        );
    }

    if (typeof pdfjsLib === "undefined") {

        return alert(
            "PDF.js library could not be loaded."
        );
    }

    status.innerText =
        "Extracting text from PDF...";

    try {

        const arrayBuffer =
            await file.arrayBuffer();

        const pdf =
            await pdfjsLib.getDocument({
                data: arrayBuffer
            }).promise;

        let fullText = "";

        for (
            let i = 1;
            i <= pdf.numPages;
            i++
        ) {

            const page =
                await pdf.getPage(i);

            const textContent =
                await page.getTextContent();

            const pageText =
                textContent.items
                    .map(item => item.str)
                    .join(" ");

            fullText +=
                pageText + "\n";
        }

        document.getElementById(
            "ai-input-text"
        ).value =
            cleanAcademicText(fullText);

        status.innerText =
            `✓ Successfully extracted ${pdf.numPages} pages! Cleaned header noise.`;

    } catch (e) {

        console.error(
            "PDF Error:",
            e
        );

        status.innerText =
            "Error reading PDF: " +
            e.message;
    }
}

window.extractPdfText = extractPdfText;


function cleanAcademicText(text) {

    return text
        .replace(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
            ""
        )
        .replace(
            /(lecturer|instructor|dr\.|prof\.|university|department|module|author):?\s*[\w\s.]+/gi,
            ""
        )
        .replace(
            /^\d+\s+|\s+\d+$/gm,
            ""
        )
        .trim();
}


function generateAIShortNote() {

    const rawText =
        document.getElementById(
            "ai-input-text"
        ).value.trim();

    if (!rawText) {

        return alert(
            "Please paste note text or upload a PDF first!"
        );
    }

    const cleanedText =
        cleanAcademicText(rawText);

    document.getElementById(
        "ai-output-title"
    ).innerText =
        "AI Generated Structured Short Note";


    const sentences =
        cleanedText
            .split(/(?:\r\n|\r|\n|\.\s+)/)
            .map(s => s.trim())
            .filter(
                s => s.length > 15
            );


    const keyFacts =
        sentences.slice(0, 5);

    const definitions =
        sentences.slice(5, 10);

    const examPoints =
        sentences.slice(10, 15);


    const safeKeyFacts =
        keyFacts.map(
            f => escapeHTML(f)
        );

    const safeDefinitions =
        definitions.map(
            d => escapeHTML(d)
        );

    const safeExamPoints =
        examPoints.map(
            e => escapeHTML(e)
        );


    let htmlContent = `

        <div
            id="printable-short-note"
            class="bg-slate-900 border border-slate-700 p-5 rounded-xl space-y-4 text-slate-200"
        >

            <div class="border-b border-slate-700 pb-3 text-center">

                <h2 class="text-lg font-extrabold text-blue-400">
                    STUDYHUB LK - AI SHORT NOTE
                </h2>

                <p class="text-[10px] text-slate-400">
                    Generated on ${new Date().toLocaleDateString()}
                </p>

            </div>


            <div>

                <h4 class="font-bold text-xs text-purple-400 mb-2 flex items-center gap-1.5">

                    <i class="fa-solid fa-star"></i>

                    1. Core Principles & Overview

                </h4>


                <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">

                    ${
                        safeKeyFacts
                            .map(
                                f =>
                                    `<li>${f}${f.endsWith(".") ? "" : "."}</li>`
                            )
                            .join("")
                        ||
                        "<li>Main lesson principles summarized accurately.</li>"
                    }

                </ul>

            </div>


            <div>

                <h4 class="font-bold text-xs text-emerald-400 mb-2 flex items-center gap-1.5">

                    <i class="fa-solid fa-book-bookmark"></i>

                    2. Key Terms & Concepts

                </h4>


                <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">

                    ${
                        safeDefinitions
                            .map(
                                d =>
                                    `<li><strong>Key Definition:</strong> ${d}${d.endsWith(".") ? "" : "."}</li>`
                            )
                            .join("")
                        ||
                        "<li>Key terms extracted for fast revision.</li>"
                    }

                </ul>

            </div>


            <div>

                <h4 class="font-bold text-xs text-amber-400 mb-2 flex items-center gap-1.5">

                    <i class="fa-solid fa-lightbulb"></i>

                    3. High-Priority Exam Tips

                </h4>


                <ul class="list-disc pl-4 space-y-1.5 text-xs text-slate-300">

                    ${
                        safeExamPoints.length > 0
                            ? safeExamPoints
                                .map(
                                    e =>
                                        `<li>${e}${e.endsWith(".") ? "" : "."}</li>`
                                )
                                .join("")
                            :
                            "<li>Focus on definitions and primary operational steps during revision.</li>"
                    }

                </ul>

            </div>

        </div>
    `;


    lastGeneratedShortNoteHTML =
        htmlContent;


    document.getElementById(
        "ai-output-content"
    ).innerHTML =
        htmlContent;


    document.getElementById(
        "download-note-btn"
    ).classList.remove(
        "hidden"
    );
}

window.generateAIShortNote =
    generateAIShortNote;


function printGeneratedShortNote() {

    if (!lastGeneratedShortNoteHTML) {
        return;
    }

    const printWin =
        window.open(
            "",
            "",
            "width=800,height=900"
        );

    if (!printWin) {

        alert(
            "Popup blocked! Please allow popups for StudyHub LK."
        );

        return;
    }

    printWin.document.write(`
        <html>

        <head>

            <title>
                StudyHub LK - Printable Short Note
            </title>

            <style>

                body {
                    font-family: Arial, sans-serif;
                    padding: 30px;
                    color: #1e293b;
                    line-height: 1.6;
                }

                h2 {
                    color: #2563eb;
                    border-bottom: 2px solid #cbd5e1;
                    padding-bottom: 8px;
                }

                h4 {
                    color: #0f172a;
                    margin-top: 20px;
                    font-size: 14px;
                }

                ul {
                    padding-left: 20px;
                    font-size: 12px;
                }

                li {
                    margin-bottom: 6px;
                }

            </style>

        </head>

        <body>

            ${lastGeneratedShortNoteHTML}

            <script>

                window.onload = function() {

                    window.print();

                    window.close();

                };

            <\/script>

        </body>

        </html>
    `);

    printWin.document.close();
}

window.printGeneratedShortNote =
    printGeneratedShortNote;


// ==========================================
// GLOBAL COMMUNITY FORUM
// ==========================================

function createForumPost() {

    if (!currentUser) {
        return alert("Please login first!");
    }

    const title =
        document.getElementById(
            "forum-post-title"
        ).value.trim();

    const content =
        document.getElementById(
            "forum-post-content"
        ).value.trim();

    if (!title || !content) {

        return alert(
            "Fill in title and content!"
        );
    }

    db.collection("forum_posts")
        .add({

            author:
                currentUser.displayName ||
                currentUser.email,

            uid:
                currentUser.uid,

            title: title,

            content: content,

            likes: 0,

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {

            document.getElementById(
                "forum-post-title"
            ).value = "";

            document.getElementById(
                "forum-post-content"
            ).value = "";

        })
        .catch(error => {

            console.error(
                "Forum Post Error:",
                error
            );

            alert(
                "Could not create post:\n" +
                error.message
            );
        });
}

window.createForumPost =
    createForumPost;


function likeForumPost(id, currentLikes) {

    db.collection("forum_posts")
        .doc(id)
        .update({
            likes:
                (currentLikes || 0) + 1
        })
        .catch(error => {

            console.error(
                "Like Error:",
                error
            );
        });
}

window.likeForumPost =
    likeForumPost;


function loadForumPosts() {

    db.collection("forum_posts")
        .orderBy("createdAt", "desc")
        .onSnapshot(
            snapshot => {

                const container =
                    document.getElementById(
                        "forum-posts-container"
                    );

                if (!container) {
                    return;
                }

                container.innerHTML = "";

                if (snapshot.empty) {

                    container.innerHTML =
                        '<p class="text-slate-500 text-xs italic">No public posts yet. Be the first to post!</p>';

                    return;
                }

                snapshot.forEach(doc => {

                    const post =
                        doc.data();

                    const card =
                        document.createElement("div");

                    card.className =
                        "bg-slate-800 border border-slate-700 p-4 rounded-2xl";


                    const header =
                        document.createElement("div");

                    header.className =
                        "flex items-center justify-between mb-2";


                    const author =
                        document.createElement("span");

                    author.className =
                        "text-xs font-bold text-blue-400";

                    author.textContent =
                        post.author || "Student";


                    const global =
                        document.createElement("span");

                    global.className =
                        "text-[10px] text-slate-500";

                    global.textContent =
                        "Global Public Board";


                    header.appendChild(author);
                    header.appendChild(global);


                    const title =
                        document.createElement("h4");

                    title.className =
                        "font-bold text-xs text-slate-100 mb-1";

                    title.textContent =
                        post.title || "";


                    const content =
                        document.createElement("p");

                    content.className =
                        "text-xs text-slate-300 mb-3 leading-relaxed";

                    content.textContent =
                        post.content || "";


                    const footer =
                        document.createElement("div");

                    footer.className =
                        "flex items-center gap-4 text-xs text-slate-400 border-t border-slate-700/60 pt-2";


                    const likeButton =
                        document.createElement("button");

                    likeButton.className =
                        "hover:text-red-400 transition flex items-center gap-1.5";


                    likeButton.innerHTML =
                        `<i class="fa-solid fa-heart text-red-500"></i> ${
                            post.likes || 0
                        } Helpful`;


                    likeButton.onclick =
                        function () {

                            likeForumPost(
                                doc.id,
                                post.likes || 0
                            );
                        };


                    footer.appendChild(
                        likeButton
                    );


                    card.appendChild(header);
                    card.appendChild(title);
                    card.appendChild(content);
                    card.appendChild(footer);

                    container.appendChild(card);
                });
            },
            error => {

                console.error(
                    "Forum Snapshot Error:",
                    error
                );
            }
        );
}


// ==========================================
// GPA CALCULATOR
// ==========================================

let gpaRowCount = 0;


function initGpaTable() {

    const container =
        document.getElementById(
            "gpa-rows-container"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    gpaRowCount = 0;

    addGpaRow(
        "Subject 1",
        3,
        "4.0"
    );

    addGpaRow(
        "Subject 2",
        3,
        "3.7"
    );
}


function addGpaRow(
    subName = "",
    credits = 3,
    grade = "4.0"
) {

    gpaRowCount++;

    const container =
        document.getElementById(
            "gpa-rows-container"
        );

    if (!container) {
        return;
    }

    const rowId =
        `gpa-row-${gpaRowCount}`;

    const tr =
        document.createElement("tr");

    tr.className =
        "border-b border-slate-700/50";

    tr.id =
        rowId;


    const subjectTd =
        document.createElement("td");

    subjectTd.className =
        "py-2 pr-2";


    const subjectInput =
        document.createElement("input");

    subjectInput.type =
        "text";

    subjectInput.value =
        subName ||
        `Subject ${gpaRowCount}`;

    subjectInput.className =
        "bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full";


    subjectTd.appendChild(
        subjectInput
    );


    const creditTd =
        document.createElement("td");

    creditTd.className =
        "py-2 pr-2";


    const creditInput =
        document.createElement("input");

    creditInput.type =
        "number";

    creditInput.value =
        credits;

    creditInput.className =
        "gpa-credit bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full";


    creditTd.appendChild(
        creditInput
    );


    const gradeTd =
        document.createElement("td");

    gradeTd.className =
        "py-2 pr-2";


    const select =
        document.createElement("select");

    select.className =
        "gpa-grade bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full";


    const grades = [
        ["4.0", "A (4.0)"],
        ["3.7", "A- (3.7)"],
        ["3.3", "B+ (3.3)"],
        ["3.0", "B (3.0)"],
        ["2.0", "C (2.0)"]
    ];


    grades.forEach(g => {

        const option =
            document.createElement("option");

        option.value =
            g[0];

        option.textContent =
            g[1];

        if (grade === g[0]) {
            option.selected = true;
        }

        select.appendChild(
            option
        );
    });


    gradeTd.appendChild(
        select
    );


    const removeTd =
        document.createElement("td");

    removeTd.className =
        "py-2 text-center";


    const removeButton =
        document.createElement("button");

    removeButton.className =
        "text-red-400 text-xs hover:text-red-300";

    removeButton.innerHTML =
        '<i class="fa-solid fa-trash-can"></i>';

    removeButton.onclick =
        function () {

            const row =
                document.getElementById(
                    rowId
                );

            if (row) {
                row.remove();
            }
        };


    removeTd.appendChild(
        removeButton
    );


    tr.appendChild(subjectTd);
    tr.appendChild(creditTd);
    tr.appendChild(gradeTd);
    tr.appendChild(removeTd);

    container.appendChild(tr);
}

window.addGpaRow = addGpaRow;


function resetGpaCalculator() {

    initGpaTable();

    const result =
        document.getElementById(
            "gpa-result"
        );

    if (result) {
        result.innerText =
            "0.00";
    }
}

window.resetGpaCalculator =
    resetGpaCalculator;


function calculateGPA() {

    const credits =
        document.querySelectorAll(
            ".gpa-credit"
        );

    const grades =
        document.querySelectorAll(
            ".gpa-grade"
        );

    let totalPoints = 0;
    let totalCredits = 0;

    credits.forEach(
        (cInput, i) => {

            const c =
                parseFloat(
                    cInput.value
                ) || 0;

            const g =
                parseFloat(
                    grades[i].value
                ) || 0;

            totalPoints +=
                c * g;

            totalCredits +=
                c;
        }
    );

    const gpaVal =
        totalCredits > 0
            ? totalPoints / totalCredits
            : 0;

    const result =
        document.getElementById(
            "gpa-result"
        );

    if (result) {

        result.innerText =
            gpaVal.toFixed(2);
    }
}

window.calculateGPA =
    calculateGPA;


// ==========================================
// POMODORO TIMER
// ==========================================

let timeLeft =
    25 * 60;

let timerId =
    null;


function toggleTimer() {

    const btn =
        document.getElementById(
            "timer-btn"
        );

    if (!btn) {
        return;
    }

    if (timerId) {

        clearInterval(timerId);

        timerId = null;

        btn.innerText =
            "Start";

    } else {

        if (timeLeft <= 0) {
            timeLeft = 25 * 60;
        }

        timerId =
            setInterval(
                () => {

                    if (timeLeft > 0) {

                        timeLeft--;

                        const mins =
                            String(
                                Math.floor(
                                    timeLeft / 60
                                )
                            ).padStart(
                                2,
                                "0"
                            );

                        const secs =
                            String(
                                timeLeft % 60
                            ).padStart(
                                2,
                                "0"
                            );

                        const display =
                            document.getElementById(
                                "timer-display"
                            );

                        if (display) {

                            display.innerText =
                                `${mins}:${secs}`;
                        }

                    } else {

                        clearInterval(
                            timerId
                        );

                        timerId =
                            null;

                        btn.innerText =
                            "Start";

                        alert(
                            "Pomodoro session complete! 🎉"
                        );
                    }

                },
                1000
            );

        btn.innerText =
            "Pause";
    }
}

window.toggleTimer =
    toggleTimer;


function resetTimer() {

    clearInterval(timerId);

    timerId = null;

    timeLeft =
        25 * 60;

    const display =
        document.getElementById(
            "timer-display"
        );

    if (display) {
        display.innerText =
            "25:00";
    }

    const btn =
        document.getElementById(
            "timer-btn"
        );

    if (btn) {
        btn.innerText =
            "Start";
    }
}

window.resetTimer =
    resetTimer;


// ==========================================
// QUICK SCRATCHPAD
// ==========================================

function saveScratchpadNote() {

    if (!currentUser) {

        return alert(
            "Please login first!"
        );
    }

    const title =
        document
            .getElementById(
                "scratchpad-title"
            )
            .value
            .trim() ||
        "Untitled Scratchpad Note";


    const content =
        document
            .getElementById(
                "scratchpad-content"
            )
            .value
            .trim();


    if (!content) {

        return alert(
            "Please type your note content before saving!"
        );
    }


    db.collection("users")
        .doc(currentUser.uid)
        .collection("scratchpad_notes")
        .add({

            title: title,

            content: content,

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {

            document.getElementById(
                "scratchpad-title"
            ).value = "";

            document.getElementById(
                "scratchpad-content"
            ).value = "";

            alert(
                "Note saved to Cloud!"
            );

        })
        .catch(error => {

            console.error(
                "Scratchpad Save Error:",
                error
            );

            alert(
                "Could not save note:\n" +
                error.message
            );
        });
}

window.saveScratchpadNote =
    saveScratchpadNote;


function clearScratchpadInput() {

    document.getElementById(
        "scratchpad-title"
    ).value = "";

    document.getElementById(
        "scratchpad-content"
    ).value = "";
}

window.clearScratchpadInput =
    clearScratchpadInput;


function loadScratchpadNotes() {

    if (!currentUser) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("scratchpad_notes")
        .orderBy("createdAt", "desc")
        .onSnapshot(
            snapshot => {

                const grid =
                    document.getElementById(
                        "scratchpad-history-grid"
                    );

                if (!grid) {
                    return;
                }

                grid.innerHTML = "";


                if (snapshot.empty) {

                    grid.innerHTML =
                        '<p class="text-slate-500 italic text-xs col-span-2">No saved notes yet. Type a note above and click save!</p>';

                    return;
                }


                snapshot.forEach(doc => {

                    const note =
                        doc.data();

                    const card =
                        document.createElement(
                            "div"
                        );

                    card.className =
                        "bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col justify-between space-y-3";


                    const contentWrapper =
                        document.createElement(
                            "div"
                        );


                    const header =
                        document.createElement(
                            "div"
                        );

                    header.className =
                        "flex items-center justify-between mb-1";


                    const title =
                        document.createElement(
                            "h4"
                        );

                    title.className =
                        "font-bold text-xs text-blue-400 truncate pr-2";

                    title.textContent =
                        note.title ||
                        "Untitled";


                    const deleteButton =
                        document.createElement(
                            "button"
                        );

                    deleteButton.className =
                        "text-red-400 text-xs hover:text-red-300";

                    deleteButton.innerHTML =
                        '<i class="fa-solid fa-trash-can"></i>';

                    deleteButton.onclick =
                        function () {

                            deleteScratchpadNote(
                                doc.id
                            );
                        };


                    header.appendChild(
                        title
                    );

                    header.appendChild(
                        deleteButton
                    );


                    const noteText =
                        document.createElement(
                            "p"
                        );

                    noteText.className =
                        "text-xs text-slate-300 leading-relaxed whitespace-pre-line";

                    noteText.textContent =
                        note.content ||
                        "";


                    contentWrapper.appendChild(
                        header
                    );

                    contentWrapper.appendChild(
                        noteText
                    );


                    const footer =
                        document.createElement(
                            "div"
                        );

                    footer.className =
                        "flex justify-between items-center pt-2 border-t border-slate-700/60 text-[10px] text-slate-400";


                    const saved =
                        document.createElement(
                            "span"
                        );

                    saved.textContent =
                        "Saved in Cloud";


                    const copy =
                        document.createElement(
                            "button"
                        );

                    copy.className =
                        "text-emerald-400 hover:underline flex items-center gap-1 font-bold";

                    copy.innerHTML =
                        '<i class="fa-solid fa-copy"></i> Copy Text';

                    copy.onclick =
                        function () {

                            copyScratchpadText(
                                note.content || ""
                            );
                        };


                    footer.appendChild(
                        saved
                    );

                    footer.appendChild(
                        copy
                    );


                    card.appendChild(
                        contentWrapper
                    );

                    card.appendChild(
                        footer
                    );

                    grid.appendChild(
                        card
                    );
                });
            },
            error => {

                console.error(
                    "Scratchpad Snapshot Error:",
                    error
                );
            }
        );
}


function copyScratchpadText(text) {

    if (
        navigator.clipboard &&
        navigator.clipboard.writeText
    ) {

        navigator.clipboard
            .writeText(text)
            .then(() => {

                alert(
                    "Note copied to clipboard!"
                );

            })
            .catch(error => {

                console.error(
                    "Clipboard Error:",
                    error
                );

                fallbackCopyText(text);
            });

    } else {

        fallbackCopyText(text);
    }
}

window.copyScratchpadText =
    copyScratchpadText;


function fallbackCopyText(text) {

    const textarea =
        document.createElement(
            "textarea"
        );

    textarea.value =
        text;

    document.body.appendChild(
        textarea
    );

    textarea.select();

    try {

        document.execCommand(
            "copy"
        );

        alert(
            "Note copied to clipboard!"
        );

    } catch (error) {

        alert(
            "Could not copy note."
        );
    }

    document.body.removeChild(
        textarea
    );
}


function deleteScratchpadNote(id) {

    if (!currentUser) {
        return;
    }

    if (
        !confirm(
            "Are you sure you want to delete this note?"
        )
    ) {
        return;
    }

    db.collection("users")
        .doc(currentUser.uid)
        .collection("scratchpad_notes")
        .doc(id)
        .delete()
        .catch(error => {

            console.error(
                "Scratchpad Delete Error:",
                error
            );

            alert(
                "Could not delete note:\n" +
                error.message
            );
        });
}

window.deleteScratchpadNote =
    deleteScratchpadNote;


// ==========================================
// INITIAL SETUP
// ==========================================

console.log(
    "StudyHub LK app.js loaded successfully."
);
console.log(
    "Firebase initialized:",
    firebase.apps.length > 0
);
