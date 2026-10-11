import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAdKgD51E9KgwohWswIiKN5vaUnqOV0kHQ",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "jarbyved.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "jarbyved",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "jarbyved.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "57083781357",
  appId: env.VITE_FIREBASE_APP_ID || "1:57083781357:web:a92c0391c72d806b6b2ce4",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-6Y4J4FMKCC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

export let currentUser = null;
let syncUnsubscribe = null;

// Comprehensive IndexedDB Helper for CheerpJ File System Sync
// Exports ALL databases and stores (including /files/, /str/, and CheerpJ persistent filesystem)
async function exportCheerpJDB() {
  try {
    const dbs = await (indexedDB.databases ? indexedDB.databases() : Promise.resolve([{ name: '/files/' }, { name: '/str/' }]));
    const dbList = dbs && dbs.length ? dbs.map(d => d.name).filter(Boolean) : ['/files/', '/str/'];
    if (!dbList.includes('/files/')) dbList.push('/files/');
    if (!dbList.includes('/str/')) dbList.push('/str/');

    const exportBundle = {};

    for (const dbName of dbList) {
      const dbData = await new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => resolve(null);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (!storeNames.length) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction(storeNames, 'readonly');
          const storesData = {};
          let remaining = storeNames.length;

          storeNames.forEach((sName) => {
            const store = tx.objectStore(sName);
            const allReq = store.getAll();
            const keysReq = store.getAllKeys();
            allReq.onsuccess = () => {
              keysReq.onsuccess = () => {
                const map = {};
                keysReq.result.forEach((k, i) => {
                  const val = allReq.result[i];
                  // If Uint8Array or ArrayBuffer, convert to regular array for JSON serialization
                  if (val && val.contents && (val.contents instanceof Uint8Array || Array.isArray(val.contents))) {
                    map[k] = { ...val, contents: Array.from(val.contents) };
                  } else if (val instanceof Uint8Array) {
                    map[k] = { __type: 'Uint8Array', data: Array.from(val) };
                  } else if (val instanceof ArrayBuffer) {
                    map[k] = { __type: 'ArrayBuffer', data: Array.from(new Uint8Array(val)) };
                  } else {
                    map[k] = val;
                  }
                });
                storesData[sName] = map;
                remaining--;
                if (remaining === 0) {
                  db.close();
                  resolve(storesData);
                }
              };
            };
            allReq.onerror = () => {
              remaining--;
              if (remaining === 0) {
                db.close();
                resolve(storesData);
              }
            };
          });
        };
      });

      if (dbData && Object.keys(dbData).length > 0) {
        exportBundle[dbName] = dbData;
      }
    }

    return Object.keys(exportBundle).length > 0 ? exportBundle : null;
  } catch (err) {
    console.warn("exportCheerpJDB error:", err);
    return null;
  }
}

async function importCheerpJDB(exportBundle) {
  if (!exportBundle || typeof exportBundle !== 'object') return;
  try {
    for (const [dbName, storesData] of Object.entries(exportBundle)) {
      if (!storesData || typeof storesData !== 'object') continue;
      
      // Legacy backward-compatibility: if export was directly files map for /str/
      if (dbName.startsWith('/') && !storesData.files && typeof storesData === 'object' && Object.values(storesData).some(v => v && (v.contents || v.type))) {
        await restoreSingleStore(dbName, 'files', storesData);
        continue;
      }

      for (const [storeName, records] of Object.entries(storesData)) {
        await restoreSingleStore(dbName, storeName, records);
      }
    }
  } catch (err) {
    console.warn("importCheerpJDB error:", err);
  }
}

