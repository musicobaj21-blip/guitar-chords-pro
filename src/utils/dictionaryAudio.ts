export type GuitarInstrumentId =
  | "clean_electric"
  | "jazz_archtop"
  | "acoustic_steel"
  | "nylon_spanish"
  | "chorus_electric";

export interface GuitarInstrumentOption {
  id: GuitarInstrumentId;
  labelEs: string;
  labelEn: string;
  badge: string;
}

/**
 * 5 Timbres Profesionales de Guitarra (Nombres libres de marcas comerciales)
 */
export const GUITAR_INSTRUMENTS: GuitarInstrumentOption[] = [
  {
    id: "clean_electric",
    labelEs: "Clean Electric HD",
    labelEn: "Clean Electric HD",
    badge: "Single-Coil Clean",
  },
  {
    id: "jazz_archtop",
    labelEs: "Jazz Archtop Warm",
    labelEn: "Jazz Archtop Warm",
    badge: "Hollowbody Jazz",
  },
  {
    id: "acoustic_steel",
    labelEs: "Acoustic Steel HD",
    labelEn: "Acoustic Steel HD",
    badge: "Bronze Dreadnought",
  },
  {
    id: "nylon_spanish",
    labelEs: "Concert Nylon",
    labelEn: "Concert Nylon",
    badge: "Classical / Bossa",
  },
  {
    id: "chorus_electric",
    labelEs: "Warm Studio Electric",
    labelEn: "Warm Studio Electric",
    badge: " Boutique Clean",
  },
];

const MUSYNG_CDN = "https://gleitz.github.io/midi-js-soundfonts/MusyngKite";
const FLUID_CDN = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";

type GuitarSampleBankKey =
  | "clean_electric"
  | "jazz_archtop"
  | "acoustic_steel"
  | "nylon_spanish";

function buildGuitarZoneMap(
  baseUrl: string,
  folderName: string
): Record<number, string> {
  return {
    40: `${baseUrl}/${folderName}-mp3/E2.mp3`,
    43: `${baseUrl}/${folderName}-mp3/G2.mp3`,
    45: `${baseUrl}/${folderName}-mp3/A2.mp3`,
    48: `${baseUrl}/${folderName}-mp3/C3.mp3`,
    50: `${baseUrl}/${folderName}-mp3/D3.mp3`,
    52: `${baseUrl}/${folderName}-mp3/E3.mp3`,
    55: `${baseUrl}/${folderName}-mp3/G3.mp3`,
    57: `${baseUrl}/${folderName}-mp3/A3.mp3`,
    60: `${baseUrl}/${folderName}-mp3/C4.mp3`,
    62: `${baseUrl}/${folderName}-mp3/D4.mp3`,
    64: `${baseUrl}/${folderName}-mp3/E4.mp3`,
    67: `${baseUrl}/${folderName}-mp3/G4.mp3`,
    69: `${baseUrl}/${folderName}-mp3/A4.mp3`,
    72: `${baseUrl}/${folderName}-mp3/C5.mp3`,
    76: `${baseUrl}/${folderName}-mp3/E5.mp3`,
    79: `${baseUrl}/${folderName}-mp3/G5.mp3`,
  };
}

/**
 * - Acústicas (Steel y Nylon): Mantienen intacto el banco MusyngKite que suena perfecto.
 * - Eléctricas (Clean y Jazz): Usan FluidR3_GM + Rectificación de Envolvente Exponencial para un fade-out 100% parejo y sin fluctuaciones.
 */
const GUITAR_SAMPLE_BANKS_URLS: Record<
  GuitarSampleBankKey,
  Record<number, string>
> = {
  clean_electric: buildGuitarZoneMap(FLUID_CDN, "electric_guitar_clean"),
  jazz_archtop: buildGuitarZoneMap(FLUID_CDN, "electric_guitar_jazz"),
  acoustic_steel: buildGuitarZoneMap(MUSYNG_CDN, "acoustic_guitar_steel"),
  nylon_spanish: buildGuitarZoneMap(MUSYNG_CDN, "acoustic_guitar_nylon"),
};

class DictionaryGuitarAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private currentInstrument: GuitarInstrumentId = "clean_electric";

  private sampleBanks: Record<GuitarSampleBankKey, Map<number, AudioBuffer>> = {
    clean_electric: new Map(),
    jazz_archtop: new Map(),
    acoustic_steel: new Map(),
    nylon_spanish: new Map(),
  };

  private loadingPromises: Partial<Record<GuitarSampleBankKey, Promise<void>>> =
    {};

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: "interactive" });
      this.setupStudioMasterBus();
      this.preloadGuitarSamples();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setInstrument(instrument: GuitarInstrumentId): void {
    this.currentInstrument = instrument;
    if (instrument !== "chorus_electric") {
      this.loadSampleBank(instrument);
    } else {
      this.loadSampleBank("clean_electric");
      this.loadSampleBank("acoustic_steel");
    }
  }

  public getInstrument(): GuitarInstrumentId {
    return this.currentInstrument;
  }

  private setupStudioMasterBus(): void {
    if (!this.ctx) return;

    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.reverbConvolver = this.createStereoRoomImpulse(1.5, 3.6);
    this.reverbWetGain = this.ctx.createGain();
    this.reverbWetGain.gain.setValueAtTime(0.14, this.ctx.currentTime);

    // Limitador de techo transparente (-2 dB) para que NUNCA bombee ni altere el fade-out natural
    this.limiter = this.createTransparentLimiter();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.92, this.ctx.currentTime);

    this.dryBus.connect(this.limiter);
    this.dryBus.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.limiter);

    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  private createTransparentLimiter(): DynamicsCompressorNode {
    const comp = this.ctx!.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-2.0, this.ctx!.currentTime);
    comp.knee.setValueAtTime(2, this.ctx!.currentTime);
    comp.ratio.setValueAtTime(20, this.ctx!.currentTime);
    comp.attack.setValueAtTime(0.001, this.ctx!.currentTime);
    comp.release.setValueAtTime(0.08, this.ctx!.currentTime);
    return comp;
  }

  private createStereoRoomImpulse(
    durationSec: number,
    decay: number
  ): ConvolverNode {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        if (t < 0.012) {
          data[i] = 0;
        } else {
          const env = Math.pow(1 - i / length, decay);
          data[i] = (Math.random() * 2 - 1) * env * 0.24;
        }
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  /**
   * Rectificador de Decaimiento para Guitarra Eléctrica + Normalización RMS:
   * En las guitarras eléctricas (`isElectric = true`), elimina cualquier oscilación o loop artificial
   * en la cola del archivo MP3 (ese efecto de que el sonido "se va y viene"), aplicando una curva de
   * amortiguación física continua desde el ataque hasta el silencio.
   */
  private processAndNormalizeBuffer(
    buffer: AudioBuffer,
    isElectric: boolean,
    targetRms: number = 0.19,
    maxAllowedPeak: number = 0.78
  ): AudioBuffer {
    const rate = buffer.sampleRate;
    const ch0 = buffer.getChannelData(0);

    let startIdx = 0;
    for (let i = 0; i < ch0.length; i++) {
      if (Math.abs(ch0[i]) > 0.008) {
        startIdx = i;
        break;
      }
    }

    // Si es guitarra eléctrica, estabilizar la envolvente interna del sample para que baje en fade-out perfecto sin "olas"
    if (isElectric) {
      const blockSize = Math.floor(rate * 0.025); // Ventanas suaves de 25ms
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);

        // 1. Medir el pico de ataque inicial (primeros 120ms)
        let attackPeak = 0.001;
        const attackEnd = Math.min(data.length, startIdx + Math.floor(rate * 0.12));
        for (let i = startIdx; i < attackEnd; i++) {
          const abs = Math.abs(data[i]);
          if (abs > attackPeak) attackPeak = abs;
        }

        // 2. A partir de los 100ms tras el ataque, impedir que ningún bloque suba de volumen (monotonía decreciente)
        // y aplicar una caída exponencial natural de cuerda eléctrica
        let prevMaxEnv = attackPeak;
        for (let b = startIdx + Math.floor(rate * 0.08); b < data.length; b += blockSize) {
          const end = Math.min(data.length, b + blockSize);
          let blockPeak = 0.0001;
          for (let i = b; i < end; i++) {
            const abs = Math.abs(data[i]);
            if (abs > blockPeak) blockPeak = abs;
          }

          const timeSinceAttack = (b - startIdx) / rate;
          // Curva ideal de decaimiento continuo (fade-out natural)
          const idealEnvelope = attackPeak * Math.exp(-timeSinceAttack * 1.45);
          const allowedPeak = Math.min(prevMaxEnv, idealEnvelope);

          if (blockPeak > allowedPeak && blockPeak > 0.0001) {
            const corr = allowedPeak / blockPeak;
            for (let i = b; i < end; i++) {
              data[i] *= corr;
            }
            prevMaxEnv = allowedPeak;
          } else {
            prevMaxEnv = Math.min(prevMaxEnv, idealEnvelope);
          }
        }
      }
    }

    // 3. Normalización de sonoridad RMS en los primeros 500ms
    const windowLength = Math.min(
      ch0.length - startIdx,
      Math.floor(rate * 0.5)
    );

    if (windowLength <= 100) return buffer;

    let sumSquares = 0;
    let totalSamples = 0;
    let currentPeak = 0;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > currentPeak) currentPeak = abs;
        if (i >= startIdx && i < startIdx + windowLength) {
          sumSquares += data[i] * data[i];
          totalSamples++;
        }
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, totalSamples));
    if (rms < 0.0005 || currentPeak < 0.0005) return buffer;

    let gainFactor = Math.min(5.5, Math.max(0.25, targetRms / rms));

    if (currentPeak * gainFactor > maxAllowedPeak) {
      gainFactor = maxAllowedPeak / currentPeak;
    }

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] = data[i] * gainFactor;
      }
    }

    return buffer;
  }

  public async preloadGuitarSamples(): Promise<void> {
    await this.loadSampleBank("clean_electric");
    this.loadSampleBank("jazz_archtop");
    this.loadSampleBank("acoustic_steel");
    this.loadSampleBank("nylon_spanish");
  }

  private async loadSampleBank(bankKey: GuitarSampleBankKey): Promise<void> {
    if (this.sampleBanks[bankKey].size > 0) return;
    if (this.loadingPromises[bankKey]) {
      return this.loadingPromises[bankKey];
    }

    const urlMap = GUITAR_SAMPLE_BANKS_URLS[bankKey];
    const isElectric =
      bankKey === "clean_electric" || bankKey === "jazz_archtop";

    const promise = (async () => {
      const ctx = this.getContext();
      const entries = Object.entries(urlMap);

      await Promise.all(
        entries.map(async ([midiStr, url]) => {
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const arrayBuf = await resp.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuf);
            const processed = this.processAndNormalizeBuffer(
              decoded,
              isElectric,
              0.19,
              0.78
            );
            this.sampleBanks[bankKey].set(Number(midiStr), processed);
          } catch {
            // Continúa si algún archivo tarda
          }
        })
      );
    })();

    this.loadingPromises[bankKey] = promise;
    return promise;
  }

  public getInputNode(_channel: string = "guitar"): AudioNode {
    const ctx = this.getContext();
    return this.dryBus || ctx.destination;
  }

  private findClosestBuffer(
    bank: Map<number, AudioBuffer>,
    targetMidi: number
  ): { buffer: AudioBuffer; playbackRate: number } | null {
    if (bank.size === 0) return null;

    let closestMidi = 52;
    let minDiff = Infinity;

    bank.forEach((_, sampleMidi) => {
      const diff = Math.abs(targetMidi - sampleMidi);
      if (diff < minDiff) {
        minDiff = diff;
        closestMidi = sampleMidi;
      }
    });

    const buffer = bank.get(closestMidi);
    if (!buffer) return null;

    const playbackRate = Math.pow(2, (targetMidi - closestMidi) / 12);
    return { buffer, playbackRate };
  }

  /**
   * Dispara la muestra con un Fade-Out Exponencial Continuo (sin mesetas artificiales)
   * para que el sonido siempre caiga de manera firme y natural como una cuerda real.
   */
  private triggerSampleBuffer(
    buffer: AudioBuffer,
    playbackRate: number,
    start: number,
    totalDurationSec: number,
    gainLevel: number,
    pan: number = 0,
    warmthDb: number = 0,
    brillianceDb: number = 0,
    isContinuousFadeOut: boolean = false
  ): void {
    const ctx = this.getContext();
    const dest = this.getInputNode("guitar");

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(playbackRate, start);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    // Ataque rápido de uñeta (3ms)
    env.gain.linearRampToValueAtTime(gainLevel, start + 0.003);

    if (isContinuousFadeOut) {
      // Fade-out exponencial continuo y parejo desde el ataque hasta el final (imposible que suba y baje)
      env.gain.exponentialRampToValueAtTime(
        gainLevel * 0.35,
        start + totalDurationSec * 0.45
      );
      env.gain.exponentialRampToValueAtTime(
        0.0001,
        start + totalDurationSec
      );
    } else {
      // Envolvente para las guitarras acústicas (que ya te gustaron tal cual)
      env.gain.setValueAtTime(gainLevel, start + totalDurationSec * 0.7);
      env.gain.exponentialRampToValueAtTime(
        0.0001,
        start + totalDurationSec
      );
    }

    let lastNode: AudioNode = src;

    if (warmthDb !== 0) {
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.setValueAtTime(340, start);
      lowShelf.gain.setValueAtTime(warmthDb, start);
      lastNode.connect(lowShelf);
      lastNode = lowShelf;
    }

    if (brillianceDb !== 0) {
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.setValueAtTime(2800, start);
      highShelf.gain.setValueAtTime(brillianceDb, start);
      lastNode.connect(highShelf);
      lastNode = highShelf;
    }

    lastNode.connect(env);

    if (ctx.createStereoPanner && pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.65, Math.min(0.65, pan)), start);
      env.connect(panner);
      panner.connect(dest);
    } else {
      env.connect(dest);
    }

    src.start(start);
    src.stop(start + totalDurationSec + 0.05);
  }

  public playGuitarMidi(
    midi: number,
    instrument: GuitarInstrumentId = this.currentInstrument,
    durationSec: number = 2.6,
    delaySec: number = 0,
    velocity: number = 0.56
  ): void {
    const ctx = this.getContext();
    const start = ctx.currentTime + delaySec;
    const stereoPan = ((midi - 58) / 30) * 0.32;

    // 1. CLEAN ELECTRIC HD (Con Fade-Out continuo sin fluctuaciones)
    if (instrument === "clean_electric") {
      this.loadSampleBank("clean_electric");
      const match =
        this.findClosestBuffer(this.sampleBanks.clean_electric, midi) ||
        this.findClosestBuffer(this.sampleBanks.acoustic_steel, midi);
      if (match) {
        this.triggerSampleBuffer(
          match.buffer,
          match.playbackRate,
          start,
          durationSec,
          velocity * 0.95,
          stereoPan,
          1.5,
          2.0,
          true
        );
      }
      return;
    }

    // 2. JAZZ ARCHTOP WARM (Cálida, redonda y con Fade-Out continuo firme)
    if (instrument === "jazz_archtop") {
      this.loadSampleBank("jazz_archtop");
      const match =
        this.findClosestBuffer(this.sampleBanks.jazz_archtop, midi) ||
        this.findClosestBuffer(this.sampleBanks.nylon_spanish, midi);
      if (match) {
        this.triggerSampleBuffer(
          match.buffer,
          match.playbackRate,
          start,
          durationSec,
          velocity * 0.98,
          stereoPan,
          3.0,
          -2.5,
          true
        );
      }
      return;
    }

    // 3. ACOUSTIC STEEL HD (Intacta como te gustó)
    if (instrument === "acoustic_steel") {
      this.loadSampleBank("acoustic_steel");
      const match = this.findClosestBuffer(
        this.sampleBanks.acoustic_steel,
        midi
      );
      if (match) {
        this.triggerSampleBuffer(
          match.buffer,
          match.playbackRate,
          start,
          durationSec,
          velocity * 0.9,
          stereoPan,
          0.5,
          2.0,
          false
        );
      }
      return;
    }

    // 4. CONCERT NYLON (Intacta como te gustó)
    if (instrument === "nylon_spanish") {
      this.loadSampleBank("nylon_spanish");
      const match = this.findClosestBuffer(
        this.sampleBanks.nylon_spanish,
        midi
      );
      if (match) {
        this.triggerSampleBuffer(
          match.buffer,
          match.playbackRate,
          start,
          durationSec,
          velocity * 0.92,
          stereoPan,
          1.5,
          0.5,
          false
        );
      }
      return;
    }

    // 5. WARM STUDIO ELECTRIC (Combinación en fase 100% estable sin detune que cause oscilación)
    this.loadSampleBank("clean_electric");
    this.loadSampleBank("acoustic_steel");
    const cleanMatch = this.findClosestBuffer(
      this.sampleBanks.clean_electric,
      midi
    );
    const steelMatch = this.findClosestBuffer(
      this.sampleBanks.acoustic_steel,
      midi
    );

    if (cleanMatch && steelMatch) {
      this.triggerSampleBuffer(
        cleanMatch.buffer,
        cleanMatch.playbackRate,
        start,
        durationSec,
        velocity * 0.58,
        -0.25,
        2.0,
        1.0,
        true
      );
      this.triggerSampleBuffer(
        steelMatch.buffer,
        steelMatch.playbackRate,
        start,
        durationSec,
        velocity * 0.36,
        0.25,
        1.0,
        1.5,
        true
      );
    } else if (cleanMatch) {
      this.triggerSampleBuffer(
        cleanMatch.buffer,
        cleanMatch.playbackRate,
        start,
        durationSec,
        velocity * 0.95,
        stereoPan,
        1.5,
        2.0,
        true
      );
    }
  }

  public playGuitarFrequency(
    freq: number,
    instrument: GuitarInstrumentId = this.currentInstrument,
    durationSec: number = 2.6,
    delaySec: number = 0,
    velocity: number = 0.56
  ): void {
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    this.playGuitarMidi(midi, instrument, durationSec, delaySec, velocity);
  }

  public playChord(
    frequencies: number[],
    _channelOrInstrument?: string,
    strumStepSec: number = 0.042
  ): void {
    const targetInst: GuitarInstrumentId =
      _channelOrInstrument &&
      GUITAR_INSTRUMENTS.some((i) => i.id === _channelOrInstrument)
        ? (_channelOrInstrument as GuitarInstrumentId)
        : this.currentInstrument;

    frequencies.forEach((freq, idx) => {
      this.playGuitarFrequency(
        freq,
        targetInst,
        2.6,
        idx * strumStepSec,
        0.54
      );
    });
  }

  public playNote(freq: number, _channelOrInstrument?: string): void {
    const targetInst: GuitarInstrumentId =
      _channelOrInstrument &&
      GUITAR_INSTRUMENTS.some((i) => i.id === _channelOrInstrument)
        ? (_channelOrInstrument as GuitarInstrumentId)
        : this.currentInstrument;

    this.playGuitarFrequency(freq, targetInst, 2.2, 0, 0.62);
  }
}

export const dictionaryAudio = new DictionaryGuitarAudioEngine();