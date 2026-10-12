/**
 * J2meJS Keypad and Input Controller
 * Maps physical keyboard & virtual touch gamepad to J2ME MIDP key events.
 */

(function () {
  'use strict';

  // Standard Nokia / MIDP 2.0 Keycodes
  const KEY_MAP = {
    // D-Pad / Arrows
    'ArrowUp': -1,
    'KeyW': -1,
    'w': -1,
    'W': -1,
    'up': -1,

    'ArrowDown': -2,
    'KeyS': -2,
    's': -2,
    'S': -2,
    'down': -2,

    'ArrowLeft': -3,
    'KeyA': -3,
    'a': -3,
    'A': -3,
    'left': -3,

    'ArrowRight': -4,
    'KeyD': -4,
    'd': -4,
    'D': -4,
    'right': -4,

    // Center / Fire / Enter
    'Enter': -5,
    'Space': -5,
    ' ': -5,
    'ok': -5,
    'OK': -5,

    // Softkeys
    'F1': -6,
    'KeyQ': -6,
    'q': -6,
    'Q': -6,
    'SoftLeft': -6,
    'l': -6,
    'L': -6,

    'F2': -7,
    'KeyE': -7,
    'e': -7,
    'E': -7,
    'SoftRight': -7,
    'r': -7,
    'R': -7,

    // Numeric Keys
    '0': 48, 'Digit0': 48, 'Numpad0': 48,
    '1': 49, 'Digit1': 49, 'Numpad1': 49,
    '2': 50, 'Digit2': 50, 'Numpad2': 50,
    '3': 51, 'Digit3': 51, 'Numpad3': 51,
    '4': 52, 'Digit4': 52, 'Numpad4': 52,
    '5': 53, 'Digit5': 53, 'Numpad5': 53,
    '6': 54, 'Digit6': 54, 'Numpad6': 54,
    '7': 55, 'Digit7': 55, 'Numpad7': 55,
    '8': 56, 'Digit8': 56, 'Numpad8': 56,
    '9': 57, 'Digit9': 57, 'Numpad9': 57,

    // Special Keys (* and #)
    '*': 42, 'NumpadAsterisk': 42, 'NumpadMultiply': 42,
    '#': 35, 'NumpadDivide': 35
  };

  const activeKeys = new Set();

  function sendPress(code) {
    if (typeof MIDP !== 'undefined' && MIDP.sendKeyPress) {
      MIDP.sendKeyPress(code);
    }
  }

  function sendRelease(code) {
    if (typeof MIDP !== 'undefined' && MIDP.sendKeyRelease) {
      MIDP.sendKeyRelease(code);
    }
  }

  function resolveCode(val) {
    if (typeof val === 'number') return val;
    if (KEY_MAP[val] !== undefined) return KEY_MAP[val];
    const trimmed = String(val).trim();
    if (KEY_MAP[trimmed] !== undefined) return KEY_MAP[trimmed];
    return null;
  }

  // Handle Physical Keyboard
  function handleKeyDown(e) {
    if (e.repeat) return;
    
    // Allow browser devtools or reload
    if (e.key === 'F12' || (e.ctrlKey && e.key === 'r')) return;

    const code = resolveCode(e.code) || resolveCode(e.key);
    if (code !== null) {
      e.preventDefault();
      activeKeys.add(code);
      sendPress(code);
    }
  }

  function handleKeyUp(e) {
    const code = resolveCode(e.code) || resolveCode(e.key);
    if (code !== null) {
      e.preventDefault();
      activeKeys.delete(code);
      sendRelease(code);
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Bind Virtual Touch & Pointer Keypad Buttons
  function initVirtualKeypad() {
    const buttons = document.querySelectorAll('.key, #gamepad button');
    
    buttons.forEach((btn) => {
      const dataKey = btn.getAttribute('data-key');
      const text = btn.childNodes[0] ? btn.childNodes[0].textContent.trim() : btn.textContent.trim();
      const codeKey = dataKey || text;

      // Special actions
      if (codeKey === 'Escape') {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.parent && window.parent.document.getElementById('modalCloseBtn')) {
            window.parent.document.getElementById('modalCloseBtn').click();
          } else {
            window.location.href = '/';
          }
        });
        return;
      }

      if (codeKey === 'Maximize') {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
        });
        return;
      }

      const code = resolveCode(codeKey);
      if (code === null) return;

      const onPress = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        activeKeys.add(code);
        sendPress(code);
      };

      const onRelease = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (activeKeys.has(code)) {
          activeKeys.delete(code);
          sendRelease(code);
        }
      };

      btn.addEventListener('pointerdown', onPress);
      btn.addEventListener('pointerup', onRelease);
      btn.addEventListener('pointercancel', onRelease);
      btn.addEventListener('pointerleave', onRelease);
      
      // Fallback for older touch devices
      btn.addEventListener('touchstart', onPress, { passive: false });
      btn.addEventListener('touchend', onRelease, { passive: false });
      btn.addEventListener('touchcancel', onRelease, { passive: false });
    });
  }

  // Auto Orientation and Virtual Keypad Visibility
  const kbdWidth = 220;
  const kbdHeight = 220;

  function updateLayout() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);
    const leftKeys = document.getElementById('left-keys');
    const rightKeys = document.getElementById('right-keys');
    const displayEl = document.getElementById('display');

    if (!leftKeys || !rightKeys) return;

    if (isTouch) {
      leftKeys.style.display = 'flex';
      rightKeys.style.display = 'flex';

      const w = window.innerWidth;
      const h = window.innerHeight;

      if (w > h) {
        document.body.classList.add('kbd-landscape');
        document.body.classList.remove('kbd-portrait');
      } else {
        document.body.classList.add('kbd-portrait');
        document.body.classList.remove('kbd-landscape');
      }
    } else {
      leftKeys.style.display = 'none';
      rightKeys.style.display = 'none';
      document.body.classList.remove('kbd-portrait', 'kbd-landscape');
    }

    if (typeof MIDP !== 'undefined' && MIDP.updatePhysicalScreenSize && MIDP.updateCanvas) {
      MIDP.updatePhysicalScreenSize();
      MIDP.updateCanvas();
    }
  }

  // Unlock Audio on First User Interaction
  function unlockAudio() {
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (window._globalAudioCtx && window._globalAudioCtx.state === 'suspended') {
        window._globalAudioCtx.resume();
      }
    }
  }

  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  window.addEventListener('resize', updateLayout);
  window.addEventListener('orientationchange', () => setTimeout(updateLayout, 100));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initVirtualKeypad();
      updateLayout();
    });
  } else {
    initVirtualKeypad();
    updateLayout();
  }
})();
