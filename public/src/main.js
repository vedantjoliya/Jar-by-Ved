import { LibMedia } from "../libmedia/libmedia.js";
import { LibMidi, createUnlockingAudioContext } from "../libmidi/libmidi.js";
import { codeMap, KeyRepeatManager } from "./key.js";
import { EventQueue } from "./eventqueue.js";
import { initKbdListeners, setKbdHandler, kbdWidth, kbdHeight } from "./screenKbd.js";

// we need to import natives here, don't use System.loadLibrary
// since CheerpJ fails to load them in firefox and we can't set breakpoints
import canvasFontNatives from "../libjs/libcanvasfont.js";
import canvasGraphicsNatives from "../libjs/libcanvasgraphics.js";
import gles2Natives from "../libjs/libgles2.js";
import jsReferenceNatives from "../libjs/libjsreference.js";
import mediaBridgeNatives from "../libjs/libmediabridge.js";
import midiBridgeNatives from "../libjs/libmidibridge.js";

const evtQueue = new EventQueue();
const sp = new URLSearchParams(location.search);

const cheerpjWebRoot = '/app'+location.pathname.replace(/\/[^/]*$/,'');

let isMobile = sp.get('mobile') || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let display = null;
let screenCtx = null;
let fractionScale = true; // Always scale correctly
let scaleSet = false;

const keyRepeatManager = new KeyRepeatManager();

window.evtQueue = evtQueue;

function autoscale() {
    if (!scaleSet) return;

    let screenWidth = window.innerWidth;
    let screenHeight = window.innerHeight;

    if (isMobile) {
        document.getElementById('left-keys').style.display = '';
        document.getElementById('right-keys').style.display = '';

        if (screenWidth > screenHeight) {
            document.body.classList.add('kbd-landscape');
            document.body.classList.remove('kbd-portrait');
            screenWidth = screenWidth - 2*kbdWidth;
        } else {
            document.body.classList.add('kbd-portrait');
            document.body.classList.remove('kbd-landscape');
            screenHeight = screenHeight - kbdHeight;
        }
    }

    let scale = Math.min(
        screenWidth/screenCtx.canvas.width,
        screenHeight/screenCtx.canvas.height
    );

    if (!fractionScale) {
        scale = scale|0;
    }

    display.currentScale = scale;
    display.style.transform = `scale(${scale})`;
    display.style.transformOrigin = 'center center';
}

