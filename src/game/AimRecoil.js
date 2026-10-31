/**
 * True aim recoil: per-shot kicks ease into the view over ~60 ms, stay put while a
 * string continues, and only the *uncompensated* part settles back afterwards.
 * Based on the reference project's Recoil.js, retuned for the Type 38's bolt cadence.
 *
 * Pure numbers, +pitch looks up and +yaw turns left, matching Player.pitch / Player.yaw.
 */
const KICK_RATE = 38; // 1/s: ~95 % of a kick lands within 80 ms
const RETURN_RATE = 10; // 1/s: settle-back speed

export class AimRecoil {
  constructor() { this.reset(); }

  reset() {
    this.pendP = 0; this.pendY = 0; // kick not yet applied to the view
    this.accP = 0; this.accY = 0; // uncompensated climb of the current string
    this.retP = 0; this.retY = 0; // settle-back still to apply
    this.n = 0; // shots in the current string
  }

  /** Register a shot (radians, +pitch = up, +yaw = left). */
  add(pitch, yaw) {
    this.pendP += pitch; this.pendY += yaw;
    this.accP += pitch; this.accY += yaw;
    this.n++;
  }

  /** Mouse movement this frame: pulling against the recoil uses up the recoverable part. */
  look(dP, dY) {
    if (dP < 0) {
      if (this.accP > 0) this.accP = Math.max(0, this.accP + dP);
      if (this.retP > 0) this.retP = Math.max(0, this.retP + dP);
    }
    if (dY * this.accY < 0) this.accY = Math.sign(this.accY) * Math.max(0, Math.abs(this.accY) - Math.abs(dY));
    if (dY * this.retY < 0) this.retY = Math.sign(this.retY) * Math.max(0, Math.abs(this.retY) - Math.abs(dY));
  }

  /**
   * Fraction of a string's climb that settles back by itself.
   * A single deliberate shot returns to the natural point of aim; longer strings keep more.
   */
  static settleFrac(n, single = 1, str = 0.35) {
    if (n <= 1) return single;
    const t = Math.min(1, Math.max(0, (n - 1) / 9));
    return str + (single - str) * t;
  }

  /**
   * Per frame: returns the aim change { dp, dy } (radians) to add to the view.
   * ctx = { time, lastShot, recoveryMul, singleReturn, stringReturn }
   */
  update(dt, ctx = {}) {
    const mul = ctx.recoveryMul ?? 1;
    let dp = 0, dy = 0;
    if (this.pendP || this.pendY) {
      const a = 1 - Math.exp(-KICK_RATE * dt);
      const kp = this.pendP * a, ky = this.pendY * a;
      dp += kp; dy += ky;
      this.pendP -= kp; this.pendY -= ky;
      if (Math.abs(this.pendP) < 1e-6 && Math.abs(this.pendY) < 1e-6) {
        dp += this.pendP; dy += this.pendY;
        this.pendP = this.pendY = 0;
      }
    }
    // The string is over once the trigger has been off a little longer than a cycle.
    if (this.n > 0 && (ctx.time ?? 0) - (ctx.lastShot ?? 0) > 0.3) {
      const f = Math.min(1, AimRecoil.settleFrac(this.n, ctx.singleReturn ?? 1, ctx.stringReturn ?? 0.35)
        * Math.sqrt(mul));
      this.retP += this.accP * f;
      this.retY += this.accY * f;
      this.accP = this.accY = 0;
      this.n = 0;
    }
    if (this.retP || this.retY) {
      const b = 1 - Math.exp(-RETURN_RATE * mul * dt);
      const rp = this.retP * b, ry = this.retY * b;
      dp -= rp; dy -= ry;
      this.retP -= rp; this.retY -= ry;
      if (Math.abs(this.retP) < 1e-5 && Math.abs(this.retY) < 1e-5) this.retP = this.retY = 0;
    }
    return { dp, dy };
  }
}
