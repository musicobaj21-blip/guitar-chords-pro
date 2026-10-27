/**
 * Linus Harmony Pro - Módulo de Análisis Interactivo (Jazz Standards: Autumn Leaves, Minor Swing, etc.)
 * Motor de Audio Aislado de Calidad de Estudio Profesional:
 *
 * 1. Motor de Sampler (WAV):
 *    - Carga y decodificación de archivos estáticos WAV / AudioBuffers usando AudioBufferSourceNode.
 *    - Cero OscillatorNodes ni síntesis MIDI genérica en la reproducción de la banda.
 *    - Multisamples acústicos reales de Batería de estudio, Contrabajo/Bajo acústico y Piano de cola / Teclado.
 *
 * 2. Separación de Frecuencias (EQ Complementaria):
 *    - Canal Armonía/Teclado: BiquadFilterNode (High-Pass a 140Hz, Q=0.707).
 *      Corta frecuencias subgraves y graves para que no compitan con el Bajo ni el Kick.
 *    - Canal Bajo: BiquadFilterNode (Low-Pass a 2800Hz) para calidez y eliminación de asperezas.
 *
 * 3. Mezclador Independiente con Mute y Solo:
 *    - Canales independientes (Batería, Bajo, Teclado/Armonía) con sus propios GainNodes.
 *    - Lógica de Mute (silencia la pista) y Solo (silencia temporalmente las demás pistas).
 *    - Faders de volumen individuales continuos con de-zippering (setTargetAtTime).
 *
 * 4. Mastering / Gain Staging (Brickwall Limiter):
 *    - Master Bus GainNode -> DynamicsCompressorNode como limitador brickwall:
 *      Ratio 20:1, Threshold -1dB, Attack 0.001s, Release 0.05s, Knee 0.
 *      Evita cualquier clipping digital en la suma de pistas antes de ir a audioContext.destination.
 *
 * REGLA DE AISLAMIENTO:
 * Todo este motor está estrictamente encapsulado para el módulo de Análisis Interactivo.
 */

import * as Tone from 'tone';

export interface MixerChannelState {
  volume: number; // 0.0 a 4.5
  pan?: number;   // -1.0 a 1.0 (paneo estéreo)
  isMuted: boolean;
  isSolo: boolean;
}

export type DrumPieceName = 'kick' | 'snare' | 'hihat' | 'ride';

export interface DrumPieceState {
  volume: number; // 0.0 a 1.5
  pan?: number;   // -1.0 a 1.0 (paneo estéreo)
  isMuted: boolean;
}

export type MainMixerChannel = 'drums' | 'bass' | 'piano' | 'rhodes' | 'guitar';

export interface MixerState {
  drums: MixerChannelState;
  drumPieces: Record<DrumPieceName, DrumPieceState>;
  bass: MixerChannelState;
  piano: MixerChannelState;
  rhodes: MixerChannelState;
  guitar: MixerChannelState;
  masterVolume: number;
  roomReverbWet?: number; // 0.0 a 1.0 (Nivel de retorno de Room Reverb Wet)
  metronomeActive: boolean;
}

export type DrumSampleName = 'kick' | 'snare' | 'hihat' | 'hihat_closed' | 'hihat_open' | 'ride' | 'rim';
export type HarmonicInstrumentType = 'piano' | 'guitar' | 'epiano';

// Rutas a archivos .wav locales en /public/audio/drumjazz/ para el motor de batería acústica
const DRUM_WAV_SOURCES: Record<DrumSampleName, string[]> = {
  kick: ['/audio/drumjazz/jazz-drum-kit-kick_G_minor.wav'],
  snare: ['/audio/drumjazz/jazz-drum-kit-punchy-snare_G_minor.wav'],
  hihat: ['/audio/drumjazz/jazz-drum-kit-closed-hi-hat_F_minor.wav'],
  hihat_closed: ['/audio/drumjazz/jazz-drum-kit-closed-hi-hat_F_minor.wav'],
  hihat_open: ['/audio/drums/hihat_open.wav'],
  ride: ['/audio/drumjazz/jazz-drum-kit-ride-2.wav'],
  rim: ['/audio/drumjazz/jazz-drum-kit-rim_C_minor.wav'],
};

const PIANO_ANCHOR_URLS = [
  { midi: 36, note: 'C2', url: 'https://tonejs.github.io/audio/salamander/C2.mp3' },
  { midi: 48, note: 'C3', url: 'https://tonejs.github.io/audio/salamander/C3.mp3' },
  { midi: 60, note: 'C4', url: 'https://tonejs.github.io/audio/salamander/C4.mp3' },
  { midi: 72, note: 'C5', url: 'https://tonejs.github.io/audio/salamander/C5.mp3' },
  { midi: 84, note: 'C6', url: 'https://tonejs.github.io/audio/salamander/C6.mp3' },
];

export class InteractiveAnalysisAudioEngine {
  private ctx: AudioContext | null = null;

  // Master Section
  private masterBusGain: GainNode | null = null;
  private styleGainNode: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private brickwallLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private currentStyleGainMultiplier: number = 1.0;

  // Channel Strips
  // 1. Drums & Drum Bus Sub-Mixer
  private drumInputNode: GainNode | null = null;
  private drumFaderGain: GainNode | null = null;
  private drumAnalyser: AnalyserNode | null = null;

  // GainNodes independientes por pieza de batería para sub-mixer
  private kickGainNode: GainNode | null = null;
  private snareGainNode: GainNode | null = null;
  private hihatGainNode: GainNode | null = null;
  private rideGainNode: GainNode | null = null;

  // StereoPannerNodes independientes por pista
  private kickPannerNode: StereoPannerNode | null = null;
  private snarePannerNode: StereoPannerNode | null = null;
  private hihatPannerNode: StereoPannerNode | null = null;
  private ridePannerNode: StereoPannerNode | null = null;

  // AnalyserNodes independientes para medidores VU en tiempo real
  private kickAnalyser: AnalyserNode | null = null;
  private snareAnalyser: AnalyserNode | null = null;
  private hihatAnalyser: AnalyserNode | null = null;
  private rideAnalyser: AnalyserNode | null = null;

  // 2. Bass
  private bassInputNode: GainNode | null = null;
  private bassEQFilter: BiquadFilterNode | null = null;
  private bassPannerNode: StereoPannerNode | null = null;
  private bassFaderGain: GainNode | null = null;
  private bassAnalyser: AnalyserNode | null = null;

  // 3. Piano Strip
  private pianoInputNode: GainNode | null = null;
  private pianoHighpassEQ: BiquadFilterNode | null = null;
  private pianoPannerNode: StereoPannerNode | null = null;
  private pianoFaderGain: GainNode | null = null;
  private pianoAnalyser: AnalyserNode | null = null;

  // 4. Rhodes Strip (epiano)
  private rhodesInputNode: GainNode | null = null;
  private rhodesHighpassEQ: BiquadFilterNode | null = null;
  private rhodesPannerNode: StereoPannerNode | null = null;
  private rhodesFaderGain: GainNode | null = null;
  private rhodesAnalyser: AnalyserNode | null = null;

  // 5. Guitar Strip (guitar)
  private guitarInputNode: GainNode | null = null;
  private guitarHighpassEQ: BiquadFilterNode | null = null;
  private guitarPannerNode: StereoPannerNode | null = null;
  private guitarFaderGain: GainNode | null = null;
  private guitarAnalyser: AnalyserNode | null = null;

  // 6. Reverb Room (ConvolverNode & Bus Auxiliar Paralelo Dry/Wet)
  private roomConvolverNode: ConvolverNode | null = null;
  private reverbSendBusGain: GainNode | null = null;
  private reverbReturnGain: GainNode | null = null;
  private reverbFilter: BiquadFilterNode | null = null;

  // Sample Buffers Cache
  private drumBuffers: Map<DrumSampleName, AudioBuffer> = new Map();
  private bassBuffers: Map<number, AudioBuffer> = new Map();
  private pianoBuffers: Map<number, AudioBuffer> = new Map();
  private guitarBuffers: Map<number, AudioBuffer> = new Map();
  private epianoBuffers: Map<number, AudioBuffer> = new Map();

  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private activeHarmonyVoices: Set<{ source: AudioBufferSourceNode; gainNode: GainNode; stopTime: number }> = new Set();
  private activeBassVoices: Set<{ source: AudioBufferSourceNode; gainNode: GainNode; stopTime: number }> = new Set();
  private readonly MAX_HARMONY_POLYPHONY = 8;
  private isPreloadingSamples = false;
  private samplesReady = false;
  private lastRideScheduledTime = -1;

  // Current Mixer State con canales separados, ganancia balanceada y paneo estéreo universal
  private mixerState: MixerState = {
    drums: { volume: 0.63, isMuted: false, isSolo: false }, // -4.0 dB
    drumPieces: {
      kick: { volume: 1.0, pan: 0.0, isMuted: false },
      snare: { volume: 1.0, pan: 0.0, isMuted: false },
      hihat: { volume: 1.0, pan: -0.30, isMuted: false },
      ride: { volume: 1.0, pan: 0.35, isMuted: false },
    },
    bass: { volume: Tone.dbToGain(8), pan: 0.0, isMuted: false, isSolo: false }, // +8.0 dB
    piano: { volume: Tone.dbToGain(-10), pan: -0.15, isMuted: false, isSolo: false }, // -10.0 dB
    rhodes: { volume: 0.85, pan: -0.15, isMuted: false, isSolo: false },
    guitar: { volume: 0.85, pan: -0.15, isMuted: false, isSolo: false },
    masterVolume: 0.90,
    roomReverbWet: 0.28,
    metronomeActive: true,
  };

