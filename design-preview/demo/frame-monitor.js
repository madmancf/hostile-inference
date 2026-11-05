// Complete-session aggregates are bounded. The diagnostic trace can remain small.
// A draw belongs to the following callback interval, never the preceding gap.
export class FrameCadence {
  constructor(hz=60) { this.period=1000/hz; this.next=0; this.last=null; this.a=this.b=this.c=this.native=this.period; this.samples=0; }
  callback(now) {
    const gap=this.last===null?0:now-this.last;this.last=now;
    if(gap>0&&gap<this.period*3){
      if(!this.samples)this.a=this.b=this.c=gap;
      else{this.a=this.b;this.b=this.c;this.c=gap;}
      this.samples++;this.native=Math.max(Math.min(this.a,this.b),Math.min(Math.max(this.a,this.b),this.c));
    }
  }
  due(now,continuous,dirty) { return continuous ? this.native>=this.period*.85||now+Math.min(2,this.native*.25)>=this.next : dirty; }
  drawn(now) {
    if (this.native>=this.period*.85 || !this.next || now-this.next>this.period*4) this.next=now+this.period;
    else this.next+=Math.max(1,Math.floor((now-this.next)/this.period)+1)*this.period;
  }
}
export class FrameAttribution {
  constructor() { this.reset(); }
  reset() { this.last = null; }
  callback(rafAt, callbackAt) {
    if (this.last && this.last.nextRafAt === undefined) {
      this.last.nextRafAt = rafAt;
      this.last.nextCallbackAt = callbackAt;
      this.last.followingCallbackGapMs = rafAt - this.last.rafAt;
    }
  }
  draw(record) {
    if (this.last) {
      this.last.nextDrawRafAt = record.rafAt;
      this.last.followingDrawGapMs = record.rafAt - this.last.rafAt;
      record.previousFrameId = this.last.frameId;
    }
    this.last = record;
    return record;
  }
}
export class FrameMonitor {
  constructor() { this.reset(); }
  reset() {
    this.frames = this.activeMs = this.maxGap = this.maxDraw = this.longFrames = 0;
    this.histogram = new Uint32Array(2002);
    this.window = []; this.head = 0; this.segmentMs = 0; this.minimum = Infinity;
  }
  interrupt() { this.window = []; this.head = 0; this.segmentMs = 0; }
  record(gapMs, drawMs = 0) {
    if (!Number.isFinite(gapMs) || gapMs <= 0 || !Number.isFinite(drawMs)) return;
    this.frames++; this.activeMs += gapMs; this.segmentMs += gapMs;
    this.maxGap = Math.max(this.maxGap, gapMs); this.maxDraw = Math.max(this.maxDraw, drawMs);
    if (gapMs > 100) this.longFrames++;
    this.histogram[Math.min(2001, Math.floor(gapMs * 2))]++;
    // Count the complete window immediately before the new frame arrives.
    // In particular a >1-second stall has a zero-frame complete window.
    while (this.head < this.window.length && this.window[this.head] < this.segmentMs - 1000) this.head++;
    if (this.segmentMs >= 1000) this.minimum = Math.min(this.minimum, this.window.length - this.head);
    this.window.push(this.segmentMs);
    if (this.head > 256) { this.window = this.window.slice(this.head); this.head = 0; }
  }
  percentile(fraction) {
    if (!this.frames) return null;
    const target = Math.ceil(this.frames * fraction); let count = 0;
    for (let i = 0; i < this.histogram.length; i++) { count += this.histogram[i]; if (count >= target) return i === 2001 ? '>1000ms' : (i + 1) / 2; }
    return null;
  }
  summary() {
    return { frames: this.frames, activeSeconds: this.activeMs / 1000, meanFPS: this.activeMs ? this.frames * 1000 / this.activeMs : null, minimumCompleteSecond: Number.isFinite(this.minimum) ? this.minimum : null, p95FrameMsUpperBound: this.percentile(.95), p99FrameMsUpperBound: this.percentile(.99), maximumGapMs: this.maxGap, maximumDrawMs: this.maxDraw, gapsOver100ms: this.longFrames, histogramResolutionMs: .5, excludesIntentionalPause: true, filtersLongFrames: false };
  }
}