function setListeners() {
    let mouseDown = false;
    let noMouse = false;

    setKbdHandler((isDown, key) => {
        let symbol = '\x00';
        if (key.startsWith('Digit')) {
            symbol = key.substring(5);
        } else if (key === 'NumpadAsterisk' || key === 'NumpadMultiply') {
            symbol = '*';
        } else if (key === 'NumpadDivide') {
            symbol = '#';
        }
        keyRepeatManager.post(isDown, key, {symbol, ctrlKey: false, shiftKey: false});
    });

    function handleKeyEvent(e) {
        const isDown = e.type === 'keydown';

        if (codeMap[e.code]) {
            keyRepeatManager.post(isDown, e.code, {
                symbol: e.key.length == 1 ? e.key.charCodeAt(0) : '\x00',
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey
            })
        }
        e.preventDefault();
    }

    display.addEventListener('keydown', handleKeyEvent);
    display.addEventListener('keyup', handleKeyEvent);

    keyRepeatManager.register((kind, key, args) => {
        if (kind === 'click') {
            if (key === 'Maximize') {
                fractionScale = !fractionScale;
                localStorage && localStorage.setItem("pl.zb3.freej2me.fractionScale", fractionScale);
                autoscale();
            }
        } else if (codeMap[key]) {
            evtQueue.queueEvent({
                kind: kind === 'up' ? 'keyup' : 'keydown',
                args: [codeMap[key], args.symbol, args.ctrlKey, args.shiftKey]
            });
        }
    });

    function getCanvasCoords(clientX, clientY) {
        const rect = display.getBoundingClientRect();
        const rawX = clientX - rect.left;
        const rawY = clientY - rect.top;
        const scaleX = display.width / rect.width;
        const scaleY = display.height / rect.height;
        return {
            x: Math.max(0, Math.min(display.width - 1, Math.floor(rawX * scaleX))),
            y: Math.max(0, Math.min(display.height - 1, Math.floor(rawY * scaleY)))
        };
    }

    display.addEventListener('mousedown', async e => {
        display.focus();
        if (noMouse) return;

        const coords = getCanvasCoords(e.clientX, e.clientY);
        evtQueue.queueEvent({
            kind: 'pointerpressed',
            x: coords.x,
            y: coords.y,
        });

        mouseDown = true;
        e.preventDefault();
    });

    display.addEventListener('mousemove', async e => {
        if (noMouse) return;
        if (!mouseDown) return;

        const coords = getCanvasCoords(e.clientX, e.clientY);
        evtQueue.queueEvent({
            kind: 'pointerdragged',
            x: coords.x,
            y: coords.y,
        });

        e.preventDefault();
    });

    document.addEventListener('mouseup', async e => {
        if (noMouse) return;
        if (!mouseDown) return;

        mouseDown = false;
        const coords = getCanvasCoords(e.clientX, e.clientY);
        evtQueue.queueEvent({
            kind: 'pointerreleased',
            x: coords.x,
            y: coords.y,
        });

        e.preventDefault();
    });

    display.addEventListener('touchstart', async e => {
        display.focus();
        noMouse = true;

        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const coords = getCanvasCoords(touch.clientX, touch.clientY);
            evtQueue.queueEvent({
                kind: 'pointerpressed',
                x: coords.x,
                y: coords.y,
            });
        }

        e.preventDefault();
    }, {passive: false});

    display.addEventListener('touchmove', async e => {
        noMouse = true;

        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const coords = getCanvasCoords(touch.clientX, touch.clientY);
            evtQueue.queueEvent({
                kind: 'pointerdragged',
                x: coords.x,
                y: coords.y,
            });
        }

        e.preventDefault();
    }, {passive: false});

    display.addEventListener('touchend', async e => {
        noMouse = true;

        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const coords = getCanvasCoords(touch.clientX, touch.clientY);
            evtQueue.queueEvent({
                kind: 'pointerreleased',
                x: coords.x,
                y: coords.y,
            });
        }

        e.preventDefault();
    }, {passive: false});
    
    display.addEventListener('touchcancel', async e => {
        noMouse = true;

        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const coords = getCanvasCoords(touch.clientX, touch.clientY);
            evtQueue.queueEvent({
                kind: 'pointerreleased',
                x: coords.x,
                y: coords.y,
            });
        }

        e.preventDefault();
    }, {passive: false});

    document.addEventListener('mousedown', e => {
        console.log('refocus');
        setTimeout(() => display.focus(), 20);
        ;
    });

    display.addEventListener('blur', e => {
        console.log('refocus');
        // it doesn't work without any timeout
        setTimeout(() => display.focus(), 10);
        ;
    });

    window.addEventListener('resize', autoscale);

    initKbdListeners();
}

function setFaviconFromBuffer(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: 'image/png' });

    const reader = new FileReader();
    reader.onload = function() {
        const dataURL = reader.result;

        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'icon');
            document.head.appendChild(link);
        }
        link.setAttribute('href', dataURL);
    };
    reader.readAsDataURL(blob);
}

async function ensureAppInstalled(lib, appId) {
    const appFile = await cjFileBlob(appId + "/app.jar");

    if (!appFile) {
        const launcherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;

        await launcherUtil.installFromBundle(cheerpjWebRoot + "/apps/", appId);
    }
}

let startTime = Date.now();
let timerInterval = null;

function updateLoadingProgress(percent, msg, sub = '') {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = `${percent}%`;
    const statusEl = document.getElementById('loading-status');
    if (statusEl) statusEl.textContent = msg;
    const subEl = document.getElementById('loading-sub');
    if (subEl) subEl.textContent = sub;
}

