// Keyboard and mouse input — key state, pointer-lock look, click edges.
// The game reads this once a frame; no other module touches DOM events.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.prevKeys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.locked = false;
    this.mutePressed = false;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'KeyM') this.mutePressed = true;
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    window.addEventListener('mousedown', (event) => {
      // Only clicks with the pointer locked reach the game, so clicking a
      // menu button never fires the pistol.
      if (event.button === 0 && this.locked) {
        this.mouseDown = true;
        this.clicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down.
  pressed(code) {
    return this.keys.has(code) && !this.prevKeys.has(code);
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  // Called once per frame after the game has read the input.
  endFrame() {
    this.prevKeys = new Set(this.keys);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
    this.mutePressed = false;
  }
}