function restoreSingleStore(dbName, storeName, records) {
  return new Promise((resolve) => {
    // Open with version upgrade handler if store missing
    const req = indexedDB.open(dbName);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    req.onerror = () => resolve();
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        const nextVersion = (db.version || 1) + 1;
        db.close();
        const upReq = indexedDB.open(dbName, nextVersion);
        upReq.onupgradeneeded = (ev) => {
          const uDb = ev.target.result;
          if (!uDb.objectStoreNames.contains(storeName)) {
            uDb.createObjectStore(storeName);
          }
        };
        upReq.onsuccess = (ev) => {
          writeRecords(ev.target.result, storeName, records).then(resolve);
        };
        upReq.onerror = () => resolve();
        return;
      }
      writeRecords(db, storeName, records).then(resolve);
    };
  });
}

function writeRecords(db, storeName, records) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const [k, rawVal] of Object.entries(records)) {
        let val = rawVal;
        if (rawVal && rawVal.__type === 'Uint8Array') {
          val = new Uint8Array(rawVal.data);
        } else if (rawVal && rawVal.__type === 'ArrayBuffer') {
          val = new Uint8Array(rawVal.data).buffer;
        } else if (rawVal && rawVal.contents && Array.isArray(rawVal.contents)) {
          val = { ...rawVal, contents: new Uint8Array(rawVal.contents) };
        }
        store.put(val, k);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch (e) {
      db.close();
      resolve();
    }
  });
}

export async function syncToCloud() {
  if (!currentUser) return;
  try {
    const data = await exportCheerpJDB();
    if (data) {
      const docRef = doc(db, "saves", currentUser.uid);
      await setDoc(docRef, {
        cheerpjStr: JSON.stringify(data),
        timestamp: new Date().toISOString()
      }, { merge: true }); // Merge preserves preferences, customGames, and game save progress!
      console.log('Saved game state and saves to cloud!');
    }
  } catch (e) {
    console.warn("Cloud save error:", e.message);
  }
}

export async function loadFromCloud() {
  if (!currentUser) return;
  try {
    const docRef = doc(db, "saves", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const saved = docSnap.data().cheerpjStr;
      if (saved) {
        const parsed = JSON.parse(saved);
        await importCheerpJDB(parsed);
        console.log('Loaded game saves and progress from cloud!');
      }
    }
  } catch (e) {
    console.warn("Cloud load error:", e.message);
  }
}