  private listeners: Set<(state: MixerState) => void> = new Set();
  private externalSoloActive: boolean = false;

  constructor() {
    // Inicialización bajo demanda para cumplir con las políticas de autoplay de navegadores
  }

  /**
   * Obtiene o inicializa el AudioContext y construye el grafo de mezcla
   */
  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.buildAudioGraph();
      this.preloadAllWavSamples();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((e) => console.warn('[InteractiveAnalysisAudio] Error al reanudar AudioContext:', e));
    }

    return this.ctx;
  }

  /**
   * Alias para inicialización explícita
   */
  public init(): AudioContext {
    return this.getAudioContext();
  }

  /**
   * Obtiene o crea un MediaStreamAudioDestinationNode para grabación maestra (MediaRecorder)
   */
  public getOrCreateMediaStreamDestination(): MediaStreamAudioDestinationNode {
    const ctx = this.getAudioContext();
    if (!this.mediaStreamDest) {
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      if (this.masterAnalyser) {
        this.masterAnalyser.connect(this.mediaStreamDest);
      }
    }
    return this.mediaStreamDest;
  }

  private connectedMediaElements = new WeakSet<HTMLMediaElement>();

  /**
   * Conecta un elemento HTMLAudioElement al bus maestro para que pase por el limitador brickwall
   */
  public connectMediaElement(element: HTMLMediaElement): void {
    const ctx = this.getAudioContext();
    if (!this.connectedMediaElements.has(element)) {
      try {
        const source = ctx.createMediaElementSource(element);
        if (this.masterBusGain) {
          source.connect(this.masterBusGain);
          this.connectedMediaElements.add(element);
        }
      } catch (e) {
        // Element already connected or error
      }
    }
  }

  /**
   * Genera matemáticamente un buffer de respuesta al impulso (IR sintético)
   * simulando una sala acústica natural ("Room") con ruido blanco y decaimiento exponencial
   * de 1.6 segundos (~1.5 a 2.0s) sin requerir archivos de audio externos.
   */
  private generateRoomImpulseResponse(durationSeconds = 1.6, decayRate = 3.5): AudioBuffer {
    if (!this.ctx) {
      throw new Error("AudioContext no inicializado al generar Room Impulse Response");
    }
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const impulseBuffer = this.ctx.createBuffer(2, length, sampleRate);
    const leftChannel = impulseBuffer.getChannelData(0);
    const rightChannel = impulseBuffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const normalizedTime = i / length;
      // Decaimiento exponencial clásico para emular absorción acústica natural de una sala
      const envelope = Math.exp(-decayRate * normalizedTime) * (1 - normalizedTime * 0.05);
      // Ruido blanco estéreo decorrelacionado
      leftChannel[i] = (Math.random() * 2 - 1) * envelope;
      rightChannel[i] = (Math.random() * 2 - 1) * envelope;
    }

    return impulseBuffer;
  }

  /**
   * Construye el grafo de ruteo y mezcla de estudio profesional:
   *
   * [Drum Source] -> [drumInputNode] -> [drumFaderGain] ───────────────┐
   *                                                                   │
   * [Bass Source] -> [bassInputNode] -> [bassEQ (LP 2.8k)] -> [bassFaderGain] ─┼──> [masterBusGain] -> [Brickwall Limiter (-1dB)] -> [destination]
   *                                                                   │
   * [Harm Source] -> [harmInputNode] -> [harmHPF (HP 140Hz)] -> [harmFaderGain] ┘
   */
  private buildAudioGraph(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // --- 1. SECCIÓN MASTERING: LIMITADOR MAESTRO (NIVELADOR AUTOMÁTICO) Y COMPENSACIÓN DE ESTILO ---
    // Cadena: [Tracks + Reverb] -> [masterBusGain] -> [styleGainNode] -> [masterAnalyser] -> [masterCompressor] -> [destination]
    this.masterBusGain = this.ctx.createGain();
    this.masterBusGain.gain.setValueAtTime(this.mixerState.masterVolume, now);

    // Multiplicador de ganancia base oculto para equilibrar estilos desde la fuente
    this.styleGainNode = this.ctx.createGain();
    this.styleGainNode.gain.setValueAtTime(this.currentStyleGainMultiplier, now);

    // Limitador Maestro (DynamicsCompressorNode como nivelador automático)
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-15, now);
    this.masterCompressor.knee.setValueAtTime(30, now);
    this.masterCompressor.ratio.setValueAtTime(12, now);
    this.masterCompressor.attack.setValueAtTime(0.003, now);
    this.masterCompressor.release.setValueAtTime(0.25, now);
    this.brickwallLimiter = this.masterCompressor; // Mantiene compatibilidad interna

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;

    this.masterBusGain.connect(this.styleGainNode);
    this.styleGainNode.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.masterCompressor);
    this.masterCompressor.connect(this.ctx.destination);
    if (this.mediaStreamDest) {
      try {
        this.masterCompressor.connect(this.mediaStreamDest);
      } catch (e) {
        // ignore
      }
    }

    // --- 2. CANAL DE BATERÍA (DRUMS STRIP & SUB-MIXER DRUM BUS) ---
    this.drumInputNode = this.ctx.createGain();
    this.drumInputNode.gain.setValueAtTime(1.0, now);

    this.drumFaderGain = this.ctx.createGain();
    this.drumFaderGain.gain.setValueAtTime(this.mixerState.drums.volume, now);

    this.drumAnalyser = this.ctx.createAnalyser();
    this.drumAnalyser.fftSize = 256;

    // Sub-Mixer Drum Bus: GainNodes y StereoPannerNodes dedicados por instrumento
    this.kickGainNode = this.ctx.createGain();
    this.kickGainNode.gain.setValueAtTime(
      this.mixerState.drumPieces.kick.isMuted ? 0 : this.mixerState.drumPieces.kick.volume,
      now
    );
    this.kickPannerNode = this.ctx.createStereoPanner();
    this.kickPannerNode.pan.setValueAtTime(this.mixerState.drumPieces.kick.pan ?? 0.0, now);
    this.kickPannerNode.connect(this.kickGainNode);

    this.snareGainNode = this.ctx.createGain();
    this.snareGainNode.gain.setValueAtTime(
      this.mixerState.drumPieces.snare.isMuted ? 0 : this.mixerState.drumPieces.snare.volume,
      now
    );
    this.snarePannerNode = this.ctx.createStereoPanner();
    this.snarePannerNode.pan.setValueAtTime(this.mixerState.drumPieces.snare.pan ?? 0.0, now);
    this.snarePannerNode.connect(this.snareGainNode);

    this.hihatGainNode = this.ctx.createGain();
    this.hihatGainNode.gain.setValueAtTime(
      this.mixerState.drumPieces.hihat.isMuted ? 0 : this.mixerState.drumPieces.hihat.volume,
      now
    );
    this.hihatPannerNode = this.ctx.createStereoPanner();
    this.hihatPannerNode.pan.setValueAtTime(this.mixerState.drumPieces.hihat.pan ?? -0.30, now);
    this.hihatPannerNode.connect(this.hihatGainNode);

    this.rideGainNode = this.ctx.createGain();
    this.rideGainNode.gain.setValueAtTime(
      this.mixerState.drumPieces.ride.isMuted ? 0 : this.mixerState.drumPieces.ride.volume,
      now
    );
    this.ridePannerNode = this.ctx.createStereoPanner();
    this.ridePannerNode.pan.setValueAtTime(this.mixerState.drumPieces.ride.pan ?? 0.35, now);
    this.ridePannerNode.connect(this.rideGainNode);

    // Analysers individuales para medidores de VU de batería
    this.kickAnalyser = this.ctx.createAnalyser();
    this.kickAnalyser.fftSize = 128;
    this.snareAnalyser = this.ctx.createAnalyser();
    this.snareAnalyser.fftSize = 128;
    this.hihatAnalyser = this.ctx.createAnalyser();
    this.hihatAnalyser.fftSize = 128;
    this.rideAnalyser = this.ctx.createAnalyser();
    this.rideAnalyser.fftSize = 128;

    // Enrutamiento Sub-Mixer: [Panner] -> [Gain] -> [Analysers] -> [drumInputNode] -> [drumFaderGain] -> [drumAnalyser] -> [masterBusGain]
    this.kickGainNode.connect(this.kickAnalyser);
    this.kickAnalyser.connect(this.drumInputNode);

    this.snareGainNode.connect(this.snareAnalyser);
    this.snareAnalyser.connect(this.drumInputNode);

    this.hihatGainNode.connect(this.hihatAnalyser);
    this.hihatAnalyser.connect(this.drumInputNode);

    this.rideGainNode.connect(this.rideAnalyser);
    this.rideAnalyser.connect(this.drumInputNode);

    this.drumInputNode.connect(this.drumFaderGain);
    this.drumFaderGain.connect(this.drumAnalyser);
    this.drumAnalyser.connect(this.masterBusGain);

    // --- 3. CANAL DE CONTRABAJO / BAJO (BASS STRIP, EQ & PANNER) ---
    this.bassInputNode = this.ctx.createGain();
    this.bassInputNode.gain.setValueAtTime(1.0, now);

    // EQ de Bajo: Filtro paso bajo a 2800Hz para mantener la pegada de graves y redondear armónicos
    this.bassEQFilter = this.ctx.createBiquadFilter();
    this.bassEQFilter.type = 'lowpass';
    this.bassEQFilter.frequency.setValueAtTime(2800, now);
    this.bassEQFilter.Q.setValueAtTime(0.707, now);

    this.bassPannerNode = this.ctx.createStereoPanner();
    this.bassPannerNode.pan.setValueAtTime(this.mixerState.bass.pan ?? 0.0, now);

    this.bassFaderGain = this.ctx.createGain();
    this.bassFaderGain.gain.setValueAtTime(this.mixerState.bass.volume, now);

    this.bassAnalyser = this.ctx.createAnalyser();
    this.bassAnalyser.fftSize = 256;

    this.bassInputNode.connect(this.bassEQFilter);
    this.bassEQFilter.connect(this.bassPannerNode);
    this.bassPannerNode.connect(this.bassFaderGain);
    this.bassFaderGain.connect(this.bassAnalyser);
    this.bassAnalyser.connect(this.masterBusGain);

    // --- 4. CANAL DE PIANO (PIANO STRIP, HPF 140Hz & PANNER) ---
    this.pianoInputNode = this.ctx.createGain();
    this.pianoInputNode.gain.setValueAtTime(1.0, now);

    this.pianoHighpassEQ = this.ctx.createBiquadFilter();
    this.pianoHighpassEQ.type = 'highpass';
    this.pianoHighpassEQ.frequency.setValueAtTime(140, now);
    this.pianoHighpassEQ.Q.setValueAtTime(0.707, now);

    this.pianoPannerNode = this.ctx.createStereoPanner();
    this.pianoPannerNode.pan.setValueAtTime(this.mixerState.piano.pan ?? -0.15, now);

    this.pianoFaderGain = this.ctx.createGain();
    this.pianoFaderGain.gain.setValueAtTime(this.mixerState.piano.volume, now);

    this.pianoAnalyser = this.ctx.createAnalyser();
    this.pianoAnalyser.fftSize = 256;

    this.pianoInputNode.connect(this.pianoHighpassEQ);
    this.pianoHighpassEQ.connect(this.pianoPannerNode);
    this.pianoPannerNode.connect(this.pianoFaderGain);
    this.pianoFaderGain.connect(this.pianoAnalyser);
    this.pianoAnalyser.connect(this.masterBusGain);

    // --- 5. CANAL DE RHODES (RHODES STRIP, HPF 140Hz & PANNER) ---
    this.rhodesInputNode = this.ctx.createGain();
    this.rhodesInputNode.gain.setValueAtTime(1.0, now);

    this.rhodesHighpassEQ = this.ctx.createBiquadFilter();
    this.rhodesHighpassEQ.type = 'highpass';
    this.rhodesHighpassEQ.frequency.setValueAtTime(140, now);
    this.rhodesHighpassEQ.Q.setValueAtTime(0.707, now);

    this.rhodesPannerNode = this.ctx.createStereoPanner();
    this.rhodesPannerNode.pan.setValueAtTime(this.mixerState.rhodes.pan ?? -0.15, now);

    this.rhodesFaderGain = this.ctx.createGain();
    this.rhodesFaderGain.gain.setValueAtTime(this.mixerState.rhodes.volume, now);

    this.rhodesAnalyser = this.ctx.createAnalyser();
    this.rhodesAnalyser.fftSize = 256;

    this.rhodesInputNode.connect(this.rhodesHighpassEQ);
    this.rhodesHighpassEQ.connect(this.rhodesPannerNode);
    this.rhodesPannerNode.connect(this.rhodesFaderGain);
    this.rhodesFaderGain.connect(this.rhodesAnalyser);
    this.rhodesAnalyser.connect(this.masterBusGain);

    // --- 6. CANAL DE GUITARRA (GUITAR STRIP, HPF 140Hz & PANNER) ---
    this.guitarInputNode = this.ctx.createGain();
    this.guitarInputNode.gain.setValueAtTime(1.0, now);

    this.guitarHighpassEQ = this.ctx.createBiquadFilter();
    this.guitarHighpassEQ.type = 'highpass';
    this.guitarHighpassEQ.frequency.setValueAtTime(140, now);
    this.guitarHighpassEQ.Q.setValueAtTime(0.707, now);

    this.guitarPannerNode = this.ctx.createStereoPanner();
    this.guitarPannerNode.pan.setValueAtTime(this.mixerState.guitar.pan ?? -0.15, now);

    this.guitarFaderGain = this.ctx.createGain();
    this.guitarFaderGain.gain.setValueAtTime(this.mixerState.guitar.volume, now);

    this.guitarAnalyser = this.ctx.createAnalyser();
    this.guitarAnalyser.fftSize = 256;

    this.guitarInputNode.connect(this.guitarHighpassEQ);
    this.guitarHighpassEQ.connect(this.guitarPannerNode);
    this.guitarPannerNode.connect(this.guitarFaderGain);
    this.guitarFaderGain.connect(this.guitarAnalyser);
    this.guitarAnalyser.connect(this.masterBusGain);

    // --- 7. BUS AUXILIAR DE REVERBERACIÓN TIPO "ROOM" (CONVOLVER & DRY/WET PARALELO) ---
    this.roomConvolverNode = this.ctx.createConvolver();
    this.roomConvolverNode.buffer = this.generateRoomImpulseResponse(1.6, 3.5);

    // Bus receptor de envíos auxiliares
    this.reverbSendBusGain = this.ctx.createGain();
    this.reverbSendBusGain.gain.setValueAtTime(1.0, now);

    // Filtro acústico cálido (roll-off suave a 4.5kHz para emular absorción de sala de madera/estudio)
    this.reverbFilter = this.ctx.createBiquadFilter();
    this.reverbFilter.type = 'lowpass';
    this.reverbFilter.frequency.setValueAtTime(4500, now);
    this.reverbFilter.Q.setValueAtTime(0.707, now);

    // Fader de Retorno del Reverb (Wet Return Level)
    this.reverbReturnGain = this.ctx.createGain();
    const initialReverbWet = this.mixerState.roomReverbWet ?? 0.28;
    this.reverbReturnGain.gain.setValueAtTime(initialReverbWet, now);

    // Cadena Reverb Wet: [reverbSendBus] -> [roomConvolver] -> [reverbFilter] -> [reverbReturnGain] -> [masterBusGain]
    this.reverbSendBusGain.connect(this.roomConvolverNode);
    this.roomConvolverNode.connect(this.reverbFilter);
    this.reverbFilter.connect(this.reverbReturnGain);
    this.reverbReturnGain.connect(this.masterBusGain);

    // Ruteo Paralelo de Envíos Auxiliares (porción moderada del 25% hacia Reverb):
    // 1. Batería (25% al Reverb)
    if (this.drumFaderGain) {
      const drumReverbSend = this.ctx.createGain();
      drumReverbSend.gain.setValueAtTime(0.25, now);
      this.drumFaderGain.connect(drumReverbSend);
      drumReverbSend.connect(this.reverbSendBusGain);
    }

    // 2. Piano (25% al Reverb)
    if (this.pianoFaderGain) {
      const pianoReverbSend = this.ctx.createGain();
      pianoReverbSend.gain.setValueAtTime(0.25, now);
      this.pianoFaderGain.connect(pianoReverbSend);
      pianoReverbSend.connect(this.reverbSendBusGain);
    }

    // 3. Rhodes (25% al Reverb)
    if (this.rhodesFaderGain) {
      const rhodesReverbSend = this.ctx.createGain();
      rhodesReverbSend.gain.setValueAtTime(0.25, now);
      this.rhodesFaderGain.connect(rhodesReverbSend);
      rhodesReverbSend.connect(this.reverbSendBusGain);
    }

    // 4. Guitarra (25% al Reverb)
    if (this.guitarFaderGain) {
      const guitarReverbSend = this.ctx.createGain();
      guitarReverbSend.gain.setValueAtTime(0.25, now);
      this.guitarFaderGain.connect(guitarReverbSend);
      guitarReverbSend.connect(this.reverbSendBusGain);
    }

    // NOTA CRÍTICA: El Bajo (contrabajo) permanece 100% seco (0% al reverb)
    // para preservar la claridad y definición de frecuencias graves sin crear "barro".

    // Aplicar cálculo inicial de Mute y Solo (los AudioBuffers reales se cargan en preloadAllWavSamples)
    this.applyEffectiveGains();
    this.preloadAllWavSamples().catch(() => {});
  }

  private preloadPromise: Promise<void> | null = null;
  private decodeCtx: BaseAudioContext | null = null;

  private getDecodeContext(): BaseAudioContext {
    if (this.ctx) return this.ctx;
    if (!this.decodeCtx) {
      const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      this.decodeCtx = OfflineCtx ? new OfflineCtx(2, 1, 44100) : this.getAudioContext();
    }
    return this.decodeCtx!;
  }

  private async fetchAndDecodeRealSample(ctx: BaseAudioContext, urls: string[]): Promise<AudioBuffer | null> {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const arrayBuf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (decoded && decoded.length > 0) return decoded;
      } catch (_) {
        // Intentar siguiente CDN de respaldo
      }
    }
    return null;
  }

  /**
   * Carga y decodifica en memoria caché (Map) las muestras reales multi-sampleadas
   * desde CDN público (FluidR3_GM / MusyngKite / Salamander) y batería acústica real (/public/audio/drumjazz).
   */
  public async preloadAllWavSamples(): Promise<void> {
    if (this.samplesReady && this.pianoBuffers.size > 0 && this.bassBuffers.size > 0 && this.epianoBuffers.size > 0) {
      return;
    }
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.isPreloadingSamples = true;
    this.preloadPromise = (async () => {
      const ctx = this.getDecodeContext();

      // 1. Cargar Batería Acústica Real de Jazz/Studio (.wav)
      const drumFallbackMap: Record<DrumSampleName, string[]> = {
        kick: ['/audio/drumjazz/jazz-drum-kit-kick_G_minor.wav', '/audio/drums/kick.wav'],
        snare: ['/audio/drumjazz/jazz-drum-kit-punchy-snare_G_minor.wav', '/audio/drums/snare.wav'],
        hihat: ['/audio/drumjazz/jazz-drum-kit-closed-hi-hat_F_minor.wav', '/audio/drums/hihat_closed.wav', '/audio/drums/hihat.wav'],
        hihat_closed: ['/audio/drumjazz/jazz-drum-kit-closed-hi-hat_F_minor.wav', '/audio/drums/hihat_closed.wav'],
        hihat_open: ['/audio/drums/hihat_open.wav', '/audio/drums/hihat.wav'],
        ride: ['/audio/drumjazz/jazz-drum-kit-ride-2.wav', '/audio/drums/ride.wav'],
        rim: ['/audio/drumjazz/jazz-drum-kit-rim_C_minor.wav', '/audio/drums/rim.wav'],
      };

      const drumPromises = Object.entries(drumFallbackMap).map(async ([key, urls]) => {
        const sampleKey = key as DrumSampleName;
        const audioBuf = await this.fetchAndDecodeRealSample(ctx, urls);
        if (audioBuf) {
          this.drumBuffers.set(sampleKey, audioBuf);
        }
      });

      // Anclajes cromáticos cada 3ra menor (sin '#', usando bemoles para compatibilidad 100% con FluidR3_GM y MusyngKite)
      const keyboardAnchors = [
        { note: 'C2', midi: 36 }, { note: 'Eb2', midi: 39 }, { note: 'Gb2', midi: 42 }, { note: 'A2', midi: 45 },
        { note: 'C3', midi: 48 }, { note: 'Eb3', midi: 51 }, { note: 'Gb3', midi: 54 }, { note: 'A3', midi: 57 },
        { note: 'C4', midi: 60 }, { note: 'Eb4', midi: 63 }, { note: 'Gb4', midi: 66 }, { note: 'A4', midi: 69 },
        { note: 'C5', midi: 72 }, { note: 'Eb5', midi: 75 }, { note: 'Gb5', midi: 78 }, { note: 'A5', midi: 81 },
        { note: 'C6', midi: 84 }
      ];

      // 2. Cargar Muestras Reales de Grand Piano (PIANO_ANCHOR_URLS: C2: 36, C3: 48, C4: 60, C5: 72, C6: 84 de Salamander)
      const pianoPromises = PIANO_ANCHOR_URLS.map(async ({ midi, note, url }) => {
        const urls = [
          url,
          `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/${note}.mp3`,
          `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/${note}.mp3`,
        ];
        const audioBuf = await this.fetchAndDecodeRealSample(ctx, urls);
        if (audioBuf) {
          this.pianoBuffers.set(midi, audioBuf);
        }
      });

      // 3. Cargar Muestras Reales de Fender Rhodes (FluidR3_GM / MusyngKite electric_piano_1)
      const epianoPromises = keyboardAnchors.map(async ({ note, midi }) => {
        const urls = [
          `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_piano_1-mp3/${note}.mp3`,
          `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/electric_piano_1-mp3/${note}.mp3`,
        ];
        const audioBuf = await this.fetchAndDecodeRealSample(ctx, urls);
        if (audioBuf) {
          this.epianoBuffers.set(midi, audioBuf);
        }
      });

      // 4. Cargar Muestras Reales de Contrabajo Acústico (FluidR3_GM / MusyngKite acoustic_bass)
      const bassAnchors = [
        { note: 'E1', midi: 28 }, { note: 'G1', midi: 31 }, { note: 'A1', midi: 33 },
        { note: 'C2', midi: 36 }, { note: 'D2', midi: 38 }, { note: 'Eb2', midi: 39 }, { note: 'E2', midi: 40 }, { note: 'G2', midi: 43 }, { note: 'A2', midi: 45 },
        { note: 'C3', midi: 48 }, { note: 'D3', midi: 50 }, { note: 'E3', midi: 52 }, { note: 'G3', midi: 55 }, { note: 'A3', midi: 57 }, { note: 'C4', midi: 60 }
      ];
      const bassPromises = bassAnchors.map(async ({ note, midi }) => {
        const urls = [
          `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_bass-mp3/${note}.mp3`,
          `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_bass-mp3/${note}.mp3`,
        ];
        const audioBuf = await this.fetchAndDecodeRealSample(ctx, urls);
        if (audioBuf) {
          this.bassBuffers.set(midi, audioBuf);
        }
      });

      // 5. Cargar Muestras Reales de Guitarra de Jazz / Nylon (FluidR3_GM / MusyngKite electric_guitar_jazz & acoustic_guitar_nylon)
      const guitarAnchors = [
        { note: 'E2', midi: 40 }, { note: 'G2', midi: 43 }, { note: 'A2', midi: 45 },
        { note: 'C3', midi: 48 }, { note: 'D3', midi: 50 }, { note: 'E3', midi: 52 }, { note: 'G3', midi: 55 }, { note: 'A3', midi: 57 }, { note: 'B3', midi: 59 },
        { note: 'C4', midi: 60 }, { note: 'E4', midi: 64 }, { note: 'G4', midi: 67 }, { note: 'A4', midi: 69 }, { note: 'C5', midi: 72 }
      ];
      const guitarPromises = guitarAnchors.map(async ({ note, midi }) => {
        const urls = [
          `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_guitar_jazz-mp3/${note}.mp3`,
          `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/electric_guitar_jazz-mp3/${note}.mp3`,
          `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_nylon-mp3/${note}.mp3`,
        ];
        const audioBuf = await this.fetchAndDecodeRealSample(ctx, urls);
        if (audioBuf) {
          this.guitarBuffers.set(midi, audioBuf);
        }
      });

      await Promise.allSettled([
        ...drumPromises,
        ...pianoPromises,
        ...epianoPromises,
        ...bassPromises,
        ...guitarPromises,
      ]);

      this.samplesReady = true;
      this.isPreloadingSamples = false;
    })();

    return this.preloadPromise;
  }

  /**
   * Devuelve copias de referencia de todos los AudioBuffers reales decodificados
   * para poder instanciar nodos limpios dentro de Tone.Offline sin cruzar AudioContexts.
   */
  public async getBuffersForOfflineRender(): Promise<{
    drums: Record<DrumSampleName, AudioBuffer>;
    bass: Record<number, AudioBuffer>;
    piano: Record<number, AudioBuffer>;
    guitar: Record<number, AudioBuffer>;
    epiano: Record<number, AudioBuffer>;
  }> {
    await this.preloadAllWavSamples();

    const drumNames: DrumSampleName[] = ['kick', 'snare', 'hihat', 'hihat_closed', 'hihat_open', 'ride', 'rim'];
    const drums = {} as Record<DrumSampleName, AudioBuffer>;
    for (const name of drumNames) {
      let buf = this.drumBuffers.get(name);
      if (!buf && (name === 'hihat' || name === 'hihat_closed')) {
        buf = this.drumBuffers.get('hihat_closed') || this.drumBuffers.get('hihat');
      }
      if (buf) {
        drums[name] = buf;
      }
    }

    const bass: Record<number, AudioBuffer> = {};
    this.bassBuffers.forEach((buf, midi) => {
      bass[midi] = buf;
    });

    const piano: Record<number, AudioBuffer> = {};
    this.pianoBuffers.forEach((buf, midi) => {
      piano[midi] = buf;
    });

    const epiano: Record<number, AudioBuffer> = {};
    this.epianoBuffers.forEach((buf, midi) => {
      epiano[midi] = buf;
    });

    const guitar: Record<number, AudioBuffer> = {};
    this.guitarBuffers.forEach((buf, midi) => {
      guitar[midi] = buf;
    });

    return { drums, bass, piano, guitar, epiano };
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64.includes(',') ? base64.split(',')[1] : base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ==========================================
  // LÓGICA DE REPRODUCCIÓN MEDIANTE AUDIOBUFFERSOURCENODE
  // ==========================================

  /**
   * Reproduce un golpe de batería acústica real decodificada (.wav)
   */
  public playDrumHit(instrument: DrumSampleName, time: number, velocity = 0.85): AudioBufferSourceNode | null {
    const anySoloActive = this.isAnySoloActive();
    if (this.mixerState.drums.isMuted || (anySoloActive && !this.mixerState.drums.isSolo)) {
      return null;
    }

    const ctx = this.getAudioContext();
    const playTime = Math.max(time, ctx.currentTime + 0.002);

    // Prevención estricta de superposición / Phase Cancellation:
    // Evita que el Ride se dispare múltiples veces en el mismo milisegundo por error de scheduling,
    // permitiendo a la vez cuartinas (16th notes) continuas limpias en cualquier tempo (incluso >240 BPM)
    if (instrument === 'ride') {
      if (this.lastRideScheduledTime >= 0 && Math.abs(playTime - this.lastRideScheduledTime) < 0.015) {
        return null; // Descartar disparo duplicado que causaría efecto flanger
      }
      this.lastRideScheduledTime = playTime;
    }

    let buffer = this.drumBuffers.get(instrument);
    if (!buffer && (instrument === 'hihat' || instrument === 'hihat_closed')) {
      buffer = this.drumBuffers.get('hihat_closed') || this.drumBuffers.get('hihat');
    }
    if (!buffer) {
      this.preloadAllWavSamples().then(() => {
        if (ctx.currentTime - playTime <= 0.35 && this.drumBuffers.has(instrument)) {
          this.playDrumHit(instrument, ctx.currentTime + 0.005, velocity);
        }
      }).catch(() => {});
      return null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Forzar explícitamente Pitch Original 1.0 (sin alteraciones de pitch ni detuning aleatorio)
    source.playbackRate.value = 1.0;

    // Gain por golpe calibrado por instrumento
    const hitGain = ctx.createGain();
    const calGain = (
      instrument === 'kick' ? 1.15 :
      instrument === 'snare' ? 1.05 :
      instrument === 'rim' ? 0.90 :
      instrument === 'ride' ? 0.70 :
      instrument === 'hihat_open' ? 0.75 :
      instrument === 'hihat_closed' || instrument === 'hihat' ? 0.65 :
      0.85
    ) * velocity;
    hitGain.gain.setValueAtTime(calGain, playTime);

    source.connect(hitGain);

    // Enrutamiento independiente por pieza al Sub-Mixer / Drum Bus (vía StereoPannerNode antes del Gain):
    const targetPieceNode =
      instrument === 'kick' ? (this.kickPannerNode || this.kickGainNode) :
      instrument === 'snare' || instrument === 'rim' ? (this.snarePannerNode || this.snareGainNode) :
      instrument === 'ride' ? (this.ridePannerNode || this.rideGainNode) :
      (this.hihatPannerNode || this.hihatGainNode);

    hitGain.connect(targetPieceNode || this.drumInputNode!);

    source.start(playTime);
    const maxDur = (
      instrument === 'ride' ? 2.5 :
      instrument === 'hihat_open' ? 1.2 :
      instrument === 'kick' ? 0.8 :
      instrument === 'snare' ? 0.6 :
      0.35
    );
    source.stop(playTime + maxDur);
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      try {
        source.disconnect();
        hitGain.disconnect();
      } catch (e) {}
    };

    return source;
  }

  /**
   * Libera suavemente las notas activas de bajo para garantizar comportamiento monofónico limpio
   * y evitar picos de volumen por suma de fase en frecuencias graves.
   */
  public releaseAllBass(fadeTime = 0.015, referenceTime?: number): void {
    const ctx = this.getAudioContext();
    const now = referenceTime !== undefined ? Math.max(ctx.currentTime, referenceTime) : ctx.currentTime;
    this.activeBassVoices.forEach((voice) => {
      try {
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value || 0.25), now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeTime);
        voice.source.stop(now + fadeTime + 0.005);
      } catch (e) {}
    });
    this.activeBassVoices.clear();
  }

  /**
   * Reproduce una nota de contrabajo / bajo acústico decodificado (con pitch shifting natural y control monofónico)
   */
  public playBassNote(
    freqOrMidi: number,
    time: number,
    durationBeats = 1.0,
    velocity = 0.85
  ): AudioBufferSourceNode | null {
    const anySoloActive = this.isAnySoloActive();
    if (this.mixerState.bass.isMuted || (anySoloActive && !this.mixerState.bass.isSolo)) {
      return null;
    }

    const ctx = this.getAudioContext();
    const playTime = Math.max(time, ctx.currentTime + 0.002);
    const targetMidi = freqOrMidi >= 20 ? this.freqToMidi(freqOrMidi) : Math.round(freqOrMidi);

    // Cortar cualquier nota de bajo previa que se solape en este instante (evita picos de volumen en graves)
    this.activeBassVoices.forEach((voice) => {
      if (voice.stopTime > playTime) {
        try {
          voice.gainNode.gain.cancelScheduledValues(playTime);
          voice.gainNode.gain.setValueAtTime(0.2, playTime);
          voice.gainNode.gain.linearRampToValueAtTime(0.0001, playTime + 0.015);
          voice.source.stop(playTime + 0.02);
        } catch (e) {}
        this.activeBassVoices.delete(voice);
      }
    });

    // Buscar el buffer ancla más cercano en el banco de bajo real
    const anchor = this.findNearestBuffer(this.bassBuffers, targetMidi);
    if (!anchor) {
      this.preloadAllWavSamples().then(() => {
        if (ctx.currentTime - playTime <= 0.35 && this.bassBuffers.size > 0) {
          this.playBassNote(targetMidi, ctx.currentTime + 0.005, durationBeats, velocity);
        }
      }).catch(() => {});
      return null;
    }
    const buffer = anchor.buffer;
    const playbackRate = Math.pow(2, (targetMidi - anchor.midi) / 12);

    const source = ctx.createBufferSource();
    source.buffer = buffer!;
    source.playbackRate.setValueAtTime(playbackRate, playTime);

    const noteGain = ctx.createGain();
    const safeDurationBeats = Math.max(0.25, Math.min(4.0, isNaN(durationBeats) ? 1.0 : durationBeats));
    const noteDuration = Math.max(0.28, safeDurationBeats * 0.52);
    const safeVelocity = Math.max(0.05, Math.min(1.0, isNaN(velocity) ? 0.85 : velocity));
    const baseGain = safeVelocity * 1.0;

    const attackEnd = playTime + 0.015;
    const decayEnd = playTime + Math.min(0.22, noteDuration * 0.5);
    const releaseEnd = Math.max(decayEnd + 0.04, playTime + Math.min(noteDuration * 1.15, 1.6));

    noteGain.gain.setValueAtTime(0.0001, playTime);
    noteGain.gain.linearRampToValueAtTime(baseGain, attackEnd);
    noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, baseGain * 0.45), decayEnd);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    source.connect(noteGain);
    noteGain.connect(this.bassInputNode!);

    const stopTime = releaseEnd + 0.02;
    const voiceRecord = { source, gainNode: noteGain, stopTime };
    this.activeBassVoices.add(voiceRecord);
    this.activeSources.add(source);

    source.start(playTime);
    source.stop(stopTime);

    source.onended = () => {
      this.activeBassVoices.delete(voiceRecord);
      this.activeSources.delete(source);
      try {
        source.disconnect();
        noteGain.disconnect();
      } catch (e) {}
    };

    return source;
  }

  /**
   * Apaga/libera inmediatamente todas las notas del acorde de acompañamiento anterior (releaseAll)
   * para evitar solapamientos y disonancias entre compases (voice bleeding).
   */
  public releaseAllHarmony(fadeTime = 0.02, referenceTime?: number): void {
    const ctx = this.getAudioContext();
    const now = referenceTime !== undefined ? Math.max(ctx.currentTime, referenceTime) : ctx.currentTime;
    this.activeHarmonyVoices.forEach((voice) => {
      try {
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value || 0.2), now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeTime);
        voice.source.stop(now + fadeTime + 0.005);
      } catch (e) {}
    });
    this.activeHarmonyVoices.clear();
  }

  /**
   * Reproduce un acorde de acompañamiento (Piano, Guitarra o Rhodes) a través del canal
   * con filtro High-Pass de 140Hz y headroom polifónico.
   */
  public playHarmonyChord(
    frequencies: number[],
    time: number,
    durationSeconds = 1.5,
    instrument: HarmonicInstrumentType = 'piano',
    velocity = 1.0
  ): void {
    const anySoloActive = this.isAnySoloActive();
    const channelState =
      instrument === 'guitar'
        ? this.mixerState.guitar
        : instrument === 'epiano'
        ? this.mixerState.rhodes
        : this.mixerState.piano;
    if (channelState.isMuted || (anySoloActive && !channelState.isSolo)) {
      return;
    }

    const ctx = this.getAudioContext();
    const playTime = Math.max(time, ctx.currentTime + 0.002);

    // Filtrar frecuencias al registro armónico medio (limpieza de subgraves para evitar colisión con el bajo)
    const filtered = frequencies
      .filter((f) => f > 0 && !isNaN(f))
      .map((f) => {
        let freq = f;
        while (freq < 140) freq *= 2; // Asegura estar por encima de los 140Hz del filtro
        while (freq > 780) freq /= 2;
        return Math.round(freq * 10) / 10;
      });
    const validFreqs = Array.from(new Set(filtered));

    if (validFreqs.length === 0) return;

    // Headroom polifónico limpio y límite sano de 8 voces
    const safeVelocity = Math.max(0.05, Math.min(1.0, isNaN(velocity) ? 1.0 : velocity));
    const polyHeadroom = Math.min(1.0, 1.0 / Math.sqrt(validFreqs.length));
    const chordVelocity = safeVelocity * polyHeadroom;

    // Rasgueo natural según el instrumento
    const strumOffset = instrument === 'guitar' ? 0.020 : instrument === 'epiano' ? 0.008 : 0.004;

    // Límite estricto de polifonía (maxPolyphony: 8) para evitar colapso o saturación de voces
    while (this.activeHarmonyVoices.size + validFreqs.length > this.MAX_HARMONY_POLYPHONY && this.activeHarmonyVoices.size > 0) {
      const oldestVoice = this.activeHarmonyVoices.values().next().value;
      if (!oldestVoice) break;
      try {
        oldestVoice.gainNode.gain.cancelScheduledValues(playTime);
        oldestVoice.gainNode.gain.setValueAtTime(0.05, playTime);
        oldestVoice.gainNode.gain.linearRampToValueAtTime(0.0001, playTime + 0.015);
        oldestVoice.source.stop(playTime + 0.02);
      } catch (e) {}
      this.activeHarmonyVoices.delete(oldestVoice);
    }

    validFreqs.forEach((freq, index) => {
      const noteTime = playTime + index * strumOffset;
      const targetMidi = this.freqToMidi(freq);

      const bufferMap =
        instrument === 'guitar'
          ? this.guitarBuffers
          : instrument === 'epiano'
          ? this.epianoBuffers
          : this.pianoBuffers;

      const anchor = this.findNearestBuffer(bufferMap, targetMidi);
      if (!anchor) {
        if (index === 0) {
          this.preloadAllWavSamples().then(() => {
            if (ctx.currentTime - playTime <= 0.35 && bufferMap.size > 0) {
              this.playHarmonyChord(validFreqs, ctx.currentTime + 0.005, durationSeconds, instrument, velocity);
            }
          }).catch(() => {});
        }
        return;
      }
      const buffer = anchor.buffer;
      const playbackRate = Math.pow(2, (targetMidi - anchor.midi) / 12);

      const source = ctx.createBufferSource();
      source.buffer = buffer!;
      source.playbackRate.setValueAtTime(playbackRate, noteTime);

      // Filtro Lowpass cálido (800Hz - 1200Hz) específico para Rhodes
      let filterNode: BiquadFilterNode | null = null;
      if (instrument === 'epiano') {
        filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(1000, noteTime);
        filterNode.Q.setValueAtTime(0.707, noteTime);
      }

      const noteGain = ctx.createGain();
      const baseGain = chordVelocity * 1.0;
      const safeDur = Math.max(0.08, isNaN(durationSeconds) ? 1.2 : durationSeconds);
      const isStaccato = safeDur <= 0.20;
      const releaseTime = noteTime + safeDur;

      if (isStaccato) {
        // Articulación Staccato percusiva con release rápido (Funk / staccato limpio)
        noteGain.gain.setValueAtTime(0.0001, noteTime);
        noteGain.gain.linearRampToValueAtTime(baseGain, noteTime + 0.006);
        noteGain.gain.setValueAtTime(baseGain * 0.70, Math.max(noteTime + 0.01, releaseTime));
        noteGain.gain.exponentialRampToValueAtTime(0.0001, Math.max(noteTime + 0.025, releaseTime + 0.018));
      } else {
        const fadeOutLen = Math.min(0.06, Math.max(0.015, safeDur * 0.08));
        const sustainEnd = Math.max(noteTime + 0.025, releaseTime - fadeOutLen);

        noteGain.gain.setValueAtTime(0.0001, noteTime);
        noteGain.gain.linearRampToValueAtTime(baseGain, noteTime + 0.012);
        if (sustainEnd > noteTime + 0.08) {
          noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, baseGain * 0.68), noteTime + Math.min(0.25, (sustainEnd - noteTime) * 0.5));
        }
        noteGain.gain.setValueAtTime(Math.max(0.001, baseGain * 0.62), sustainEnd);
        noteGain.gain.linearRampToValueAtTime(0.0001, Math.max(sustainEnd + 0.015, releaseTime));
      }

      if (filterNode) {
        source.connect(filterNode);
        filterNode.connect(noteGain);
      } else {
        source.connect(noteGain);
      }

      // Conexión independiente según instrumento: Piano, Rhodes o Guitarra
      const targetInputNode =
        instrument === 'guitar'
          ? this.guitarInputNode
          : instrument === 'epiano'
          ? this.rhodesInputNode
          : this.pianoInputNode;

      noteGain.connect(targetInputNode || this.masterBusGain!);

      const voiceRecord = { source, gainNode: noteGain, stopTime: releaseTime + (isStaccato ? 0.02 : 0.03) };
      this.activeHarmonyVoices.add(voiceRecord);
      this.activeSources.add(source);

      source.start(noteTime);
      source.stop(releaseTime + (isStaccato ? 0.025 : 0.035));

      source.onended = () => {
        this.activeHarmonyVoices.delete(voiceRecord);
        this.activeSources.delete(source);
        try {
          source.disconnect();
          if (filterNode) filterNode.disconnect();
          noteGain.disconnect();
        } catch (e) {}
      };
    });
  }

  // ==========================================
  // LÓGICA DE CONTROL DEL MIXER (FADERS, MUTE Y SOLO)
  // ==========================================

  public isAnyBandaSoloActive(): boolean {
    const { drums, bass, piano, rhodes, guitar } = this.mixerState;
    return Boolean(drums.isSolo || bass.isSolo || piano.isSolo || rhodes.isSolo || guitar.isSolo);
  }

  public isAnySoloActive(): boolean {
    return this.isAnyBandaSoloActive() || this.externalSoloActive;
  }

  public setExternalSoloActive(active: boolean): void {
    const next = Boolean(active);
    if (this.externalSoloActive === next) return;
    this.externalSoloActive = next;
    this.getAudioContext();
    this.applyEffectiveGains();
  }

  public isExternalSoloActive(): boolean {
    return this.externalSoloActive;
  }

  /**
   * Aplica las ganancias efectivas calculadas según el estado de Mute y Solo (incluyendo Solo externo de dawTracks)
   */
  private applyEffectiveGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const rampTime = 0.01; // 10ms setTargetAtTime para evitar clicks y chasquidos al mover faders rápido

    const { drums, bass, piano, rhodes, guitar, masterVolume } = this.mixerState;
    const anySoloActive = this.isAnySoloActive();

    // 1. Ganancia efectiva Batería
    let effectiveDrum = 0;
    if (!drums.isMuted) {
      if (!anySoloActive || drums.isSolo) {
        effectiveDrum = drums.volume;
      }
    }
    if (this.drumFaderGain) {
      this.drumFaderGain.gain.cancelScheduledValues(now);
      this.drumFaderGain.gain.setTargetAtTime(effectiveDrum, now, rampTime);
    }

    // 2. Ganancia efectiva Bajo
    let effectiveBass = 0;
    if (!bass.isMuted) {
      if (!anySoloActive || bass.isSolo) {
        effectiveBass = bass.volume;
      }
    }
    if (this.bassFaderGain) {
      this.bassFaderGain.gain.cancelScheduledValues(now);
      this.bassFaderGain.gain.setTargetAtTime(effectiveBass, now, rampTime);
    }
    if (effectiveBass === 0) {
      this.releaseAllBass(0.015);
    }

    // 3. Ganancia efectiva Piano
    let effectivePiano = 0;
    if (!piano.isMuted) {
      if (!anySoloActive || piano.isSolo) {
        effectivePiano = piano.volume;
      }
    }
    if (this.pianoFaderGain) {
      this.pianoFaderGain.gain.cancelScheduledValues(now);
      this.pianoFaderGain.gain.setTargetAtTime(effectivePiano, now, rampTime);
    }

    // 4. Ganancia efectiva Rhodes
    let effectiveRhodes = 0;
    if (!rhodes.isMuted) {
      if (!anySoloActive || rhodes.isSolo) {
        effectiveRhodes = rhodes.volume;
      }
    }
    if (this.rhodesFaderGain) {
      this.rhodesFaderGain.gain.cancelScheduledValues(now);
      this.rhodesFaderGain.gain.setTargetAtTime(effectiveRhodes, now, rampTime);
    }

    // 5. Ganancia efectiva Guitarra
    let effectiveGuitar = 0;
    if (!guitar.isMuted) {
      if (!anySoloActive || guitar.isSolo) {
        effectiveGuitar = guitar.volume;
      }
    }
    if (this.guitarFaderGain) {
      this.guitarFaderGain.gain.cancelScheduledValues(now);
      this.guitarFaderGain.gain.setTargetAtTime(effectiveGuitar, now, rampTime);
    }

    if (effectivePiano === 0 && effectiveRhodes === 0 && effectiveGuitar === 0) {
      this.releaseAllHarmony(0.015);
    }

    // 6. Master Volume
    if (this.masterBusGain) {
      this.masterBusGain.gain.cancelScheduledValues(now);
      this.masterBusGain.gain.setTargetAtTime(masterVolume, now, rampTime);
    }

    // Notificar observadores de UI
    this.notifyListeners();
  }

  public setChannelVolume(channel: MainMixerChannel, volume: number): void {
    this.getAudioContext();
    this.mixerState[channel].volume = Math.max(0, Math.min(4.5, volume));
    this.applyEffectiveGains();
  }

  public toggleChannelMute(channel: MainMixerChannel): void {
    this.getAudioContext();
    this.mixerState[channel].isMuted = !this.mixerState[channel].isMuted;
    this.applyEffectiveGains();
  }

  public toggleChannelSolo(channel: MainMixerChannel): void {
    this.getAudioContext();
    this.mixerState[channel].isSolo = !this.mixerState[channel].isSolo;
    this.applyEffectiveGains();
  }

  public setMasterVolume(volume: number): void {
    this.getAudioContext();
    this.mixerState.masterVolume = Math.max(0, Math.min(1.5, volume));
    this.applyEffectiveGains();
  }

  // --- MÉTODOS DEL SUB-MIXER DE BATERÍA (DRUM BUS INDEPENDIENTE) ---

  public setDrumPieceVolume(piece: DrumPieceName, volume: number): void {
    this.getAudioContext();
    const clamped = Math.max(0, Math.min(1.5, volume));
    this.mixerState.drumPieces[piece].volume = clamped;
    this.applyDrumPieceGain(piece);
    this.notifyListeners();
  }

  public toggleDrumPieceMute(piece: DrumPieceName): void {
    this.getAudioContext();
    this.mixerState.drumPieces[piece].isMuted = !this.mixerState.drumPieces[piece].isMuted;
    this.applyDrumPieceGain(piece);
    this.notifyListeners();
  }

  /**
   * MÉTODOS DE GANANCIA DIRECTA (CERO RE-RENDERIZADOS DE REACT):
   * Permiten que los faders arrastren a 60/120 FPS actualizando directamente el GainNode con
   * Web Audio API setTargetAtTime, SIN llamar a notifyListeners ni disparar setState en React.
   */
  public setChannelGainDirect(channel: MainMixerChannel, volume: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(0, Math.min(4.5, volume));
    this.mixerState[channel].volume = clamped;

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const anySoloActive = this.isAnySoloActive();

    const targetGain =
      channel === 'drums' ? this.drumFaderGain :
      channel === 'bass' ? this.bassFaderGain :
      channel === 'piano' ? this.pianoFaderGain :
      channel === 'rhodes' ? this.rhodesFaderGain :
      this.guitarFaderGain;

    const channelState = this.mixerState[channel];
    if (targetGain) {
      const effective = (!channelState.isMuted && (!anySoloActive || channelState.isSolo)) ? clamped : 0;
      targetGain.gain.cancelScheduledValues(now);
      targetGain.gain.setTargetAtTime(effective, now, 0.01);
    }
  }

  public setDrumPieceGainDirect(piece: DrumPieceName, volume: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(0, Math.min(1.5, volume));
    this.mixerState.drumPieces[piece].volume = clamped;

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pieceState = this.mixerState.drumPieces[piece];
    const targetGain = pieceState.isMuted ? 0 : clamped;
    const node =
      piece === 'kick' ? this.kickGainNode :
      piece === 'snare' ? this.snareGainNode :
      piece === 'hihat' ? this.hihatGainNode :
      this.rideGainNode;

    if (node) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(targetGain, now, 0.01);
    }
  }

  public setMasterGainDirect(volume: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(0, Math.min(1.5, volume));
    this.mixerState.masterVolume = clamped;
    if (this.masterBusGain && this.ctx) {
      this.masterBusGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterBusGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Compensación de Ganancia por Estilo:
   * Ajusta un multiplicador de ganancia base oculto para equilibrar el volumen percibido entre estilos
   * (ej. Bossa Nova a 0.85, Jazz Swing a 1.0) sin alterar los faders visuales de la consola de mezcla.
   */
  public setStyleBaseGain(multiplier: number): void {
    const clamped = Math.max(0.1, Math.min(2.0, multiplier));
    this.currentStyleGainMultiplier = clamped;
    if (this.styleGainNode && this.ctx) {
      this.styleGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      this.styleGainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  public getStyleBaseGain(): number {
    return this.currentStyleGainMultiplier;
  }

  public setChannelPanDirect(channel: MainMixerChannel, pan: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(-1.0, Math.min(1.0, pan));
    if (this.mixerState[channel]) {
      this.mixerState[channel].pan = clamped;
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let node: StereoPannerNode | null = null;
    if (channel === 'bass') node = this.bassPannerNode;
    else if (channel === 'piano') node = this.pianoPannerNode;
    else if (channel === 'rhodes') node = this.rhodesPannerNode;
    else if (channel === 'guitar') node = this.guitarPannerNode;

    if (node) {
      node.pan.setTargetAtTime(clamped, now, 0.01);
    }
  }

  public setDrumPiecePanDirect(piece: DrumPieceName, pan: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(-1.0, Math.min(1.0, pan));
    if (this.mixerState.drumPieces[piece]) {
      this.mixerState.drumPieces[piece].pan = clamped;
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const node =
      piece === 'kick' ? this.kickPannerNode :
      piece === 'snare' ? this.snarePannerNode :
      piece === 'hihat' ? this.hihatPannerNode :
      this.ridePannerNode;

    if (node) {
      node.pan.setTargetAtTime(clamped, now, 0.01);
    }
  }

  private applyDrumPieceGain(piece: DrumPieceName): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pieceState = this.mixerState.drumPieces[piece];
    const targetGain = pieceState.isMuted ? 0 : pieceState.volume;
    const node =
      piece === 'kick' ? this.kickGainNode :
      piece === 'snare' ? this.snareGainNode :
      piece === 'hihat' ? this.hihatGainNode :
      this.rideGainNode;

    if (node) {
      node.gain.setTargetAtTime(targetGain, now, 0.01);
    }
  }

  public getMixerState(): MixerState {
    return {
      drums: { ...this.mixerState.drums },
      drumPieces: {
        kick: { ...this.mixerState.drumPieces.kick },
        snare: { ...this.mixerState.drumPieces.snare },
        hihat: { ...this.mixerState.drumPieces.hihat },
        ride: { ...this.mixerState.drumPieces.ride },
      },
      bass: { ...this.mixerState.bass },
      piano: { ...this.mixerState.piano },
      rhodes: { ...this.mixerState.rhodes },
      guitar: { ...this.mixerState.guitar },
      masterVolume: this.mixerState.masterVolume,
      roomReverbWet: this.mixerState.roomReverbWet ?? 0.28,
      metronomeActive: this.mixerState.metronomeActive,
    };
  }

  /**
   * Ajusta el nivel de retorno general del Room Reverb (Wet level) en tiempo real
   * @param wet Nivel entre 0.0 (totalmente seco) y 1.0 (100% wet)
   */
  public setRoomReverbWetDirect(wet: number): void {
    if (!this.ctx) this.getAudioContext();
    const clamped = Math.max(0, Math.min(1.0, wet));
    this.mixerState.roomReverbWet = clamped;
    if (this.reverbReturnGain && this.ctx) {
      this.reverbReturnGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
  }

  public getRoomReverbWet(): number {
    return this.mixerState.roomReverbWet ?? 0.28;
  }

  public isMetronomeActive(): boolean {
    return this.mixerState.metronomeActive;
  }

  public toggleMetronomeActive(): boolean {
    this.mixerState.metronomeActive = !this.mixerState.metronomeActive;
    this.notifyListeners();
    return this.mixerState.metronomeActive;
  }

  public setMetronomeActive(active: boolean): void {
    this.mixerState.metronomeActive = active;
    this.notifyListeners();
  }

  /**
   * Determina si la pista de Batería (Drum Machine) está sonando en la mezcla actual.
   * Se utiliza para aplicar la regla de exclusión mutua: si la batería suena, el metrónomo se silencia.
   */
  public isDrumTrackAudible(): boolean {
    const { drums, drumPieces } = this.mixerState;
    if (drums.isMuted) return false;
    if (drums.volume <= 0.01) return false;
    const anyPieceAudible = Object.values(drumPieces).some(p => !p.isMuted && p.volume > 0.01);
    if (!anyPieceAudible) return false;
    const anySoloActive = this.isAnySoloActive();
    if (anySoloActive && !drums.isSolo) return false;
    return true;
  }

  private meterSampleArray = new Uint8Array(128);

  /**
   * Extrae el pico de amplitud instantáneo (0.0 a 1.0) desde el AnalyserNode de cada canal
   * para alimentar los medidores LED (VU Meters) en tiempo real.
   */
  public getChannelPeak(channel: 'master' | 'drums' | 'bass' | 'piano' | 'rhodes' | 'guitar' | 'kick' | 'snare' | 'hihat' | 'ride'): number {
    const node =
      channel === 'master' ? this.masterAnalyser :
      channel === 'drums' ? this.drumAnalyser :
      channel === 'bass' ? this.bassAnalyser :
      channel === 'piano' ? this.pianoAnalyser :
      channel === 'rhodes' ? this.rhodesAnalyser :
      channel === 'guitar' ? this.guitarAnalyser :
      channel === 'kick' ? this.kickAnalyser :
      channel === 'snare' ? this.snareAnalyser :
      channel === 'hihat' ? this.hihatAnalyser :
      this.rideAnalyser;

    if (!node) return 0;

    node.getByteTimeDomainData(this.meterSampleArray);
    let maxDev = 0;
    for (let i = 0; i < this.meterSampleArray.length; i++) {
      const dev = Math.abs(this.meterSampleArray[i] - 128);
      if (dev > maxDev) maxDev = dev;
    }
    return Math.min(1.0, maxDev / 128);
  }

  public getAllChannelPeaks(): Record<string, number> {
    return {
      master: this.getChannelPeak('master'),
      drums: this.getChannelPeak('drums'),
      bass: this.getChannelPeak('bass'),
      piano: this.getChannelPeak('piano'),
      rhodes: this.getChannelPeak('rhodes'),
      guitar: this.getChannelPeak('guitar'),
      kick: this.getChannelPeak('kick'),
      snare: this.getChannelPeak('snare'),
      hihat: this.getChannelPeak('hihat'),
      ride: this.getChannelPeak('ride'),
    };
  }

  public subscribe(listener: (state: MixerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getMixerState());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const current = this.getMixerState();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (e) {}
    });
  }

  /**
   * Detiene inmediatamente todas las notas activas
   */
  public stopAll(): void {
    this.activeHarmonyVoices.clear();
    this.activeBassVoices.clear();
    this.activeSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    this.activeSources.clear();
    this.lastRideScheduledTime = -1;
  }

  // ==========================================
  // GENERADORES DE BUFFERS PCM ACÚSTICOS OFFLINE
  // (Garantizan que SIEMPRE exista un AudioBufferSourceNode real sin osciladores)
  // ==========================================

  private generateAcousticDrumPCMBuffer(ctx: AudioContext, type: DrumSampleName): AudioBuffer {
    const rate = ctx.sampleRate;
    const length =
      type === 'kick' ? Math.floor(rate * 0.45) :
      type === 'ride' ? Math.floor(rate * 1.4) :
      type === 'hihat_open' ? Math.floor(rate * 0.65) :
      Math.floor(rate * 0.35);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let sample = 0;

      if (type === 'kick') {
        const pitchEnv = 48 + 95 * Math.exp(-t * 36);
        const phase = 2 * Math.PI * (48 * t - (95 / 36) * (Math.exp(-t * 36) - 1));
        const body = Math.sin(phase) * Math.exp(-t * 9.5);
        const click = (Math.random() * 2 - 1) * Math.exp(-t * 450) * 0.35;
        sample = (body * 1.1 + click) * 0.95;
      } else if (type === 'snare') {
        const tone = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 22) * 0.6;
        const wires = (Math.random() * 2 - 1) * Math.exp(-t * 16) * 0.55;
        sample = (tone + wires) * 0.9;
      } else if (type === 'hihat' || type === 'hihat_closed') {
        const metal = (Math.random() * 2 - 1) * Math.exp(-t * 65) * 0.7;
        sample = metal;
      } else if (type === 'hihat_open') {
        const metal = (Math.random() * 2 - 1) * Math.exp(-t * 7.5) * 0.75;
        sample = metal;
      } else if (type === 'ride') {
        // Platillo Ride de Jazz Acústico: Ping de punta de baqueta (@ 4.2kHz) + resonancia modal inarmónica de bronce + estela de brillo
        const ping = Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 85) * 0.45;
        const stick = (Math.random() * 2 - 1) * Math.exp(-t * 160) * 0.35;
        // Parciales inarmónicos de bronce turco (sin tonos tipo cencerro)
        const bronze = (
          Math.sin(2 * Math.PI * 2150 * t) * 0.22 * Math.exp(-t * 2.2) +
          Math.sin(2 * Math.PI * 2980 * t) * 0.25 * Math.exp(-t * 2.3) +
          Math.sin(2 * Math.PI * 3740 * t) * 0.30 * Math.exp(-t * 2.4) +
          Math.sin(2 * Math.PI * 5540 * t) * 0.35 * Math.exp(-t * 2.0) +
          Math.sin(2 * Math.PI * 8350 * t) * 0.24 * Math.exp(-t * 1.7)
        ) * 0.35;
        // Brillo y shimmer del aire metálico
        const shimmer = (Math.random() * 2 - 1) * Math.exp(-t * 1.8) * 0.28;
        sample = (ping + stick + bronze + shimmer) * 0.88;
      } else { // rim
        const wood = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 90) * 0.7;
        const click = (Math.random() * 2 - 1) * Math.exp(-t * 350) * 0.4;
        sample = wood + click;
      }

      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }

  private generateAcousticBassPCMBuffer(ctx: AudioContext, midi: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const length = Math.floor(rate * 1.6);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const omega = 2 * Math.PI * freq;
    const decay = Math.max(1.8, 1.2 + freq / 80);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const pluck = (Math.random() * 2 - 1) * Math.exp(-t * 220) * 0.12;
      const fundamental = Math.sin(omega * t) * Math.exp(-t * decay);
      const h2 = Math.sin(omega * 2 * t) * 0.30 * Math.exp(-t * decay * 1.3);
      // Nivel calibrado (~0.42 peak) idéntico al Soundfont FluidR3 GM para evitar picos bruscos de volumen
      const sample = (fundamental * 0.32 + h2 * 0.25 + pluck);
      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }

  private generateAcousticPianoPCMBuffer(ctx: AudioContext, midi: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const length = Math.floor(rate * 2.0);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const omega = 2 * Math.PI * freq;
    const decay = Math.max(1.0, 0.75 + Math.sqrt(freq) * 0.07);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const hammer = Math.sin(2 * Math.PI * 480 * t) * Math.exp(-t * 250) * 0.22;
      const s1 = Math.sin((omega + 0.3) * t);
      const s2 = Math.sin((omega - 0.3) * t);
      const fundamental = (s1 + s2) * 0.5 * Math.exp(-t * decay);
      const p2 = Math.sin(omega * 2 * t) * 0.32 * Math.exp(-t * decay * 1.4);
      const sample = (fundamental * 1.15 + p2 + hammer) * 0.88;
      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }

  private generateAcousticGuitarPCMBuffer(ctx: AudioContext, midi: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const length = Math.floor(rate * 1.5);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const omega = 2 * Math.PI * freq;
    const decay = Math.max(1.6, 1.2 + freq / 180);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const snap = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 250) * 0.32;
      const fundamental = Math.sin(omega * t) * Math.exp(-t * decay);
      const h2 = Math.sin(omega * 2 * t) * 0.35 * Math.exp(-t * decay * 1.5);
      const sample = (fundamental + h2 + snap) * 0.85;
      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }

  private generateAcousticEPianoPCMBuffer(ctx: AudioContext, midi: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const length = Math.floor(rate * 1.8);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const omega = 2 * Math.PI * freq;
    const decay = Math.max(1.1, 0.8 + freq / 350);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const bell = Math.sin(omega * 7 * t) * 0.16 * Math.exp(-t * 22);
      const fundamental = Math.sin(omega * t) * Math.exp(-t * decay);
      const h2 = Math.sin(omega * 2 * t) * 0.22 * Math.exp(-t * decay * 1.5);
      const sample = (fundamental + h2 + bell) * 0.85;
      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }

  private findNearestBuffer(
    bufferMap: Map<number, AudioBuffer>,
    targetMidi: number
  ): { buffer: AudioBuffer; midi: number } | null {
    if (bufferMap.size === 0) return null;
    let bestMidi = -1;
    let minDiff = Infinity;

    for (const [midi] of bufferMap.entries()) {
      const diff = Math.abs(targetMidi - midi);
      if (diff < minDiff) {
        minDiff = diff;
        bestMidi = midi;
      }
    }

    return bestMidi !== -1 ? { buffer: bufferMap.get(bestMidi)!, midi: bestMidi } : null;
  }

  private freqToMidi(freq: number): number {
    if (freq <= 0 || isNaN(freq)) return 60;
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }
}

// Instancia singleton aislada para Análisis Interactivo
export const interactiveAnalysisAudio = new InteractiveAnalysisAudioEngine();

if (typeof window !== 'undefined') {
  interactiveAnalysisAudio.preloadAllWavSamples().catch(() => {});
}

