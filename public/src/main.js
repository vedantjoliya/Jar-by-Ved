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

function updateLoadingStatus(status, sub = '') {
    const statusEl = document.getElementById('loading-status');
    const subEl = document.getElementById('loading-sub');
    if (statusEl) statusEl.textContent = status;
    if (subEl && sub) subEl.textContent = sub;
}

function showLoadingError(title, detail = '') {
    const statusEl = document.getElementById('loading-status');
    const subEl = document.getElementById('loading-sub');
    const spinnerEl = document.getElementById('loading-spinner');
    const retryBtn = document.getElementById('loading-retry');
    if (statusEl) statusEl.textContent = title;
    if (subEl) subEl.textContent = detail || 'Please check your connection and tap retry.';
    if (spinnerEl) spinnerEl.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'inline-flex';
}

async function init() {
    display = document.getElementById('display');
    screenCtx = display.getContext('2d');

    setListeners();

    // 1. Safe Non-blocking Audio Initialization
    try {
        updateLoadingStatus("Starting Audio Subsystem...", "Initializing audio engine");
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
        console.warn("MIDI Audio init notice (continuing safely):", e);
    }
    window.libmedia = new LibMedia();

    // 2. Initialize CheerpJ JVM with full error recovery
    updateLoadingStatus("Initializing CheerpJ JVM...", "Setting up WebAssembly runtime");
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
                    if (!scaleSet) {
                        const loadingEl = document.getElementById('loading');
                        if (loadingEl) loadingEl.style.display = 'none';
                        display.style.display = '';
                        scaleSet = true;
                        display.focus();
                    }
                    screenCtx.canvas.width = width;
                    screenCtx.canvas.height = height;
                    autoscale();
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

    // 3. Load FreeJ2ME Core Library
    updateLoadingStatus("Loading FreeJ2ME Engine...", "Fetching emulator core");
    let lib;
    try {
        lib = await cheerpjRunLibrary(cheerpjWebRoot + "/freej2me-web.jar");
    } catch (err) {
        console.error("CheerpJ run library error:", err);
        showLoadingError("Failed to load freej2me-web.jar.", err.message || String(err));
        return;
    }

    // 4. Resolve FreeJ2ME class
    updateLoadingStatus("Launching Game...", "Starting MIDlet bytecode");
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

    // Visual feedback if game bytecode compilation takes a few seconds
    const frameTimeout = setTimeout(() => {
        if (!scaleSet) {
            updateLoadingStatus("Starting Game...", "Compiling game bytecode...");
        }
    }, 6000);

    FreeJ2ME.main(args).catch(e => {
        clearTimeout(frameTimeout);
        if (e && e.printStackTrace) e.printStackTrace();
        console.error("FreeJ2ME runtime exception:", e);
        showLoadingError("Game stopped unexpectedly.", e.message || String(e));
    });
}

init();