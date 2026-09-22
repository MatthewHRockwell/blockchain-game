// Procedural sound effects, synthesised in the browser with Web Audio.
//
// There are no audio files: every cue is generated from oscillators and shaped
// noise at play time. That matches the procedural art direction, keeps the
// repository free of binary assets, and adds nothing to the bundle beyond this
// module. The trade-off is that the palette is deliberately simple.
//
// Everything here is best-effort. A browser with no AudioContext, a suspended
// context, or a headless environment with no output device must not break the
// game, so every entry point swallows its own failures.

import { SOUND_IDS } from '../../commons/adventure/sounds.mjs'

export type SoundCue = { id: string, step?: number }

const MUTE_STORAGE_KEY = 'lostTemple.muted'
const MASTER_GAIN = 0.32

/** Pentatonic steps, so the rising glyph tones stay consonant. */
const GLYPH_SEMITONES = [0, 3, 5, 7, 10, 12]

function readStoredMute(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    // Private windows and blocked site data both throw here.
    return false
  }
}

function writeStoredMute(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Preference simply does not persist; not worth surfacing.
  }
}

export class SoundEngine {
  private context?: AudioContext
  private master?: GainNode
  private noiseBuffer?: AudioBuffer
  private muted: boolean
  private unavailable = false

  constructor() {
    this.muted = readStoredMute()
  }

  isMuted() {
    return this.muted
  }

