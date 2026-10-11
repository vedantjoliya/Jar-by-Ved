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

// IndexedDB Helper for CheerpJ File System Sync
async function exportCheerpJDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('/str/');
    request.onerror = (e) => resolve(null); // Return null if not found
    request.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const allReq = store.getAll();
      const keysReq = store.getAllKeys();
      
      tx.oncomplete = () => {
        const data = {};
        keysReq.result.forEach((k, i) => {
          data[k] = allReq.result[i];
        });
        db.close();
        resolve(data);
      };
    };
  });
}

async function importCheerpJDB(data) {
  if (!data || Object.keys(data).length === 0) return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('/str/');
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      
      for (const [key, value] of Object.entries(data)) {
        store.put(value, key);
      }
      
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

export async function syncToCloud() {
  if (!currentUser) return;
  try {
    const data = await exportCheerpJDB();
    if (data) {
      // Convert Uint8Arrays/Blobs to Arrays for Firestore JSON
      const serialized = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && v.contents) {
          const arr = Array.from(v.contents);
          serialized[k] = { ...v, contents: arr };
        } else {
          serialized[k] = v;
        }
      }
      
      const docRef = doc(db, "saves", currentUser.uid);
      await setDoc(docRef, {
        cheerpjStr: JSON.stringify(serialized),
        timestamp: new Date().toISOString()
      }, { merge: true }); // Crucial: merge preserves preferences and customGames!
      console.log('Saved game state to cloud!');
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
        const data = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v && v.contents) {
            data[k] = { ...v, contents: new Uint8Array(v.contents) };
          } else {
            data[k] = v;
          }
        }
        await importCheerpJDB(data);
        console.log('Loaded game state from cloud!');
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
                const cheerpjData = {};
                for (const [k, v] of Object.entries(parsed)) {
                  if (v && v.contents) {
                    cheerpjData[k] = { ...v, contents: new Uint8Array(v.contents) };
                  } else {
                    cheerpjData[k] = v;
                  }
                }
                await importCheerpJDB(cheerpjData);
              } catch(e) {}
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