export function setupAuth(uiElements, onReady, onRemoteSync) {
  const authBtn = uiElements.authBtn || uiElements;
  const userProfile = uiElements.profileContainer || null;
  const userAvatar = uiElements.userAvatar || null;
  const userName = uiElements.userName || null;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      if (authBtn) {
        authBtn.textContent = 'Sign Out';
        authBtn.classList.add('signed-in');
      }
      if (userName) {
        userName.textContent = user.displayName || user.email || 'Player';
      }
      if (userAvatar) {
        userAvatar.referrerPolicy = 'no-referrer';
        const getInitials = (name) => {
          if (!name) return 'P';
          const parts = name.trim().split(/\s+/);
          return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
        };
        const makeInitialsSvg = () => {
          const initials = getInitials(user.displayName || user.email);
          return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="%232563eb" rx="32"/><text x="50%" y="55%" font-family="sans-serif" font-weight="bold" font-size="22" fill="%23ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
        };

        userAvatar.onerror = () => {
          userAvatar.src = makeInitialsSvg();
        };

        if (user.photoURL) {
          userAvatar.src = user.photoURL;
        } else {
          userAvatar.src = makeInitialsSvg();
        }
        userAvatar.alt = user.displayName || 'Google Profile';
        userAvatar.style.display = 'block';
      }
      if (userProfile) {
        userProfile.style.display = 'flex';
      }
      
      // Load initial state
      await loadFromCloud();
      if (onReady) onReady(user);

      // REAL-TIME CROSS-DEVICE SYNC LISTENER
      if (syncUnsubscribe) syncUnsubscribe();
      try {
        const docRef = doc(db, "saves", user.uid);
        syncUnsubscribe = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            let hasChanged = false;

            // 1. Sync preferences (favorites & recents) across devices
            if (data.preferences) {
              const localStr = localStorage.getItem('jarbyved_prefs') || '{}';
              const cloudStr = JSON.stringify(data.preferences);
              if (localStr !== cloudStr) {
                localStorage.setItem('jarbyved_prefs', cloudStr);
                hasChanged = true;
              }
            }

            // 2. Sync CheerpJ save data across devices
            if (data.cheerpjStr) {
              try {
                const parsed = JSON.parse(data.cheerpjStr);
                await importCheerpJDB(parsed);
              } catch(e) {
                console.warn("Real-time CheerpJ save import error:", e);
              }
            }

            if (onRemoteSync) {
              onRemoteSync(data, hasChanged);
            }
          }
        }, (err) => {
          console.warn("Real-time cloud sync notice:", err.message);
        });
      } catch (err) {
        console.warn("Could not attach onSnapshot:", err);
      }
    } else {
      if (syncUnsubscribe) {
        syncUnsubscribe();
        syncUnsubscribe = null;
      }
      currentUser = null;
      if (authBtn) {
        authBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 6px;">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Sign in with Google
        `;
        authBtn.classList.remove('signed-in');
      }
      if (userAvatar) {
        userAvatar.style.display = 'none';
      }
      if (userProfile) {
        userProfile.style.display = 'none';
      }
      if (onReady) onReady(null);
    }
  });

  if (authBtn) {
    authBtn.addEventListener('click', () => {
      if (currentUser) {
        signOut(auth).catch(e => console.error(e));
      } else {
        signInWithPopup(auth, provider).catch(e => {
          console.error("Sign in error:", e);
          if (e.code === 'auth/unauthorized-domain') {
            alert(`Google Sign-In Error: Domain "${window.location.hostname}" is not authorized.\n\nFix: Go to Firebase Console -> Authentication -> Settings -> Authorized domains, and click "Add domain" -> add "${window.location.hostname}".`);
          } else if (e.code !== 'auth/popup-closed-by-user') {
            alert("Sign-In failed: " + (e.message || e.code));
          }
        });
      }
    });
  }
}

export async function uploadCustomGame(file) {
  if (!currentUser) {
    alert("Please sign in to save your custom games to the cloud.");
    return null;
  }
  try {
    const storageRef = ref(storage, `custom_games/${currentUser.uid}/${file.name}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    
    const gameData = {
      id: file.name.replace(/[^a-zA-Z0-9]/g, '_'),
      file: file.name,
      name: file.name.replace('.jar', ''),
      type: 'Custom Upload',
      url: downloadURL
    };

    const docRef = doc(db, "saves", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, {
        customGames: arrayUnion(gameData)
      });
    } else {
      await setDoc(docRef, {
        customGames: [gameData]
      });
    }
    
    return gameData;
  } catch (e) {
    console.error("Upload error:", e);
    alert("Failed to upload game. Make sure Firebase Storage rules allow uploads.");
    return null;
  }
}

export async function getCustomGames() {
  if (!currentUser) return [];
  try {
    const docRef = doc(db, "saves", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().customGames) {
      return docSnap.data().customGames;
    }
  } catch (e) {
    console.error("Error fetching custom games:", e);
  }
  return [];
}

export async function getPreferences() {
  let prefs = { favorites: [], recents: [] };
  try {
    const local = localStorage.getItem('jarbyved_prefs');
    if (local) prefs = JSON.parse(local);
  } catch(e) {}
  
  if (!currentUser) return prefs;
  try {
    const docRef = doc(db, "saves", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().preferences) {
      prefs = docSnap.data().preferences;
      localStorage.setItem('jarbyved_prefs', JSON.stringify(prefs));
    }
  } catch (e) {
    console.error("Error fetching preferences:", e);
  }
  return prefs;
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem('jarbyved_prefs', JSON.stringify(prefs));
  } catch(e) {}
  
  if (!currentUser) return;
  try {
    const docRef = doc(db, "saves", currentUser.uid);
    setDoc(docRef, { preferences: prefs }, { merge: true }).catch(err => {
      console.warn("Background preferences sync:", err.message);
    });
  } catch(e) {
    console.warn("Preferences sync error:", e);
  }
}
