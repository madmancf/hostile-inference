// Small procedural sounds. A silent context is prepared during loading and
// resumed after the Sound gesture. No streaming assets,
// microphone access or per-frame oscillator loop. Simultaneous voices are bounded.
export class BattleAudio {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.context.createGain(); this.master.gain.value = .15; this.master.connect(this.context.destination);
    this.enabled = false; this.voices = 0; this.seen = new WeakSet(); this.lastShot = -Infinity; this.threat = false; this.finished = false;
    this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .4), this.context.sampleRate);
    let seed = 10291; const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
  }
  async enable(value) { this.enabled = value; if (value) await this.context.resume(); else await this.context.suspend(); }
  reset() { this.seen = new WeakSet(); this.threat = false; this.finished = false; }
  tone(frequency, end, length, volume, delay = 0, waveform = 'sine', pan = 0) {
    if (!this.enabled || this.context.state !== 'running' || this.voices >= 16) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain(), stereo = this.context.createStereoPanner(), at = this.context.currentTime + delay;
    osc.type = waveform; osc.frequency.setValueAtTime(frequency, at); osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + length);
    gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + length);
    stereo.pan.value = Math.max(-.8, Math.min(.8, pan)); osc.connect(gain); gain.connect(stereo); stereo.connect(this.master); this.voices++;
    osc.onended = () => { osc.disconnect(); gain.disconnect(); stereo.disconnect(); this.voices--; }; osc.start(at); osc.stop(at + length + .01);
  }
  burst(frequency, length, volume, pan) {
    if (!this.enabled || this.context.state !== 'running' || this.voices >= 16) return;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(), stereo = this.context.createStereoPanner(), at = this.context.currentTime;
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .8;
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + length); stereo.pan.value = Math.max(-.8, Math.min(.8, pan));
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(this.master); this.voices++;
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); this.voices--; }; source.start(at); source.stop(at + length);
  }
  update(game, camera) {
    if (!this.enabled) return;
    const now = this.context.currentTime;
    for (const e of game.effects) {
      if (e.server !== game.activeServer || this.seen.has(e)) continue;
      this.seen.add(e);
      if (e.tx === undefined || now - this.lastShot < .1) continue;
      this.lastShot = now; const pan = (e.x - camera.x) / 650;
      if (e.role === 'model') { this.tone(190, 62, .19, .5, 0, 'sine', pan); this.burst(480, .12, .28, pan); }
      else if (e.role === 'malware') { this.burst(1600, .14, .23, pan); this.tone(760, 330, .12, .12, 0, 'triangle', pan); }
      else if (e.role === 'firewall') this.tone(510, 1050, .1, .25, 0, 'sine', pan);
      else this.burst(2600, .055, .22, pan);
    }
    if (game.operation?.homeThreat && !this.threat) { this.tone(640, 640, .15, .3); this.tone(480, 480, .2, .3, .19); }
    this.threat = !!game.operation?.homeThreat;
    if (game.result && !this.finished) {
      this.finished = true;
      if (game.result === 'victory') for (const [i, note] of [440, 660, 880].entries()) this.tone(note, note, .65, .22, i * .12, 'triangle');
      else this.tone(280, 55, .9, .35, 0, 'triangle');
    }
  }
  dispose() { this.context.close().catch(() => {}); }
}
