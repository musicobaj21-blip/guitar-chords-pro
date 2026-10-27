import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { getAudioContext, playChordFrequencies, playMelodyNotes, playWalkingBassNotes, playCompingChords, stopAllPlayback, getRoomReverb, getPlaybackMasterGain } from "../utils/audio";
import { ImportedNote } from "../types";
import { generateWalkingBass, generateComping } from "../utils/band";
import { getChordNotes } from "../utils/music";
import { Play, Square, Plus, Minus, Volume2, SlidersHorizontal, VolumeX, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useInstrument } from "../contexts/InstrumentContext";
import { playAcousticDrum, preloadAcousticDrums } from "../utils/acousticDrums";
import { preloadAcousticInstruments } from "../utils/acousticInstruments";
import { loadSoundfontInstrument } from "../utils/soundfont";
import { interactiveAnalysisAudio, DrumSampleName } from "../utils/interactiveAnalysisAudio";
import {
  DrumStyle,
  detectDrumStyleFromSongStyle,
  getDrumMatrixForBeat,
  getBeatsPerBar,
  getStyleBaseGainMultiplier,
} from "../utils/interactiveRhythmPatterns";
import InteractiveMixer from "./InteractiveMixer";

export type TimeSignature = "4/4" | "3/4" | "6/8" | "12/8" | "2/4" | "5/4" | "7/8";
export type { DrumStyle };

export interface PlaybackChord {
  globalChordIndex: number;
  frequencies: number[];
  beatsLength: number;
  chordString: string;
  globalKey: string;
  parsedRoot: string;
  parsedType: string;
  originalString?: string;
  isSimile?: boolean;
  isEndMarker?: boolean;
  isEndOfPlayback?: boolean;
  originalFlatIndex?: number;
  measureIndex?: number;
}

export interface MetronomeControls {
  start: () => Promise<void>;
  stop: () => void;
  togglePlayback: () => void;
  isPlaying: () => boolean;
}

interface MetronomeProps {
  initialBPM?: number;
  inline?: boolean;
  playbackSequence?: PlaybackChord[];
  getPlaybackSequence?: () => PlaybackChord[];
  songStyle?: string;
  onPlayingIndexChange?: (index: number | null) => void;
  onIsPlayingChange?: (isPlaying: boolean) => void;
  onCycleComplete?: () => void;
  metronomeControlRef?: React.MutableRefObject<MetronomeControls | null>;
  importedMelody?: ImportedNote[];
  timeSignature?: string;
  onTimeSignatureChange?: (sig: TimeSignature) => void;
  drumStyle?: DrumStyle;
  onDrumStyleChange?: (style: DrumStyle) => void;
  selectedMeasureIndex?: number | null;
  isVisible?: boolean;
  dawTracks?: any[];
  updateTrackVolume?: (trackId: string, volume: number) => void;
  toggleTrackMute?: (trackId: string) => void;
  toggleTrackSolo?: (trackId: string) => void;
  updateTrackPan?: (trackId: string, pan: number) => void;
  onUpdateTrackInstrument?: (trackId: string, instrumentId: string) => void;
}

let sharedReverbBuffer: AudioBuffer | null = null;
function getReverbBuffer(ctx: AudioContext) {
  if (sharedReverbBuffer) return sharedReverbBuffer;
  const length = ctx.sampleRate * 1.5;
  sharedReverbBuffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = sharedReverbBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return sharedReverbBuffer;
}

