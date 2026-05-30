/**
 * UI - Thin wrapper around the DOM HUD elements. Keeps DOM access centralized
 * so the rest of the game never touches document directly.
 */
export class UI {
  constructor() {
    this.batteryFill = document.getElementById('battery-fill');
    this.batteryPercent = document.getElementById('battery-percent');
    this.keysCounter = document.getElementById('keys-counter');
    this.objectiveText = document.getElementById('objective-text');
    this.interactPrompt = document.getElementById('interact-prompt');
    this.warningText = document.getElementById('warning-text');
    this.jumpscareOverlay = document.getElementById('jumpscare-overlay');
    this.hintArrow = document.getElementById('hint-arrow');
    this.hintLabel = document.getElementById('hint-label');
    this.hintIndicator = document.getElementById('hint-indicator');

    this._lastBattery = -1;
    this._warningHideTimer = null;
    this._lastHintLabel = '';
  }

  /**
   * Rotate the arrow to point at the next objective, relative to the player's
   * heading. `angleRad` is a clockwise angle in radians where 0 = straight ahead.
   * `label` is what to display under the arrow. Pass null to hide.
   */
  setHint(angleRad, label) {
    if (!label) {
      this.hintIndicator.style.display = 'none';
      return;
    }
    this.hintIndicator.style.display = '';
    // CSS rotation: 0deg means arrow points up (forward). Positive deg rotates clockwise.
    const deg = angleRad * 180 / Math.PI;
    this.hintArrow.style.transform = `rotate(${deg}deg)`;
    if (label !== this._lastHintLabel) {
      this.hintLabel.textContent = label;
      this._lastHintLabel = label;
    }
  }

  setBattery(value) {
    const v = Math.max(0, Math.min(1, value));
    const pct = Math.round(v * 100);
    if (pct === this._lastBattery) return;
    this._lastBattery = pct;
    this.batteryFill.style.width = `${pct}%`;
    this.batteryPercent.textContent = `${pct}%`;
    // Pulse red when critical
    if (v < 0.15) {
      this.batteryFill.style.animation = 'pulse 0.4s infinite';
    } else {
      this.batteryFill.style.animation = '';
    }
  }

  setKeys(collected, total) {
    this.keysCounter.textContent = `KEYS: ${collected} / ${total}`;
  }

  setObjective(text) {
    this.objectiveText.textContent = text;
  }

  setInteractPrompt(label) {
    if (!label) {
      this.interactPrompt.classList.add('hidden');
    } else {
      this.interactPrompt.textContent = label;
      this.interactPrompt.classList.remove('hidden');
    }
  }

  showWarning(text) {
    this.warningText.textContent = text;
    this.warningText.classList.remove('hidden');
    if (this._warningHideTimer) clearTimeout(this._warningHideTimer);
    this._warningHideTimer = setTimeout(() => this.hideWarning(), 1800);
  }

  hideWarning() {
    this.warningText.classList.add('hidden');
    if (this._warningHideTimer) {
      clearTimeout(this._warningHideTimer);
      this._warningHideTimer = null;
    }
  }

  showJumpscare() {
    this.jumpscareOverlay.classList.remove('hidden');
    // Re-trigger animation by forcing reflow
    void this.jumpscareOverlay.offsetWidth;
    this.jumpscareOverlay.style.animation = 'none';
    void this.jumpscareOverlay.offsetWidth;
    this.jumpscareOverlay.style.animation = '';
    setTimeout(() => this.jumpscareOverlay.classList.add('hidden'), 700);
  }
}