function showLoadingError(errorMsg, detail = '') {
    if (timerInterval) clearInterval(timerInterval);
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
    const bar = document.getElementById('loading-bar');
    if (bar) {
        bar.style.width = '100%';
        bar.style.background = '#ef4444';
    }
    const statusEl = document.getElementById('loading-status');
    if (statusEl) statusEl.textContent = 'Emulator Error';
    const subEl = document.getElementById('loading-sub');
    if (subEl) subEl.textContent = errorMsg + (detail ? ` (${detail})` : '');
    const actionsEl = document.getElementById('loading-actions');
    if (actionsEl) actionsEl.style.display = 'flex';
}

function dismissLoadingOverlay() {
    if (scaleSet) return;
    scaleSet = true;
    if (timerInterval) clearInterval(timerInterval);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'none';
        loadingEl.classList.add('hidden');
    }
    display.style.display = '';
    display.focus();
    autoscale();
}

function hookScreenCanvas(ctx) {
    if (!ctx) return;
    const methods = ['drawImage', 'fillRect', 'putImageData', 'strokeRect'];
    methods.forEach(fn => {
        if (typeof ctx[fn] === 'function') {
            const orig = ctx[fn].bind(ctx);
            ctx[fn] = function(...args) {
                dismissLoadingOverlay();
                return orig(...args);
            };
        }
    });
}

// Global error traps for unhandled exceptions before first frame
window.addEventListener('error', (e) => {
    if (!scaleSet) {
        console.warn("Captured window error:", e.message);
    }
});
window.addEventListener('unhandledrejection', (e) => {
    if (!scaleSet) {
        console.warn("Captured unhandled rejection:", e.reason);
    }
});