export default function Metronome({
  initialBPM = 120,
  inline = false,
  playbackSequence,
  getPlaybackSequence,
  songStyle,
  onPlayingIndexChange,
  onIsPlayingChange,
  onCycleComplete,
  metronomeControlRef,
  importedMelody,
  timeSignature: propTimeSignature,
  onTimeSignatureChange,
  drumStyle: propDrumStyle,
  onDrumStyleChange,
  selectedMeasureIndex,
  isVisible = true,
  dawTracks,
  updateTrackVolume,
  toggleTrackMute,
  toggleTrackSolo,
  updateTrackPan,
  onUpdateTrackInstrument,
}: MetronomeProps) {
  const { t } = useLanguage();
  const { instrument: globalInstrument } = useInstrument();
  const [bpm, setBpm] = useState(initialBPM);
  const [localBpm, setLocalBpm] = useState<number>(initialBPM);
  const [localBpmInput, setLocalBpmInput] = useState<string>(String(initialBPM));
  const localBpmRef = useRef<number>(initialBPM);
  const bpmRef = useRef(initialBPM);
  const selectedMeasureIndexRef = useRef<number>(selectedMeasureIndex ?? 0);
  const isVisibleRef = useRef<boolean>(isVisible);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    if (typeof selectedMeasureIndex === 'number' && selectedMeasureIndex >= 0) {
      selectedMeasureIndexRef.current = selectedMeasureIndex;
    } else {
      selectedMeasureIndexRef.current = 0;
    }
  }, [selectedMeasureIndex]);

  const isEditingBpmRef = useRef(false);
  const stepDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Limpieza de timer de debounce al desmontar
  useEffect(() => {
    return () => {
      if (stepDebounceTimerRef.current) {
        clearTimeout(stepDebounceTimerRef.current);
      }
    };
  }, []);

  // Sincronizar estados locales cuando initialBPM cambie externamente
  useEffect(() => {
    if (initialBPM && initialBPM !== bpmRef.current) {
      bpmRef.current = initialBPM;
      localBpmRef.current = initialBPM;
      setBpm(initialBPM);
      setLocalBpm(initialBPM);
      setLocalBpmInput(String(initialBPM));
      try {
        Tone.Transport.bpm.value = initialBPM;
      } catch (e) {}
    }
  }, [initialBPM]);

  const [timeSignature, setTimeSignature] = useState<TimeSignature>(() => {
    if (propTimeSignature) {
      return propTimeSignature as TimeSignature;
    }
    return "4/4";
  });
  const [drumStyle, setDrumStyle] = useState<DrumStyle>(() => propDrumStyle || detectDrumStyleFromSongStyle(songStyle));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<number>(-1);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);

  // Sincronizar drumStyle cuando cambie por prop
  useEffect(() => {
    if (propDrumStyle && propDrumStyle !== drumStyle) {
      setDrumStyle(propDrumStyle);
    }
  }, [propDrumStyle]);

  // Manejador global para abrir/cerrar modal del Mixer y tecla Escape
  useEffect(() => {
    const handleOpenMixer = () => setIsMixerOpen(true);
    const handleCloseMixer = () => setIsMixerOpen(false);
    window.addEventListener("open-mixer-modal", handleOpenMixer);
    window.addEventListener("close-mixer-modal", handleCloseMixer);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMixerOpen) {
        setIsMixerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("open-mixer-modal", handleOpenMixer);
      window.removeEventListener("close-mixer-modal", handleCloseMixer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMixerOpen]);

  const onDrumStyleChangeRef = useRef(onDrumStyleChange);
  useEffect(() => {
    onDrumStyleChangeRef.current = onDrumStyleChange;
  }, [onDrumStyleChange]);

  // Sincronizar estilo rítmico recibido desde eventos globales (ej. teclado MIDI o barra de acceso rápido)
  useEffect(() => {
    const handleGlobalDrumStyle = (e: any) => {
      if (e.detail && e.detail !== drumStyleRef.current) {
        setDrumStyle(e.detail);
        drumStyleRef.current = e.detail;
        const baseGain = getStyleBaseGainMultiplier(e.detail);
        interactiveAnalysisAudio.setStyleBaseGain(baseGain);
        if (onDrumStyleChangeRef.current) {
          onDrumStyleChangeRef.current(e.detail);
        }
      }
    };
    window.addEventListener("change-drum-style", handleGlobalDrumStyle);
    window.addEventListener("drum-style-changed", handleGlobalDrumStyle);
    return () => {
      window.removeEventListener("change-drum-style", handleGlobalDrumStyle);
      window.removeEventListener("drum-style-changed", handleGlobalDrumStyle);
    };
  }, []);

  // Harmonic Instrument Selector (Piano, Guitarra, Rhodes) - Piano por defecto
  const [harmonicInstrument, setHarmonicInstrument] = useState<'piano' | 'guitar' | 'epiano'>('piano');

  // Audio refs for high-precision scheduler
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const isCountingInRef = useRef(false);
  const countInBeatRef = useRef(0);
  const countInEndTimeRef = useRef(0);
  const countInStartBarRef = useRef<number>(1.0);
  const countInStartMeasureRef = useRef<number>(0);
  const startSessionIdRef = useRef(0);
  const clickSynthRef = useRef<Tone.MembraneSynth | null>(null);
  const timeSignatureRef = useRef(timeSignature);
  const drumStyleRef = useRef(drumStyle);
  const nextBeatTimeRef = useRef(0.0);
  const currentBeatInMeasureRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const visualQueueRef = useRef<{
    time: number;
    beat: number;
    chordIndex: number | null;
    isCountingInBeat: boolean;
    measureIndex?: number;
    beatsPerMeasure?: number;
  }[]>([]);

  // Harmonic instrument ref
  const harmonicInstrumentRef = useRef(harmonicInstrument);

  const playbackSequenceRef = useRef(playbackSequence);
  const getPlaybackSequenceRef = useRef(getPlaybackSequence);
  useEffect(() => {
    getPlaybackSequenceRef.current = getPlaybackSequence;
  }, [getPlaybackSequence]);

  const currentChordIdxRef = useRef(0);
  const beatsElapsedForCurrentChordRef = useRef(0);
  const globalBeatCountRef = useRef(0);
  const importedMelodyRef = useRef(importedMelody);
  useEffect(() => { importedMelodyRef.current = importedMelody; }, [importedMelody]);

  const onCycleCompleteRef = useRef(onCycleComplete);
  useEffect(() => {
    onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  const onIsPlayingChangeRef = useRef(onIsPlayingChange);
  useEffect(() => {
    onIsPlayingChangeRef.current = onIsPlayingChange;
  }, [onIsPlayingChange]);

  useEffect(() => {
    if (metronomeControlRef) {
      metronomeControlRef.current = {
        start: startMetronome,
        stop: stopMetronome,
        togglePlayback: () => {
          if (isPlayingRef.current) {
            stopMetronome();
          } else {
            startMetronome();
          }
        },
        isPlaying: () => isPlayingRef.current,
      };
    }
  });

  useEffect(() => {
    bpmRef.current = bpm;
    try {
      Tone.Transport.bpm.value = bpm;
    } catch (e) {}
  }, [bpm]);

  const onTimeSignatureChangeRef = useRef(onTimeSignatureChange);
  useEffect(() => {
    onTimeSignatureChangeRef.current = onTimeSignatureChange;
  }, [onTimeSignatureChange]);

  // Sincronizar BPM y Métrica desde eventos globales (ej. GlobalMidiKeyboard)
  useEffect(() => {
    const handleGlobalBpmChange = (e: any) => {
      if (typeof e.detail === 'number' && !isNaN(e.detail)) {
        const next = Math.max(40, Math.min(240, Math.round(e.detail)));
        if (next !== bpmRef.current) {
          bpmRef.current = next;
          localBpmRef.current = next;
          setBpm(next);
          setLocalBpm(next);
          setLocalBpmInput(String(next));
          try {
            Tone.Transport.bpm.value = next;
          } catch (err) {}
        }
      }
    };
    const handleGlobalSigChange = (e: any) => {
      if (e.detail && typeof e.detail === 'string' && e.detail !== timeSignatureRef.current) {
        const sig = e.detail as TimeSignature;
        setTimeSignature(sig);
        timeSignatureRef.current = sig;
        const bpb = getBeatsPerBar(sig);
        currentBeatInMeasureRef.current = currentBeatInMeasureRef.current % bpb;
        if (onTimeSignatureChangeRef.current) {
          onTimeSignatureChangeRef.current(sig);
        }
      }
    };
    window.addEventListener("change-bpm", handleGlobalBpmChange);
    window.addEventListener("bpm-changed", handleGlobalBpmChange);
    window.addEventListener("change-time-signature", handleGlobalSigChange);
    window.addEventListener("time-signature-changed", handleGlobalSigChange);
    return () => {
      window.removeEventListener("change-bpm", handleGlobalBpmChange);
      window.removeEventListener("bpm-changed", handleGlobalBpmChange);
      window.removeEventListener("change-time-signature", handleGlobalSigChange);
      window.removeEventListener("time-signature-changed", handleGlobalSigChange);
    };
  }, []);

  useEffect(() => {
    timeSignatureRef.current = timeSignature;
  }, [timeSignature]);

  useEffect(() => {
    if (propTimeSignature && propTimeSignature !== timeSignature) {
      const validSig = propTimeSignature as TimeSignature;
      setTimeSignature(validSig);
      timeSignatureRef.current = validSig;
      const bpb = getBeatsPerBar(validSig);
      currentBeatInMeasureRef.current = currentBeatInMeasureRef.current % bpb;
    }
  }, [propTimeSignature]);

  useEffect(() => {
    drumStyleRef.current = drumStyle;
    const baseGain = getStyleBaseGainMultiplier(drumStyle);
    interactiveAnalysisAudio.setStyleBaseGain(baseGain);
  }, [drumStyle]);

  // Asignación dinámica del groove de batería según el estilo del estándar seleccionado
  useEffect(() => {
    if (songStyle) {
      const detected = detectDrumStyleFromSongStyle(songStyle);
      setDrumStyle(detected);
      const baseGain = getStyleBaseGainMultiplier(detected);
      interactiveAnalysisAudio.setStyleBaseGain(baseGain);
    }
  }, [songStyle]);

  useEffect(() => { harmonicInstrumentRef.current = harmonicInstrument; }, [harmonicInstrument]);

  // Sync harmonic instrument with global instrument switch (mantener Piano en la carga inicial)
  const isFirstInstrumentMountRef = useRef(true);
  useEffect(() => {
    if (isFirstInstrumentMountRef.current) {
      isFirstInstrumentMountRef.current = false;
      return;
    }
    if (globalInstrument === 'guitar') {
      setHarmonicInstrument('guitar');
    } else if (globalInstrument === 'epiano') {
      setHarmonicInstrument('epiano');
    } else {
      setHarmonicInstrument('piano');
    }
  }, [globalInstrument]);

  useEffect(() => {
    playbackSequenceRef.current = playbackSequence;
    if (!isPlaying) {
      currentChordIdxRef.current = 0;
      beatsElapsedForCurrentChordRef.current = 0;
    }
  }, [playbackSequence, isPlaying]);

  // Preload real acoustic drum WAVs and instruments on mount
  useEffect(() => {
    preloadAcousticDrums();
    preloadAcousticInstruments();
    loadSoundfontInstrument('piano');
    loadSoundfontInstrument('guitar');
    loadSoundfontInstrument('bass');
    loadSoundfontInstrument('epiano');
    return () => {
      stopMetronome();
      if (clickSynthRef.current) {
        try {
          clickSynthRef.current.dispose();
        } catch (_) {}
        clickSynthRef.current = null;
      }
      const ctx = interactiveAnalysisAudio.getAudioContext();
      if (ctx && ctx.state === "running") {
        ctx.suspend().catch(() => {});
      }
    };
  }, []);

  const getBeatsPerMeasure = (sig: string = "4/4"): number => {
    const num = parseInt(sig.split("/")[0], 10);
    return !isNaN(num) && num > 0 ? num : getBeatsPerBar(sig);
  };

  const getStepDuration = (sig: string = "4/4", currentBpm: number = 120): number => {
    const denominator = sig.split("/")[1]?.trim();
    const quarterDuration = 60.0 / Math.max(20, currentBpm);
    return denominator === "8" ? quarterDuration / 2.0 : quarterDuration;
  };

  const getMetronomeAccentLevel = (beatIndex: number, sig: string = "4/4"): "strong" | "medium" | "weak" => {
    if (beatIndex === 0) return "strong";
    const [numStr, denStr] = sig.split("/").map((s) => s.trim());
    const num = parseInt(numStr, 10);
    if (denStr === "8") {
      if (num === 6 && beatIndex === 3) return "medium";
      if (num === 12 && (beatIndex === 3 || beatIndex === 6 || beatIndex === 9)) return "medium";
      if (num === 7 && (beatIndex === 2 || beatIndex === 4)) return "medium";
      if (num === 9 && (beatIndex === 3 || beatIndex === 6)) return "medium";
      if (num === 5 && beatIndex === 3) return "medium";
    }
    return "weak";
  };

  const playClickSound = (time: number, accentLevel: "strong" | "medium" | "weak" | boolean, vol: number = 1.0) => {
    const level = typeof accentLevel === "boolean" ? (accentLevel ? "strong" : "weak") : accentLevel;
    const gain = level === "strong" ? 0.95 : level === "medium" ? 0.72 : 0.48;
    interactiveAnalysisAudio.playDrumHit("rim", time, gain * vol);
  };

  const playDrumSound = (instrument: DrumSampleName, time: number, vel: number = 1) => {
    interactiveAnalysisAudio.playDrumHit(instrument, time, vel);
  };

  const scheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const lookahead = 0.1; // schedule notes 100ms in advance
    const scheduleIntervalMs = 25; // check every 25ms

    while (nextBeatTimeRef.current < ctx.currentTime + lookahead) {
      const beatsPerMeasure = getBeatsPerMeasure(timeSignatureRef.current);
      const beatNum = currentBeatInMeasureRef.current % beatsPerMeasure;
      const accentLevel = getMetronomeAccentLevel(beatNum, timeSignatureRef.current);

      const pSequence = playbackSequenceRef.current;
      const isCurrentlyCountingIn = false;
      let playingChordIndex: number | null = null;

      // Compute beat/step length in seconds based on BPM and denominator (/8 uses eighth-note duration)
      const secondsPerBeat = getStepDuration(timeSignatureRef.current, bpmRef.current);

      {
        // Check chord playback
        if (pSequence && pSequence.length > 0) {
          if (currentChordIdxRef.current >= pSequence.length) {
            currentChordIdxRef.current = 0; // loop back
          }
          const currentChord = pSequence[currentChordIdxRef.current];
          playingChordIndex = currentChord.originalFlatIndex !== undefined ? currentChord.originalFlatIndex : currentChord.globalChordIndex;

          if (beatsElapsedForCurrentChordRef.current === 0) {
            // Limpiar/liberar voces previas de Armonía y Bajo antes de programar el nuevo acorde para evitar solapamientos y picos
            interactiveAnalysisAudio.releaseAllHarmony(0.02, nextBeatTimeRef.current);
            interactiveAnalysisAudio.releaseAllBass(0.015, nextBeatTimeRef.current);

            // Resolver acorde efectivo: si el compás actual está vacío, heredar el último acorde activo de la secuencia
            let effectiveChord = currentChord;
            if (!effectiveChord.chordString) {
              for (let back = 1; back <= pSequence.length; back++) {
                const prevIdx = (currentChordIdxRef.current - back + pSequence.length) % pSequence.length;
                if (pSequence[prevIdx] && pSequence[prevIdx].chordString) {
                  effectiveChord = {
                    ...currentChord,
                    chordString: pSequence[prevIdx].chordString,
                    frequencies: pSequence[prevIdx].frequencies,
                    parsedRoot: pSequence[prevIdx].parsedRoot,
                    parsedType: pSequence[prevIdx].parsedType,
                  };
                  break;
                }
              }
            }

            // Band-in-a-Box style generation
            let nextChordString: string | null = null;
            if (currentChordIdxRef.current + 1 < pSequence.length) {
              nextChordString = pSequence[currentChordIdxRef.current + 1].chordString || effectiveChord.chordString;
            } else if (pSequence.length > 0) {
              nextChordString = pSequence[0].chordString || effectiveChord.chordString; // loop around
            }

            if (effectiveChord.chordString) {
              const activeStyle = drumStyleRef.current === "Metronome Básico" ? (songStyle || "") : drumStyleRef.current;
              
              // 1. Armonía / Comping (Piano, Guitarra o Rhodes) -> Ruteado al canal con filtro High-Pass @ 140Hz
              // Resuelve acordes completos con tensiones exactas importadas del Diccionario Maestro (getChordNotes)
              const comping = generateComping(
                effectiveChord,
                activeStyle,
                globalBeatCountRef.current,
                harmonicInstrumentRef.current,
                timeSignatureRef.current
              );
              const beatDuration = secondsPerBeat;
              const isFunkStyle = activeStyle.toLowerCase().includes('funk');
              const isReggaeStyle = !activeStyle.toLowerCase().includes('reggaet') && !activeStyle.toLowerCase().includes('reguet') && activeStyle.toLowerCase().includes('reggae');
              comping.forEach((c) => {
                if (!c.freqs || c.freqs.length === 0) return;
                const hitsStart = nextBeatTimeRef.current + c.timeOffset * beatDuration;
                // En Funk y Reggae: duración corta y percusiva (0.09 - 0.14s) para staccato / chop seco
                // En stabs cortos (<= 0.40 beats, ej. Hip Hop stab): duración concisa y con pegada (0.16 - 0.28s)
                const hitsDuration = (isFunkStyle || isReggaeStyle || c.durationBeats <= 0.20)
                  ? Math.min(0.14, Math.max(0.08, c.durationBeats * beatDuration))
                  : (c.durationBeats <= 0.40)
                  ? Math.min(0.28, Math.max(0.16, c.durationBeats * beatDuration))
                  : Math.max(0.25, c.durationBeats * beatDuration);
                interactiveAnalysisAudio.playHarmonyChord(
                  c.freqs,
                  hitsStart,
                  hitsDuration,
                  harmonicInstrumentRef.current
                );
              });
              
              // 2. Contrabajo Acústico (Walking Bass) -> Ruteado al canal de bajo con LPF @ 2.8kHz
              const bassNotes = generateWalkingBass(
                effectiveChord.chordString,
                effectiveChord.beatsLength,
                nextChordString,
                activeStyle,
                globalBeatCountRef.current,
                timeSignatureRef.current
              );
              bassNotes.forEach((n) => {
                if (isNaN(n.freq) || isNaN(n.timeOffset) || isNaN(n.durationBeats)) return;
                const noteStart = nextBeatTimeRef.current + n.timeOffset * beatDuration;
                interactiveAnalysisAudio.playBassNote(
                  n.freq,
                  noteStart,
                  n.durationBeats * (secondsPerBeat / (60.0 / bpmRef.current))
                );
              });
            } else {
              // Fallback directo con resolución de notas completas vía getChordNotes
              let fallbackFreqs = effectiveChord.frequencies;
              if ((!fallbackFreqs || fallbackFreqs.length === 0) && effectiveChord.chordString) {
                const midiNotes = getChordNotes(effectiveChord.chordString, 48);
                fallbackFreqs = midiNotes.map(m => 440 * Math.pow(2, (m - 69) / 12));
              }
              if (fallbackFreqs && fallbackFreqs.length > 0) {
                const chordDuration = Math.max(0.4, effectiveChord.beatsLength * secondsPerBeat);
                interactiveAnalysisAudio.playHarmonyChord(
                  fallbackFreqs,
                  nextBeatTimeRef.current,
                  chordDuration,
                  harmonicInstrumentRef.current
                );
              }
            }

            // Imported Melody playback (if present)
            const currentBeatGlobal = globalBeatCountRef.current;
            const currentChordBeats = currentChord.beatsLength;
            const impMel = importedMelodyRef.current;
            const totalBeats = pSequence.reduce((acc, curr) => acc + curr.beatsLength, 0);
            if (impMel && impMel.length > 0 && totalBeats > 0) {
              const loopedBeatGlobal = currentBeatGlobal % totalBeats;
              const notesForChord = impMel.filter(n => 
                 n.startBeat >= loopedBeatGlobal && 
                 n.startBeat < loopedBeatGlobal + currentChordBeats
              );
              
              if (notesForChord.length > 0) {
                 const mappedMelody = notesForChord.map(n => ({
                    freq: n.freq,
                    timeOffset: n.startBeat - loopedBeatGlobal,
                    durationBeats: n.durationBeats
                 }));
                 playMelodyNotes(mappedMelody, nextBeatTimeRef.current, bpmRef.current);
              }
            }
          }
        }
      }

      // Schedule drum sounds or basic metronome click
      const dStyle = drumStyleRef.current;
      const isDrumPattern = dStyle !== "Metronome Básico";

      if (!isCurrentlyCountingIn && (!isDrumPattern || (interactiveAnalysisAudio.isMetronomeActive() && !interactiveAnalysisAudio.isDrumTrackAudible()))) {
        const notePitch = accentLevel === "strong" ? "G5" : accentLevel === "medium" ? "E5" : "C5";
        const noteVel = accentLevel === "strong" ? 1.0 : accentLevel === "medium" ? 0.72 : 0.48;
        if (clickSynthRef.current) {
          try {
            const toneTime = Tone.now() + Math.max(0, nextBeatTimeRef.current - ctx.currentTime);
            clickSynthRef.current.triggerAttackRelease(notePitch, "32n", toneTime, noteVel);
          } catch (_) {
            playClickSound(nextBeatTimeRef.current, accentLevel);
          }
        } else {
          playClickSound(nextBeatTimeRef.current, accentLevel);
        }
      }

      // Si hay patrón de batería activo, disparar los buffers WAV de Batería Real
      // Mapeo 100% independiente con 4 canales separados: Bombo, Caja, Hi-hat, Ride
      if (isDrumPattern && !isCurrentlyCountingIn) {
        const matrix = getDrumMatrixForBeat(
          dStyle,
          beatNum,
          globalBeatCountRef.current,
          timeSignatureRef.current
        );

        // 1. CANAL BOMBO (kick.wav) - Completamente independiente
        for (const hit of matrix.kick) {
          playDrumSound(hit.instrument, nextBeatTimeRef.current + hit.timeOffset * secondsPerBeat, hit.velocity);
        }

        // 2. CANAL CAJA (snare.wav / rim.wav) - Completamente separado del Ride
        for (const hit of matrix.snare) {
          playDrumSound(hit.instrument, nextBeatTimeRef.current + hit.timeOffset * secondsPerBeat, hit.velocity);
        }

        // 3. CANAL HI-HAT (hihat_closed.wav / hihat_open.wav) - Completamente independiente
        for (const hit of matrix.hihat) {
          playDrumSound(hit.instrument, nextBeatTimeRef.current + hit.timeOffset * secondsPerBeat, hit.velocity);
        }

        // 4. CANAL PLATILLO RIDE (ride.wav) - Completamente separado de la Caja
        for (const hit of matrix.ride) {
          playDrumSound(hit.instrument, nextBeatTimeRef.current + hit.timeOffset * secondsPerBeat, hit.velocity);
        }
      }

      // Queue visual beat event
      const currentChordForVisual = (pSequence && pSequence.length > 0 && currentChordIdxRef.current < pSequence.length)
        ? pSequence[currentChordIdxRef.current]
        : null;
      const measureIdxForVisual = currentChordForVisual ? (currentChordForVisual.measureIndex ?? 0) : 0;

      visualQueueRef.current.push({
        time: nextBeatTimeRef.current,
        beat: beatNum,
        chordIndex: playingChordIndex,
        isCountingInBeat: isCurrentlyCountingIn,
        measureIndex: measureIdxForVisual,
        beatsPerMeasure: beatsPerMeasure
      });

      nextBeatTimeRef.current += secondsPerBeat;

      // Advance to next beat in measure
      currentBeatInMeasureRef.current = (beatNum + 1) % beatsPerMeasure;

      // Advance sequence logic ONLY if not counting in
      if (!isCurrentlyCountingIn) {
        if (pSequence && pSequence.length > 0) {
          const currentChord = pSequence[currentChordIdxRef.current];
          beatsElapsedForCurrentChordRef.current += 1;
          if (beatsElapsedForCurrentChordRef.current >= currentChord.beatsLength) {
            beatsElapsedForCurrentChordRef.current = 0;

            // Marcador END: Si terminan los tiempos del acorde final, terminar la reproducción
            if (currentChord.isEndOfPlayback) {
              stopMetronome();
              return;
            }

            const nextIdx = (currentChordIdxRef.current + 1) % pSequence.length;
            if (nextIdx === 0 && onCycleCompleteRef.current) {
              onCycleCompleteRef.current();
            }
            currentChordIdxRef.current = nextIdx;
          }
        }
        globalBeatCountRef.current += 1;
      }
    }

    // Call scheduler again in 25ms
    if (isPlayingRef.current) {
      timerIdRef.current = window.setTimeout(scheduler, scheduleIntervalMs);
    }
  };

  // RAF loop to synchronize dynamic visual flashing perfectly with Web Audio execution context
  const updateVisuals = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const currentTime = ctx.currentTime;

    if (isCountingInRef.current) {
      if (currentTime < countInEndTimeRef.current) {
        let countInBeatUpdated = -1;
        while (
          visualQueueRef.current.length > 0 &&
          visualQueueRef.current[0].isCountingInBeat &&
          visualQueueRef.current[0].time <= currentTime
        ) {
          const top = visualQueueRef.current.shift()!;
          countInBeatUpdated = top.beat;
        }
        if (countInBeatUpdated !== -1 && isVisibleRef.current) {
          setCurrentBeat(countInBeatUpdated);
        }
        if (isPlayingRef.current) {
          animationFrameIdRef.current = requestAnimationFrame(updateVisuals);
        }
        return;
      }
      isCountingInRef.current = false;
      (window as any).__linusCountInEndAudioTime = 0;
      setIsCountingIn(false);
      const btnEl = document.getElementById("metronome-toggle-btn");
      if (btnEl) {
        btnEl.setAttribute("data-counting-in", "false");
      }
      window.dispatchEvent(new CustomEvent('linus-transport-position', {
        detail: {
          bar: countInStartBarRef.current || 1.0,
          measureIndex: countInStartMeasureRef.current || 0,
          beat: 0,
          isPlaying: true,
          isCountingIn: false
        }
      }));
    }

    let activeBeat = currentBeat;
    let activeChordIndex: number | null = null;
    let activeIsCountingIn = isCountingIn;
    let activeMeasureIndex = 0;
    let activeBeatsPerMeasure = getBeatsPerMeasure(timeSignatureRef.current);
    let advanced = false;

    while (visualQueueRef.current.length > 0 && visualQueueRef.current[0].time <= currentTime) {
      const top = visualQueueRef.current[0];
      activeBeat = top.beat;
      activeChordIndex = top.chordIndex;
      activeIsCountingIn = top.isCountingInBeat;
      activeMeasureIndex = top.measureIndex ?? 0;
      activeBeatsPerMeasure = top.beatsPerMeasure ?? getBeatsPerMeasure(timeSignatureRef.current);
      visualQueueRef.current.shift();
      advanced = true;
    }

    if (advanced && isVisibleRef.current && activeBeat !== currentBeat && activeBeat !== -1) {
      setCurrentBeat(activeBeat);
    }
    
    if (advanced && isVisibleRef.current && activeIsCountingIn !== isCountingIn) {
      setIsCountingIn(activeIsCountingIn);
    }
    
    if (advanced && onPlayingIndexChange && isVisibleRef.current) {
      onPlayingIndexChange(activeChordIndex);
    }

    if (advanced && !activeIsCountingIn) {
      const bpb = activeBeatsPerMeasure || getBeatsPerMeasure(timeSignatureRef.current);
      const barPosition = (activeMeasureIndex ?? 0) + 1 + ((activeBeat ?? 0) / bpb);
      const secondsPerBeatCur = getStepDuration(timeSignatureRef.current, bpmRef.current);
      (window as any).__linusSeekMeasureIndex = activeMeasureIndex ?? 0;
      (window as any).__linusSeekTargetSeconds = Math.max(0, (barPosition - 1.0) * bpb * secondsPerBeatCur);
      window.dispatchEvent(new CustomEvent('linus-transport-position', {
        detail: {
          bar: barPosition,
          measureIndex: activeMeasureIndex,
          beat: activeBeat,
          isPlaying: true,
          isCountingIn: false
        }
      }));
    }

    if (isPlayingRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(updateVisuals);
    }
  };

  const startMetronome = async () => {
    try {
      const sessionId = ++startSessionIdRef.current;

      // Leer la posición actual del reloj/cabezal ANTES de detener o esperar promesas
      const beatsPerMeasureInitial = getBeatsPerMeasure(timeSignatureRef.current);
      const secondsPerBeatInitial = getStepDuration(timeSignatureRef.current, bpmRef.current);
      const secondsPerBarInitial = secondsPerBeatInitial * beatsPerMeasureInitial;
      const startMeasureIndex =
        typeof (window as any).__linusSeekMeasureIndex === "number"
          ? Math.max(0, (window as any).__linusSeekMeasureIndex)
          : typeof selectedMeasureIndexRef.current === "number" && selectedMeasureIndexRef.current >= 0
          ? selectedMeasureIndexRef.current
          : Math.max(0, Math.round((Tone.Transport.seconds || 0) / secondsPerBarInitial));
      const startTransportSeconds = Math.max(0, startMeasureIndex * secondsPerBarInitial);
      const startBar = startMeasureIndex + 1.0;

      (window as any).__linusSeekMeasureIndex = startMeasureIndex;
      (window as any).__linusSeekTargetSeconds = startTransportSeconds;

      countInStartBarRef.current = startBar;
      countInStartMeasureRef.current = startMeasureIndex;

      try {
        Tone.Transport.pause();
        Tone.Transport.cancel(0);
        Tone.Transport.seconds = startTransportSeconds;
      } catch (_) {}

      const isMetronomeEnabledInitial =
        interactiveAnalysisAudio.isMetronomeActive() ||
        drumStyleRef.current === "Metronome Básico";

      isCountingInRef.current = isMetronomeEnabledInitial;
      setIsCountingIn(isMetronomeEnabledInitial);
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (onIsPlayingChangeRef.current) {
        onIsPlayingChangeRef.current(true);
      }
      countInBeatRef.current = 0;

      const btnEl = document.getElementById("metronome-toggle-btn");
      if (btnEl) {
        btnEl.setAttribute("data-playing", "true");
        btnEl.setAttribute("data-counting-in", isMetronomeEnabledInitial ? "true" : "false");
      }

      // Posicionar y congelar inmediatamente el cabezal visual (Playhead) en el compás seleccionado (ej. compás 1 o compás 12)
      window.dispatchEvent(new CustomEvent('linus-transport-position', {
        detail: {
          bar: startBar,
          measureIndex: startMeasureIndex,
          beat: 0,
          isPlaying: true,
          isCountingIn: isMetronomeEnabledInitial
        }
      }));

      // Prevenir múltiples bucles concurrentes de scheduling
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      // Limpiar voces activas previas antes de iniciar
      interactiveAnalysisAudio.stopAll();

      const ctx = interactiveAnalysisAudio.getAudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      // Garantizar que ride.wav y demás muestras WAV estén 100% decodificadas antes del primer pulso
      await interactiveAnalysisAudio.preloadAllWavSamples();

      // Si otra llamada a startMetronome o stopMetronome ocurrió durante el await, abortar esta instancia
      if (sessionId !== startSessionIdRef.current) return;

      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      // Si se proveyó getPlaybackSequence, desenrollar y refrescar la secuencia lineal exacta al presionar Play
      if (getPlaybackSequenceRef.current) {
        const fresh = getPlaybackSequenceRef.current();
        if (fresh && fresh.length > 0) {
          playbackSequenceRef.current = fresh;
        }
      }

      currentBeatInMeasureRef.current = 0;
      beatsElapsedForCurrentChordRef.current = 0;
      globalBeatCountRef.current = startMeasureIndex * beatsPerMeasureInitial;

      if (playbackSequenceRef.current && playbackSequenceRef.current.length > 0) {
        const exactIdx = playbackSequenceRef.current.findIndex(
          (c, idx) => (c.measureIndex ?? idx) === startMeasureIndex
        );
        currentChordIdxRef.current = exactIdx !== -1
          ? exactIdx
          : Math.min(startMeasureIndex, playbackSequenceRef.current.length - 1);
      } else {
        currentChordIdxRef.current = 0;
      }

      visualQueueRef.current = [];
      setCurrentBeat(-1);
      if (onPlayingIndexChange) {
        onPlayingIndexChange(null);
      }

      try {
        if (Tone.context.state !== "running") {
          await Tone.start();
        }
        if (sessionId !== startSessionIdRef.current) return;

        // Actualizar BPM y posicionar el Transport en el segundo exacto del compás seleccionado
        Tone.Transport.bpm.value = bpmRef.current;
        Tone.Transport.pause();
        Tone.Transport.seconds = startTransportSeconds;

        // Sintetizador exclusivo y percusivo para el click del Metrónomo
        if (!clickSynthRef.current) {
          clickSynthRef.current = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 2,
            envelope: {
              attack: 0.001,
              decay: 0.045,
              sustain: 0,
              release: 0.01,
            },
            volume: -4,
          }).toDestination();
        }

        const isMetronomeEnabled =
          interactiveAnalysisAudio.isMetronomeActive() ||
          drumStyleRef.current === "Metronome Básico";

        const now = Tone.now();
        const beatsPerBar = parseInt(timeSignatureRef.current.split("/")[0], 10) || 4;
        const stepDuration = getStepDuration(timeSignatureRef.current, bpmRef.current);

        if (isMetronomeEnabled) {
          isCountingInRef.current = true;
          setIsCountingIn(true);
          countInEndTimeRef.current = ctx.currentTime + stepDuration * beatsPerBar;
          (window as any).__linusCountInEndAudioTime = countInEndTimeRef.current;

          window.dispatchEvent(new CustomEvent('linus-transport-position', {
            detail: {
              bar: startBar,
              measureIndex: startMeasureIndex,
              beat: 0,
              isPlaying: true,
              isCountingIn: true
            }
          }));

          // 1. Programar dinámicamente los clicks del compás de Count-in según timeSignature
          for (let i = 0; i < beatsPerBar; i++) {
            const accentLevel = getMetronomeAccentLevel(i, timeSignatureRef.current);
            const notePitch = accentLevel === "strong" ? "G5" : accentLevel === "medium" ? "E5" : "C5";
            const noteVel = accentLevel === "strong" ? 1.0 : accentLevel === "medium" ? 0.72 : 0.48;
            clickSynthRef.current.triggerAttackRelease(notePitch, "32n", now + stepDuration * i, noteVel);
            visualQueueRef.current.push({
              time: ctx.currentTime + stepDuration * i,
              beat: i,
              chordIndex: null,
              isCountingInBeat: true,
              measureIndex: startMeasureIndex,
              beatsPerMeasure: beatsPerBar
            });
          }

          // 2. Programar el arranque del Transporte EXACTAMENTE al finalizar el compás de Count-in
          Tone.Transport.start(now + stepDuration * beatsPerBar, startTransportSeconds);

          // Sincronizar la entrada de la Banda Linus exactamente al finalizar el compás de Count-in
          nextBeatTimeRef.current = ctx.currentTime + stepDuration * beatsPerBar;
        } else {
          // SI el metrónomo está APAGADO: El transporte arranca de inmediato desde el compás seleccionado
          isCountingInRef.current = false;
          setIsCountingIn(false);
          countInEndTimeRef.current = 0;
          (window as any).__linusCountInEndAudioTime = 0;
          Tone.Transport.start(now, startTransportSeconds);
          nextBeatTimeRef.current = ctx.currentTime + 0.02;
        }
      } catch (toneErr) {
        console.warn("[Tone.Transport] Error iniciando transport:", toneErr);
        isCountingInRef.current = false;
        setIsCountingIn(false);
        (window as any).__linusCountInEndAudioTime = 0;
        nextBeatTimeRef.current = ctx.currentTime + 0.02;
      }

      scheduler();
      animationFrameIdRef.current = requestAnimationFrame(updateVisuals);
    } catch (err) {
      console.warn("Failed to launch metronome context", err);
    }
  };

  const stopMetronome = () => {
    startSessionIdRef.current += 1;
    const wasCountingIn = isCountingInRef.current;
    (window as any).__linusCountInEndAudioTime = 0;
    const btnEl = document.getElementById("metronome-toggle-btn");
    if (btnEl) {
      btnEl.setAttribute("data-playing", "false");
      btnEl.setAttribute("data-counting-in", "false");
    }
    window.dispatchEvent(new CustomEvent('master-rec-stop'));

    const bpbStop = getBeatsPerMeasure(timeSignatureRef.current);
    const secPerBarStop = getStepDuration(timeSignatureRef.current, bpmRef.current) * bpbStop;
    const currentSecOnStop = wasCountingIn
      ? Math.max(0, ((countInStartBarRef.current || 1.0) - 1.0) * secPerBarStop)
      : Math.max(0, Tone.Transport.seconds || 0);
    const currentBarOnStop = wasCountingIn
      ? (countInStartBarRef.current || 1.0)
      : (1.0 + (currentSecOnStop / secPerBarStop));
    const currentMeasureOnStop = Math.max(0, Math.floor(currentBarOnStop - 1.0));

    setIsPlaying(false);
    isPlayingRef.current = false;
    if (onIsPlayingChangeRef.current) {
      onIsPlayingChangeRef.current(false);
    }
    setIsCountingIn(false);
    isCountingInRef.current = false;
    countInEndTimeRef.current = 0;
    setCurrentBeat(-1);
    if (onPlayingIndexChange) {
      onPlayingIndexChange(null);
    }
    stopAllPlayback();
    interactiveAnalysisAudio.stopAll();

    window.dispatchEvent(new CustomEvent('linus-transport-position', {
      detail: {
        bar: currentBarOnStop,
        measureIndex: currentMeasureOnStop,
        beat: 0,
        isPlaying: false,
        isCountingIn: false
      }
    }));

    try {
      if (clickSynthRef.current) {
        clickSynthRef.current.triggerRelease();
        clickSynthRef.current.dispose();
        clickSynthRef.current = null;
      }
      Tone.Transport.pause();
      Tone.Transport.cancel(0);
      Tone.Transport.seconds = currentSecOnStop;
    } catch (toneErr) {
      console.warn("[Tone.Transport] Error deteniendo transport:", toneErr);
    }

    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  };

  // Escuchar evento global de parada y evento de posicionamiento por compás (Scrubbing / Seek)
  useEffect(() => {
    const handleGlobalStop = () => {
      stopMetronome();
    };
    const handleSeekMeasure = (e: any) => {
      const mIdx = e?.detail?.measureIndex;
      const targetSec = e?.detail?.targetSeconds;
      const flatIdx = e?.detail?.flatIndex;
      if (typeof mIdx === "number" && mIdx >= 0) {
        const bpb = getBeatsPerMeasure(timeSignatureRef.current);
        const secondsPerBeatCur = getStepDuration(timeSignatureRef.current, bpmRef.current);
        const effectiveTargetSec =
          typeof targetSec === "number" && !isNaN(targetSec)
            ? Math.max(0, targetSec)
            : Math.max(0, mIdx * bpb * secondsPerBeatCur);

        selectedMeasureIndexRef.current = mIdx;
        countInStartMeasureRef.current = mIdx;
        countInStartBarRef.current = mIdx + 1.0;
        (window as any).__linusSeekMeasureIndex = mIdx;
        (window as any).__linusSeekTargetSeconds = effectiveTargetSec;

        currentBeatInMeasureRef.current = 0;
        globalBeatCountRef.current = mIdx * bpb;
        beatsElapsedForCurrentChordRef.current = 0;

        if (playbackSequenceRef.current && playbackSequenceRef.current.length > 0) {
          let exactIdx = -1;
          if (typeof flatIdx === "number") {
            exactIdx = playbackSequenceRef.current.findIndex(
              (c, idx) =>
                (c.measureIndex ?? idx) === mIdx &&
                c.originalFlatIndex === flatIdx
            );
          }
          if (exactIdx === -1) {
            exactIdx = playbackSequenceRef.current.findIndex(
              (c, idx) => (c.measureIndex ?? idx) === mIdx
            );
          }
          currentChordIdxRef.current =
            exactIdx !== -1
              ? exactIdx
              : Math.min(mIdx, playbackSequenceRef.current.length - 1);
        } else {
          currentChordIdxRef.current = 0;
        }

        visualQueueRef.current = [];
        try {
          Tone.Transport.seconds = effectiveTargetSec;
        } catch (_) {}

        // Si el transporte está reproduciendo en este momento, saltar en vivo y disparar el compás elegido
        if (isPlayingRef.current) {
          interactiveAnalysisAudio.releaseAllHarmony(0.02);
          interactiveAnalysisAudio.releaseAllBass(0.015);
          const jumpedChord =
            playbackSequenceRef.current?.[currentChordIdxRef.current];
          if (jumpedChord && onPlayingIndexChange && isVisibleRef.current) {
            onPlayingIndexChange(
              jumpedChord.originalFlatIndex !== undefined
                ? jumpedChord.originalFlatIndex
                : jumpedChord.globalChordIndex
            );
          }
          if (!isCountingInRef.current && audioCtxRef.current) {
            nextBeatTimeRef.current = audioCtxRef.current.currentTime + 0.015;
            if (timerIdRef.current) {
              clearTimeout(timerIdRef.current);
              timerIdRef.current = null;
            }
            scheduler();
          }
        }
      }
    };
    window.addEventListener("global-playback-stop", handleGlobalStop);
    window.addEventListener("linus-seek-measure", handleSeekMeasure);
    return () => {
      window.removeEventListener("global-playback-stop", handleGlobalStop);
      window.removeEventListener("linus-seek-measure", handleSeekMeasure);
    };
  }, []);

  const togglePlayback = () => {
    if (isPlayingRef.current || isPlaying) {
      stopMetronome();
    } else {
      startMetronome();
    }
  };

  const commitBpm = useCallback((targetBpm: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(targetBpm)));
    if (clamped === bpmRef.current) return;
    bpmRef.current = clamped;
    localBpmRef.current = clamped;
    setBpm(clamped);
    setLocalBpm(clamped);
    setLocalBpmInput(String(clamped));
    try {
      Tone.Transport.bpm.value = clamped;
    } catch (e) {
      console.warn("[Tone.Transport] Error seteando bpm:", e);
    }
    window.dispatchEvent(new CustomEvent("bpm-changed", { detail: clamped }));
  }, []);

  const handleStepBpm = useCallback((delta: number) => {
    setLocalBpm((prev) => {
      const next = Math.max(40, Math.min(240, prev + delta));
      localBpmRef.current = next;
      setLocalBpmInput(String(next));

      if (stepDebounceTimerRef.current) {
        clearTimeout(stepDebounceTimerRef.current);
      }
      stepDebounceTimerRef.current = setTimeout(() => {
        commitBpm(next);
      }, 150);

      return next;
    });
  }, [commitBpm]);

  const beatsCount = getBeatsPerMeasure(timeSignature);

  return (
    <div
      id="digital-metronome-container"
      className={`border rounded-xl transition duration-150 p-4 ${
        inline
          ? "bg-black/40 border-zinc-850 w-full"
          : "bg-[#0e0e0e] border-zinc-850 shadow-2xl w-full max-w-sm"
      }`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3.5 gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
          <Volume2 className="text-orange-500 scale-90" size={15} />
          <span className="text-[10px] whitespace-nowrap tracking-widest font-mono text-zinc-400 uppercase font-bold truncate">
            <span className="inline-block">{drumStyle === "Metronome Básico" ? t('academy.metronome') : drumStyle}</span>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Drum Style Selector */}
          <select 
            id="drum-style-selector"
            value={drumStyle}
            onChange={(e) => {
              const newStyle = e.target.value as DrumStyle;
              setDrumStyle(newStyle);
              if (onDrumStyleChange) {
                onDrumStyleChange(newStyle);
              }
              window.dispatchEvent(new CustomEvent("drum-style-changed", { detail: newStyle }));
            }}
            className="bg-black text-[10px] text-zinc-300 font-mono border border-zinc-850 rounded px-2 py-0.5 outline-none focus:border-orange-500 appearance-none cursor-pointer"
            title="Seleccionar patrón rítmico (Jazz Swing, Bossa Nova, Rock, Reggae, R&B, Hip Hop, Cumbia, Cool Jazz, Funk o Metrónomo Básico)"
          >
            <option value="Jazz Swing">Jazz Swing (Real)</option>
            <option value="Bossa Nova">Bossa Nova (Clave)</option>
            <option value="Bolero">Bolero</option>
            <option value="Pop">Pop</option>
            <option value="Rock">Rock</option>
            <option value="Reggae">Reggae</option>
            <option value="R&B">R&B</option>
            <option value="Hip Hop">Hip Hop</option>
            <option value="Cumbia">Cumbia</option>
            <option value="Cool Jazz">Cool Jazz</option>
            <option value="Funk">Funk</option>
            <option value="Blues">Blues</option>
            <option value="Reggaetón">Reggaetón</option>
            <option value="Metronome Básico">{t('academy.basic')}</option>
          </select>

          {/* Time Signature */}
          <div className="flex bg-black rounded p-0.5 border border-zinc-850">
            <select
              id="metronome-sig-selector"
              value={timeSignature}
              onChange={(e) => {
                const sig = e.target.value as TimeSignature;
                setTimeSignature(sig);
                timeSignatureRef.current = sig;
                const bpb = getBeatsPerBar(sig);
                currentBeatInMeasureRef.current = currentBeatInMeasureRef.current % bpb;
                if (onTimeSignatureChange) {
                  onTimeSignatureChange(sig);
                }
                window.dispatchEvent(new CustomEvent("time-signature-changed", { detail: sig }));
              }}
              className="bg-black text-[10px] text-zinc-300 font-mono border-none rounded px-1.5 py-0.5 outline-none focus:text-orange-500 cursor-pointer"
              title="Métrica activa"
            >
              {(["4/4", "3/4", "6/8", "12/8", "2/4", "5/4", "7/8"] as const).map((sig) => (
                <option key={sig} value={sig} className="bg-zinc-900 text-zinc-200">
                  {sig}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Primary Interactive Row */}
      <div className="flex items-center gap-2">
        {/* Toggle Playback Button */}
        <div className="flex-[0_0_80px]">
          <button
            id="metronome-toggle-btn"
            data-playing={isPlaying ? "true" : "false"}
            data-counting-in={isCountingIn ? "true" : "false"}
            onClick={(e) => {
              e.currentTarget.blur();
              togglePlayback();
            }}
            className={`w-full py-2 px-3 rounded flex items-center justify-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-none ${
              isPlaying
                ? isCountingIn
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-400"
                  : "bg-rose-500/20 border border-rose-500/30 text-rose-400"
                : "bg-orange-500 text-white shadow-none"
            }`}
          >
            {isPlaying ? (
              <>
                <Square size={11} fill="currentColor" />
                <span className="block truncate">{isCountingIn ? `Lista... ${currentBeat + 1}!` : "Stop"}</span>
              </>
            ) : (
              <>
                <Play size={11} fill="currentColor" />
                <span className="block truncate">Play</span>
              </>
            )}
          </button>
        </div>

        {/* Botón Abrir Mixer Modal */}
        <div className="flex-1">
          <button
            id="open-mixer-modal-btn"
            type="button"
            onClick={() => setIsMixerOpen(true)}
            className="w-full py-2 px-3 rounded flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-755 hover:border-orange-500 shadow-sm active:scale-95"
            title="Abrir Mixer de Estudio Pro"
          >
            <SlidersHorizontal size={13} className="text-orange-500" />
            <span className="inline-block text-orange-500">Mixer</span>
          </button>
        </div>

        {/* BPM Selector Slider & Micro-buttons */}
        <div className="flex-[0_0_130px] flex items-center justify-between gap-1.5 bg-black/60 border border-zinc-850 px-2 py-1.5 rounded">
          {/* Minus button */}
          <button
            id="metronome-bpm-minus"
            onClick={() => handleStepBpm(-1)}
            className="p-1 hover:bg-zinc-800 hover:text-orange-500 text-zinc-500 transition rounded active:scale-90 cursor-pointer"
            title="-1 BPM"
          >
            <Minus size={12} />
          </button>

          {/* Current BPM Display & Input */}
          <div className="text-center select-none flex flex-col min-w-[50px]">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={localBpmInput}
              onFocus={() => { isEditingBpmRef.current = true; }}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d+$/.test(val)) {
                  setLocalBpmInput(val);
                  const parsed = parseInt(val, 10);
                  if (!isNaN(parsed)) {
                    const clamped = Math.max(40, Math.min(240, parsed));
                    localBpmRef.current = clamped;
                    setLocalBpm(clamped);
                  }
                }
              }}
              onBlur={() => {
                isEditingBpmRef.current = false;
                const parsed = parseInt(localBpmInput, 10);
                commitBpm(isNaN(parsed) ? bpmRef.current : parsed);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  isEditingBpmRef.current = false;
                  const parsed = parseInt(localBpmInput, 10);
                  commitBpm(isNaN(parsed) ? bpmRef.current : parsed);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="text-sm font-mono font-bold text-zinc-100 leading-none text-center bg-transparent border-none outline-none focus:text-orange-500 tabular-nums w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-pointer"
              title="Haz clic para escribir BPM o usa +/-"
            />
            <span className="text-[7.5px] font-mono tracking-widest text-zinc-500 uppercase mt-0.5">
              <span className="block">BPM</span>
            </span>
          </div>

          {/* Plus button */}
          <button
            id="metronome-bpm-plus"
            onClick={() => handleStepBpm(1)}
            className="p-1 hover:bg-zinc-800 hover:text-orange-500 text-zinc-500 transition rounded active:scale-90 cursor-pointer"
            title="+1 BPM"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* BPM coarse slider bar */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[8px] font-mono text-zinc-600">40</span>
        <input
          id="metronome-slider"
          type="range"
          min="40"
          max="240"
          value={localBpm}
          onChange={(e) => {
            // Actualización visual ultra-ligera en el estado local (60 FPS sin bloquear audio)
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
              localBpmRef.current = val;
              setLocalBpm(val);
              setLocalBpmInput(String(val));
            }
          }}
          onPointerUp={() => commitBpm(localBpmRef.current)}
          onMouseUp={() => commitBpm(localBpmRef.current)}
          onTouchEnd={() => commitBpm(localBpmRef.current)}
          onKeyUp={() => commitBpm(localBpmRef.current)}
          className="flex-1 accent-orange-500 cursor-pointer h-1.5 rounded-lg bg-zinc-850 appearance-none focus:outline-none"
          title={`${localBpm} BPM`}
        />
        <span className="text-[8px] font-mono text-zinc-600">240</span>
      </div>

      {/* LED Visual Flasher row */}
      <div className="mt-3 pt-2.5 border-t border-zinc-850/60 flex items-center justify-center gap-2">
        {Array.from({ length: beatsCount }).map((_, idx) => {
          const isActive = currentBeat === idx;
          const isAccent = idx === 0;

          return (
            <div
              key={`metro-led-${idx}`}
              id={`metro-led-${idx}`}
              className={`flex-1 h-2 rounded transition-all duration-75 relative ${
                isActive
                  ? isAccent
                    ? "bg-orange-500 shadow-[0_0_8px_4px_rgba(234,88,11,0.4)]"
                    : "bg-orange-500 shadow-[0_0_6px_2px_rgba(234,88,11,0.25)]"
                  : isAccent
                  ? "bg-zinc-800 border-[1.5px] border-orange-500/25"
                  : "bg-zinc-900"
              }`}
            >
              {isAccent && !isActive && (
                <div className="absolute inset-0 m-auto w-1 h-1 rounded-full bg-orange-500/10" />
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Flotante (Pop-up): Mixer de Estudio Pro */}
      {isMixerOpen && (
        <div
          id="mixer-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsMixerOpen(false)}
        >
          <div
            id="mixer-modal-card"
            className="w-full max-w-6xl relative shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón de cierre X */}
            <button
              id="close-mixer-modal-btn"
              type="button"
              onClick={() => setIsMixerOpen(false)}
              className="absolute -top-3.5 -right-3.5 z-20 w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer shadow-xl active:scale-90"
              title="Cerrar Mixer"
            >
              <X size={15} />
            </button>

            <InteractiveMixer
              currentInstrument={harmonicInstrument}
              onInstrumentChange={setHarmonicInstrument}
              onClose={() => setIsMixerOpen(false)}
              isPlaying={isPlaying}
              onTogglePlayback={togglePlayback}
              bpm={bpm}
              onBpmChange={commitBpm}
              songStyle={songStyle}
              dawTracks={dawTracks}
              updateTrackVolume={updateTrackVolume}
              toggleTrackMute={toggleTrackMute}
              toggleTrackSolo={toggleTrackSolo}
              updateTrackPan={updateTrackPan}
              onUpdateTrackInstrument={onUpdateTrackInstrument}
            />
          </div>
        </div>
      )}
    </div>
  );
}
