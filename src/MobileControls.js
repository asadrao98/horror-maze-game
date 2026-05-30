import * as THREE from 'three';

/**
 * MobileControls - Virtual joystick (left), drag-to-look pad (right), and
 * tap buttons for flashlight + interact. Drives Player.touchAxes and rotates
 * the camera directly (PointerLockControls won't work on touch devices).
 *
 * Camera yaw/pitch use the same YXZ Euler decomposition as PointerLockControls
 * so this stays consistent with the desktop control path.
 */
export class MobileControls {
  static isTouchDevice() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    return 'ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0;
  }

  constructor({ camera, root, onFlashlight, onInteract, onPause }) {
    this.camera = camera;
    this.root = root;
    this.onFlashlight = onFlashlight;
    this.onInteract = onInteract;
    this.onPause = onPause;
    this.enabled = false;

    this.axes = { x: 0, z: 0 };
    this.lookSensitivity = 0.0065;

    // YXZ Euler tracks camera yaw/pitch; pitch is clamped.
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._PI_2 = Math.PI / 2;
    this._maxPitch = this._PI_2 - 0.05;

    // Per-active-touch tracking.
    // joystickTouchId: which touch identifier is driving the joystick
    // lookTouchId: which touch is currently dragging the look pad
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this._lookLast = { x: 0, y: 0 };

    this._joystickRect = null;
    this._joystickRadius = 60; // px

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.container = document.createElement('div');
    this.container.id = 'mobile-controls';
    this.container.classList.add('hidden');
    this.container.innerHTML = `
      <div id="mc-joystick">
        <div id="mc-joystick-knob"></div>
      </div>
      <div id="mc-look-pad"></div>
      <div id="mc-button-stack">
        <button id="mc-btn-flashlight" type="button" aria-label="Flashlight">F</button>
        <button id="mc-btn-interact" type="button" aria-label="Interact">E</button>
      </div>
      <button id="mc-btn-pause" type="button" aria-label="Pause">&#10073;&#10073;</button>
    `;
    this.root.appendChild(this.container);

    this.joystickEl = this.container.querySelector('#mc-joystick');
    this.knobEl = this.container.querySelector('#mc-joystick-knob');
    this.lookPadEl = this.container.querySelector('#mc-look-pad');
    this.flashBtn = this.container.querySelector('#mc-btn-flashlight');
    this.interactBtn = this.container.querySelector('#mc-btn-interact');
    this.pauseBtn = this.container.querySelector('#mc-btn-pause');
  }

  enable() {
    this.enabled = true;
    this.container.classList.remove('hidden');
  }

  disable() {
    this.enabled = false;
    this.container.classList.add('hidden');
    this._resetJoystick();
    this.lookTouchId = null;
  }

  _bindEvents() {
    // Buttons — use touchstart for snappy feedback and stop propagation so the
    // look-pad below doesn't also pick the touch up.
    const tap = (el, cb) => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.enabled) cb();
      };
      el.addEventListener('touchstart', handler, { passive: false });
      el.addEventListener('click', handler);
    };
    tap(this.flashBtn, () => this.onFlashlight?.());
    tap(this.interactBtn, () => this.onInteract?.());
    tap(this.pauseBtn, () => this.onPause?.());

    // Joystick — track first touch that lands on the joystick area.
    this.joystickEl.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (this.joystickTouchId !== null) return;
      const t = e.changedTouches[0];
      this.joystickTouchId = t.identifier;
      this._joystickRect = this.joystickEl.getBoundingClientRect();
      this._updateJoystick(t.clientX, t.clientY);
    }, { passive: false });

    // Look pad — any touch that starts on the pad drags the camera.
    this.lookPadEl.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (this.lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this.lookTouchId = t.identifier;
      this._lookLast.x = t.clientX;
      this._lookLast.y = t.clientY;
    }, { passive: false });

    // Global move/end — route by identifier so multitouch (joystick + look
    // simultaneously) works correctly.
    const onMove = (e) => {
      if (!this.enabled) return;
      let handled = false;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          this._updateJoystick(t.clientX, t.clientY);
          handled = true;
        } else if (t.identifier === this.lookTouchId) {
          const dx = t.clientX - this._lookLast.x;
          const dy = t.clientY - this._lookLast.y;
          this._lookLast.x = t.clientX;
          this._lookLast.y = t.clientY;
          this._applyLook(dx, dy);
          handled = true;
        }
      }
      if (handled) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) this._resetJoystick();
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }

  _updateJoystick(clientX, clientY) {
    if (!this._joystickRect) return;
    const cx = this._joystickRect.left + this._joystickRect.width / 2;
    const cy = this._joystickRect.top + this._joystickRect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const r = this._joystickRadius;
    if (dist > r) { dx = (dx / dist) * r; dy = (dy / dist) * r; }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    // Normalize to [-1, 1]. Screen-up (dy negative) is forward.
    this.axes.x = dx / r;
    this.axes.z = -dy / r;
  }

  _resetJoystick() {
    this.joystickTouchId = null;
    this._joystickRect = null;
    this.axes.x = 0;
    this.axes.z = 0;
    this.knobEl.style.transform = 'translate(0px, 0px)';
  }

  _applyLook(dx, dy) {
    this._euler.setFromQuaternion(this.camera.quaternion);
    this._euler.y -= dx * this.lookSensitivity;
    this._euler.x -= dy * this.lookSensitivity;
    this._euler.x = Math.max(-this._maxPitch, Math.min(this._maxPitch, this._euler.x));
    this.camera.quaternion.setFromEuler(this._euler);
  }
}