  setMuted(muted: boolean) {
    this.muted = muted
    writeStoredMute(muted)
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, this.context.currentTime, 0.02)
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted)
    return this.muted
  }

  /**
   * Browsers keep an AudioContext suspended until a user gesture, so this is
   * called from the first click or keypress rather than at construction.
   */
  resume() {
    const context = this.ensureContext()
    if (!context) return
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
  }

  play(cue: SoundCue | null | undefined) {
    if (!cue || this.muted) return
    const context = this.ensureContext()
    if (!context || context.state !== 'running') return

    try {
      this.render(cue, context.currentTime)
    } catch {
      // A single failed cue should never interrupt play.
    }
  }

  private ensureContext(): AudioContext | undefined {
    if (this.context || this.unavailable) return this.context

    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) {
        this.unavailable = true
        return undefined
      }

      const context = new Ctor()
      const master = context.createGain()
      master.gain.value = this.muted ? 0 : MASTER_GAIN
      master.connect(context.destination)

      this.context = context
      this.master = master
      return context
    } catch {
      this.unavailable = true
      return undefined
    }
  }

  private ensureNoise(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const length = Math.floor(context.sampleRate * 0.6)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1
    this.noiseBuffer = buffer
    return buffer
  }

  /** One enveloped oscillator, optionally sweeping to a second frequency. */
  private tone(options: {
    at: number
    freq: number
    duration: number
    type?: OscillatorType
    gain?: number
    sweepTo?: number
    attack?: number
  }) {
    const context = this.context
    const master = this.master
    if (!context || !master) return

    const { at, freq, duration, type = 'sine', gain = 0.6, sweepTo, attack = 0.008 } = options

    const osc = context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), at + duration)

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(gain, at + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    osc.connect(envelope)
    envelope.connect(master)
    osc.start(at)
    osc.stop(at + duration + 0.02)
  }

  /** Filtered noise, for anything percussive, woody, or airy. */
  private noise(options: {
    at: number
    duration: number
    freq: number
    type?: BiquadFilterType
    gain?: number
    sweepTo?: number
    q?: number
  }) {
    const context = this.context
    const master = this.master
    if (!context || !master) return

    const { at, duration, freq, type = 'bandpass', gain = 0.6, sweepTo, q = 1 } = options

    const source = context.createBufferSource()
    source.buffer = this.ensureNoise(context)

    const filter = context.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(freq, at)
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 20), at + duration)

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(master)
    source.start(at)
    source.stop(at + duration + 0.02)
  }

  private arpeggio(at: number, freqs: number[], spacing: number, type: OscillatorType = 'triangle') {
    freqs.forEach((freq, index) => {
      this.tone({ at: at + index * spacing, freq, duration: spacing * 2.6, type, gain: 0.5 })
    })
  }

  private render(cue: SoundCue, now: number) {
    switch (cue.id) {
      case SOUND_IDS.FOOTSTEP:
        // Soft, low, and quiet: it plays constantly while walking.
        this.noise({ at: now, duration: 0.07, freq: 320, sweepTo: 150, gain: 0.12, q: 0.7 })
        break

      case SOUND_IDS.TAKE:
        this.tone({ at: now, freq: 520, sweepTo: 880, duration: 0.12, type: 'triangle', gain: 0.4 })
        break

      case SOUND_IDS.CUT:
        // A swish plus a duller thud, so it reads as a blade and not just noise.
        this.noise({ at: now, duration: 0.18, freq: 2600, sweepTo: 600, gain: 0.45, q: 0.8 })
        this.noise({ at: now + 0.05, duration: 0.12, freq: 260, sweepTo: 120, gain: 0.3 })
        break

      case SOUND_IDS.REPAIR:
        // Two woody knocks: rope pulled taut over planks.
        this.noise({ at: now, duration: 0.1, freq: 420, sweepTo: 200, gain: 0.4, q: 2 })
        this.noise({ at: now + 0.13, duration: 0.14, freq: 300, sweepTo: 140, gain: 0.45, q: 2 })
        this.tone({ at: now + 0.13, freq: 180, duration: 0.2, type: 'triangle', gain: 0.25 })
        break

      case SOUND_IDS.CLUE:
        // Soft bell with a harmonic, for reading the journal.
        this.tone({ at: now, freq: 740, duration: 0.5, type: 'sine', gain: 0.32 })
        this.tone({ at: now + 0.02, freq: 1480, duration: 0.34, type: 'sine', gain: 0.12 })
        break

      case SOUND_IDS.GLYPH: {
        // Pitch rises with the player's progress through the sequence.
        const index = Math.max(1, cue.step ?? 1) - 1
        const semitones = GLYPH_SEMITONES[Math.min(index, GLYPH_SEMITONES.length - 1)]
        const freq = 392 * Math.pow(2, semitones / 12)
        this.tone({ at: now, freq, duration: 0.42, type: 'sine', gain: 0.38 })
        this.tone({ at: now + 0.01, freq: freq * 2, duration: 0.24, type: 'sine', gain: 0.12 })
        break
      }

      case SOUND_IDS.GLYPH_WRONG:
        this.tone({ at: now, freq: 300, sweepTo: 110, duration: 0.34, type: 'sawtooth', gain: 0.26 })
        break

      case SOUND_IDS.DOOR:
        // Low grinding rumble with a stone-scrape layer on top.
        this.tone({ at: now, freq: 70, sweepTo: 42, duration: 1.1, type: 'sine', gain: 0.42 })
        this.noise({ at: now, duration: 1.0, freq: 220, sweepTo: 90, gain: 0.3, q: 0.6 })
        this.noise({ at: now + 0.25, duration: 0.5, freq: 900, sweepTo: 300, gain: 0.12, q: 0.9 })
        break

      case SOUND_IDS.ARTIFACT:
        // The finale: rising arpeggio plus a shimmer tail.
        this.arpeggio(now, [523, 659, 784, 1047], 0.09)
        this.tone({ at: now + 0.36, freq: 1568, duration: 0.9, type: 'sine', gain: 0.18 })
        this.noise({ at: now + 0.36, duration: 0.8, freq: 3200, sweepTo: 1400, gain: 0.1, q: 0.7 })
        break

      case SOUND_IDS.CLAIMED:
        this.arpeggio(now, [523, 784, 1047, 1319], 0.11)
        this.tone({ at: now + 0.44, freq: 2093, duration: 1.1, type: 'sine', gain: 0.14 })
        break

      case SOUND_IDS.ROOM_CHANGE:
        this.noise({ at: now, duration: 0.5, freq: 340, sweepTo: 1200, gain: 0.16, q: 0.5 })
        break

      case SOUND_IDS.REFUSED:
        this.tone({ at: now, freq: 220, sweepTo: 170, duration: 0.14, type: 'square', gain: 0.16 })
        break

      default:
        break
    }
  }
}