async function init() {
    startTime = Date.now();
    updateLoadingProgress(20, "Loading CheerpJ...", "Preparing virtual Java environment");

    // Start live elapsed timer
    const timerEl = document.getElementById('loading-timer');
    timerInterval = setInterval(() => {
        if (scaleSet) {
            clearInterval(timerInterval);
            return;
        }
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        if (timerEl) timerEl.textContent = `${elapsedSec}s`;

        if (elapsedSec >= 10 && elapsedSec < 18) {
            updateLoadingProgress(90, "Starting Game...", `Optimizing Java bytecode (${elapsedSec}s)...`);
        } else if (elapsedSec >= 18 && elapsedSec < 30) {
            updateLoadingProgress(95, "Compiling Classes...", `First launch may take ~20-25s (${elapsedSec}s)...`);
            const actions = document.getElementById('loading-actions');
            if (actions) actions.style.display = 'flex';
        } else if (elapsedSec >= 30) {
            showLoadingError("Startup took longer than expected.", "Tap Reload or choose another title.");
        }
    }, 1000);

    display = document.getElementById('display');
    screenCtx = display.getContext('2d');
    hookScreenCanvas(screenCtx);

    setListeners();

    // Safe Non-blocking Audio Initialization
    try {
        updateLoadingProgress(35, "Starting Audio Engine...", "Configuring audio subsystem");
        const audioCtx = createUnlockingAudioContext();
        window.libmidi = new LibMidi(audioCtx);
        await Promise.race([
            window.libmidi.init(),
            new Promise(r => setTimeout(r, 2000))
        ]);
        if (window.libmidi && window.libmidi.midiPlayer) {
            window.libmidi.midiPlayer.addEventListener('end-of-media', e => {
                window.evtQueue.queueEvent({kind: 'player-eom', player: e.target});
            });
        }
    } catch (e) {
        console.warn("MIDI Audio init warning:", e);
    }

    try {
        window.libmedia = new LibMedia();
    } catch (e) {
        console.warn("LibMedia init warning:", e);
        window.libmedia = null;
    }

    updateLoadingProgress(50, "Initializing JVM Runtime...", "Configuring JVM natives");

    try {
        await cheerpjInit({
            enableDebug: false,
            natives: {
                ...canvasFontNatives,
                ...canvasGraphicsNatives,
                ...gles2Natives,
                ...jsReferenceNatives,
                ...mediaBridgeNatives,
                ...midiBridgeNatives,
                async Java_pl_zb3_freej2me_bridge_shell_Shell_setTitle(lib, title) {
                    document.title = title;
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_setIcon(lib, iconBytes) {
                    if (iconBytes) {
                        setFaviconFromBuffer(iconBytes.buffer);
                    }
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_getScreenCtx(lib) {
                    return screenCtx;
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_setCanvasSize(lib, width, height) {
                    screenCtx.canvas.width = width;
                    screenCtx.canvas.height = height;
                    dismissLoadingOverlay();
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_waitForAndDispatchEvents(lib, listener) {
                    const KeyEvent = await lib.pl.zb3.freej2me.bridge.shell.KeyEvent;
                    const PointerEvent = await lib.pl.zb3.freej2me.bridge.shell.PointerEvent;

                    const evt = await evtQueue.waitForEvent();
                    if (evt.kind == 'keydown') {
                        await listener.keyPressed(await new KeyEvent(...evt.args));
                    } else if (evt.kind == 'keyup') {
                        await listener.keyReleased(await new KeyEvent(...evt.args));
                    } else if (evt.kind == 'pointerpressed') {
                        await listener.pointerPressed(await new PointerEvent(evt.x, evt.y));
                    } else if (evt.kind == 'pointerdragged') {
                        await listener.pointerDragged(await new PointerEvent(evt.x, evt.y));
                    } else if (evt.kind == 'pointerreleased') {
                        await listener.pointerReleased(await new PointerEvent(evt.x, evt.y));
                    } else if (evt.kind == 'player-eom') {
                        await listener.playerEOM(evt.player);
                    } else if (evt.kind == 'player-video-frame') {
                        await listener.playerVideoFrame(evt.player);
                    }
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_restart(lib) {
                    location.reload();
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_exit(lib) {
                    location.href = './';
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_sthop(lib) {
                    debugger;
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_say(lib, sth) {
                    console.log('[say]', sth);
                },
                async Java_pl_zb3_freej2me_bridge_shell_Shell_sayObject(lib, label, obj) {
                    debugger;
                    console.log('[sayobject]', label, obj);
                }
            }
        });
    } catch (err) {
        console.error("CheerpJ init error:", err);
        showLoadingError("CheerpJ JVM initialization failed.", err.message || String(err));
        return;
    }

    updateLoadingProgress(70, "Loading FreeJ2ME Engine...", "Fetching emulator core");

    let lib;
    try {
        lib = await cheerpjRunLibrary(cheerpjWebRoot + "/freej2me-web.jar");
    } catch (err) {
        console.error("CheerpJ run library error:", err);
        showLoadingError("Failed to load freej2me-web.jar.", err.message || String(err));
        return;
    }

    updateLoadingProgress(85, "Launching Game...", "Starting MIDlet bytecode");

    let FreeJ2ME;
    try {
        FreeJ2ME = await lib.org.recompile.freej2me.FreeJ2ME;
    } catch (err) {
        console.error("Failed to resolve FreeJ2ME class:", err);
        showLoadingError("Failed to resolve FreeJ2ME class.", err.message || String(err));
        return;
    }

    let args;
    if (sp.get('app')) {
        const app = sp.get('app');
        try {
            await ensureAppInstalled(lib, app);
        } catch (err) {
            console.error("Failed to install app:", err);
        }
        args = ['app', sp.get('app')];
    } else {
        const jarParam = sp.get('jar') || "game.jar";
        if (jarParam.startsWith('http://') || jarParam.startsWith('https://')) {
            args = ['jar', jarParam];
        } else {
            args = ['jar', cheerpjWebRoot + "/jar/" + jarParam];
        }
    }

    FreeJ2ME.main(args).catch(e => {
        if (timerInterval) clearInterval(timerInterval);
        if (e && e.printStackTrace) e.printStackTrace();
        console.error("FreeJ2ME runtime exception:", e);
        showLoadingError("Game stopped unexpectedly.", e.message || String(e));
    });
}

init();
