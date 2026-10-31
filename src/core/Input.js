/**
 * Keyboard / mouse / pointer-lock input with edge detection.
 * Game consumes `pressed` once per frame via endFrame().
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;
    this.enabled = true;
    this.sensitivity = 1;
    this._lockHandler();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Prevent page scroll / devtools shortcuts swallowing gameplay keys.
      if (['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
      if (!this.enabled) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _lockHandler() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.mouse.dx = this.mouse.dy = 0; }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    // Pointer lock can be refused (unfocused window, embedded frame, automated
    // browser). Never let that abort mission start.
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignored */ } });
    } catch { /* ignored */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  up(code) { return this.released.has(code); }

  /** Snapshot used by the player controller. */
  cmd() {
    const forward = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    const strafe = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    return {
      moveX: strafe,
      moveY: forward,
      sprint: this.down('ShiftLeft') || this.down('ShiftRight'),
      sprintPressed: this.hit('ShiftLeft') || this.hit('ShiftRight'),
      crouch: this.down('KeyC') || this.down('ControlLeft'),
      crouchPressed: this.hit('KeyC') || this.hit('ControlLeft'),
      crouchHeld: this.down('KeyC') || this.down('ControlLeft'),
      jumpPressed: this.hit('Space'),
      jumpHeld: this.down('Space'),
      walk: this.down('AltLeft'),
      aim: this.mouse.right,
      fire: this.mouse.left,
      firePressed: this.mouse.leftPressed,
      reload: this.hit('KeyR'),
      leanLeft: this.down('KeyQ'),
      leanRight: this.down('KeyE'),
      melee: this.hit('KeyV'),
      grenade: this.hit('KeyG'),
      interact: this.hit('KeyF'),
      swap: this.hit('Digit1') ? 0 : null,
    };
  }

  takeMouseDelta() {
    const d = { x: this.mouse.dx, y: this.mouse.dy };
    this.mouse.dx = this.mouse.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }
}
