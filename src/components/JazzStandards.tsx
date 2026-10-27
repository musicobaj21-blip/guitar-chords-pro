import React, { useState, useEffect, useMemo, useRef } from "react";
import * as Tone from "tone";
import { JAZZ_STANDARDS, getSongCategoryGroup } from "../data/songs";
import {
  getGuitarChordVoicing,
  ROOT_DISPLAY_NAME_MAP,
  ROOT_MIDI_OFFSET_MAP,
} from "../data/chords";
import {
  analyzeSongHarmony,
  AnalyzedChord,
  AnalysisCategory,
  analyzeChord,
  ChordInputContext,
} from "../utils/analyzer";
import {
  parseChord,
  transposeRoot,
  transposeChordString,
  getSuggestedScale,
  isMinorQuality,
  buildJazzVoicing,
} from "../utils/music";
import {
  interactiveAnalysisAudio,
  HARMONY_VOICE_PRESETS,
  BASS_VOICE_PRESETS,
  DRUM_KIT_PRESETS,
  detectDrumKitFromStyle,
  HarmonyVoicePresetId,
  BassVoicePresetId,
  DrumKitPresetId,
} from "../utils/interactiveAnalysisAudio";
import ChordFretboard from "./ChordFretboard";
import ScaleFretboard from "./ScaleFretboard";
import ChordPianoKeyboard from "./ChordPianoKeyboard";
import ScalePianoKeyboard from "./ScalePianoKeyboard";
import { useInstrument } from "../contexts/InstrumentContext";
import Metronome, { MetronomeControls } from "./Metronome";
import {
  getBeatsPerBar,
  DrumStyle,
  detectDrumStyleFromSongStyle,
  getDrumMatrixForBeat,
} from "../utils/interactiveRhythmPatterns";
import { generateComping, generateWalkingBass } from "../utils/band";
import MusicXMLImporter from "./MusicXMLImporter";
import { Song, SongMeasure, RootNote } from "../types";
import ChordNameInput from "./ChordNameInput";
import { downloadLeadSheetPDF } from "../utils/pdfGenerator";
import { getMasterChordSuggestions } from "../utils/chordSuggestions";
import LanguageSwitch from "./LanguageSwitch";
import {
  Music,
  ArrowUpDown,
  RotateCcw,
  Plus,
  Sparkles,
  Pencil,
  Save,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Folder,
  FolderOpen,
  FileText,
  Download,
  BarChart2,
  Piano,
  Guitar,
  Eye,
  Loader2,
  Play,
  Square,
  Volume2,
  MoreVertical,
  LayoutGrid,
  Wrench,
  Upload,
  Gauge,
  Sliders,
  Repeat,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * Catálogo de Estilos Musicales con Patrón Real Programado
 * (Incluye Samba, Vals Criollo / Porteño 3/4 y Hip-Hop)
 */
const STYLE_CATEGORIES_CATALOG: {
  groupEs: string;
  groupEn: string;
  styles: { value: string; labelEs: string; labelEn: string }[];
}[] = [
  {
    groupEs: "Jazz & Bossa",
    groupEn: "Jazz & Bossa",
    styles: [
      { value: "Jazz Swing", labelEs: "Jazz Swing", labelEn: "Jazz Swing" },
      { value: "Bossa Nova", labelEs: "Bossa Nova", labelEn: "Bossa Nova" },
      { value: "Samba", labelEs: "Samba", labelEn: "Samba" },
    ],
  },
  {
    groupEs: "Latino, Criollo & Tropical",
    groupEn: "Latin, Criollo & Tropical",
    styles: [
      { value: "Bolero", labelEs: "Bolero", labelEn: "Bolero" },
      {
        value: "Vals Criollo",
        labelEs: "Vals Peruano / Porteño (3/4)",
        labelEn: "Criollo / Tango Waltz (3/4)",
      },
      { value: "Cumbia", labelEs: "Cumbia", labelEn: "Cumbia" },
    ],
  },
  {
    groupEs: "Pop, Rock, Blues & Urbano",
    groupEn: "Pop, Rock, Blues & Urban",
    styles: [
      {
        value: "Shuffle",
        labelEs: "Blues / Shuffle",
        labelEn: "Blues / Shuffle",
      },
      {
        value: "Funk / Fusion",
        labelEs: "Funk / Fusion",
        labelEn: "Funk / Fusion",
      },
      { value: "Pop", labelEs: "Pop", labelEn: "Pop" },
      { value: "Rock", labelEs: "Rock", labelEn: "Rock" },
      { value: "Soul / R&B", labelEs: "Soul / R&B", labelEn: "Soul / R&B" },
      { value: "Hip-Hop", labelEs: "Hip-Hop", labelEn: "Hip-Hop" },
      { value: "Reggae", labelEs: "Reggae", labelEn: "Reggae" },
      { value: "Reggaeton", labelEs: "Reggaetón", labelEn: "Reggaeton" },
    ],
  },
];

const MAJOR_KEYS_LIST = [
  { value: "C", labelEs: "C Mayor (Do Mayor)", labelEn: "C Major" },
  { value: "Db", labelEs: "Db Mayor (Reb Mayor)", labelEn: "Db Major" },
  { value: "D", labelEs: "D Mayor (Re Mayor)", labelEn: "D Major" },
  { value: "Eb", labelEs: "Eb Mayor (Mib Mayor)", labelEn: "Eb Major" },
  { value: "E", labelEs: "E Mayor (Mi Mayor)", labelEn: "E Major" },
  { value: "F", labelEs: "F Mayor (Fa Mayor)", labelEn: "F Major" },
  { value: "F#", labelEs: "F# Mayor (Fa# Mayor)", labelEn: "F# Major" },
  { value: "G", labelEs: "G Mayor (Sol Mayor)", labelEn: "G Major" },
  { value: "Ab", labelEs: "Ab Mayor (Lab Mayor)", labelEn: "Ab Major" },
  { value: "A", labelEs: "A Mayor (La Mayor)", labelEn: "A Major" },
  { value: "Bb", labelEs: "Bb Mayor (Sib Mayor)", labelEn: "Bb Major" },
  { value: "B", labelEs: "B Mayor (Si Mayor)", labelEn: "B Major" },
];

const MINOR_KEYS_LIST = [
  { value: "Cm", labelEs: "Cm (Do Menor)", labelEn: "Cm (C Minor)" },
  { value: "C#m", labelEs: "C#m (Do# Menor)", labelEn: "C#m (C# Minor)" },
  { value: "Dm", labelEs: "Dm (Re Menor)", labelEn: "Dm (D Minor)" },
  { value: "Ebm", labelEs: "Ebm (Mib Menor)", labelEn: "Ebm (Eb Minor)" },
  { value: "Em", labelEs: "Em (Mi Menor)", labelEn: "Em (E Minor)" },
  { value: "Fm", labelEs: "Fm (Fa Menor)", labelEn: "Fm (F Minor)" },
  { value: "F#m", labelEs: "F#m (Fa# Menor)", labelEn: "F#m (F# Minor)" },
  { value: "Gm", labelEs: "Gm (Sol Menor)", labelEn: "Gm (G Minor)" },
  { value: "G#m", labelEs: "G#m (Sol# Menor)", labelEn: "G#m (G# Minor)" },
  { value: "Am", labelEs: "Am (La Menor)", labelEn: "Am (A Minor)" },
  { value: "Bbm", labelEs: "Bbm (Sib Menor)", labelEn: "Bbm (Bb Minor)" },
  { value: "Bm", labelEs: "Bm (Si Menor)", labelEn: "Bm (B Minor)" },
];

function normalizeKeySelectionValue(
  rawKey: string | undefined,
  isMinorFlag: boolean | undefined
): string {
  const cleanRoot = String(rawKey || "C")
    .replace(/m|-|min/gi, "")
    .trim();
  const isMin = Boolean(isMinorFlag) || /m|-|min/i.test(String(rawKey || ""));
  if (!isMin) {
    const mapMaj: Record<string, string> = {
      "C#": "Db",
      "D#": "Eb",
      Gb: "F#",
      "G#": "Ab",
      "A#": "Bb",
    };
    return mapMaj[cleanRoot] || cleanRoot || "C";
  }
  const mapMin: Record<string, string> = {
    Db: "C#m",
    "C#": "C#m",
    "D#": "Ebm",
    Eb: "Ebm",
    Gb: "F#m",
    "F#": "F#m",
    Ab: "G#m",
    "G#": "G#m",
    "A#": "Bbm",
    Bb: "Bbm",
  };
  return mapMin[cleanRoot] || `${cleanRoot}m`;
}

function normalizeStyleDropdownValue(rawStyle: string | undefined): string {
  const s = String(rawStyle || "Jazz Swing").toLowerCase();
  if (s.includes("samba")) return "Samba";
  if (s.includes("bossa")) return "Bossa Nova";
  if (s.includes("vals") || s.includes("waltz") || s.includes("porte"))
    return "Vals Criollo";
  if (s.includes("bolero")) return "Bolero";
  if (s.includes("cumbia")) return "Cumbia";
  if (s.includes("hip") || s.includes("boom bap")) return "Hip-Hop";
  if (s.includes("reggaet") || s.includes("reguet") || s.includes("dembow"))
    return "Reggaeton";
  if (s.includes("reggae")) return "Reggae";
  if (s.includes("funk") || s.includes("fusion")) return "Funk / Fusion";
  if (s.includes("rock")) return "Rock";
  if (s.includes("soul") || s.includes("r&b")) return "Soul / R&B";
  if (s.includes("pop")) return "Pop";
  if (s.includes("blues") || s.includes("shuffle")) return "Shuffle";
  return "Jazz Swing";
}

/**
 * Estilos que habilitan Guitarra Acústica:
 * Jazz Swing, Bossa Nova, Samba, Bolero y Vals Criollo / Porteño
 */
function doesStyleAllowGuitar(styleLabel: string | undefined): boolean {
  const norm = normalizeStyleDropdownValue(styleLabel);
  return (
    norm === "Jazz Swing" ||
    norm === "Bossa Nova" ||
    norm === "Samba" ||
    norm === "Bolero" ||
    norm === "Vals Criollo"
  );
}

/**
 * Timbre de Teclado predeterminado según el estilo:
 * - Soul / R&B, Funk / Fusion, Hip-Hop y Reggaetón -> Vintage Tine EP (Rhodes: "rhodes")
 * - Todos los demás estilos -> Grand Piano HD ("grand_piano")
 */
function getDefaultKeyboardPresetForStyle(
  styleLabel: string | undefined
): HarmonyVoicePresetId {
  const norm = normalizeStyleDropdownValue(styleLabel);
  if (
    norm === "Soul / R&B" ||
    norm === "Funk / Fusion" ||
    norm === "Hip-Hop" ||
    norm === "Reggaeton"
  ) {
    return "rhodes";
  }
  return "grand_piano";
}

/**
 * Kit de Batería HD ideal incluyendo Vals Criollo, Samba y Hip-Hop
 */
function getIdealDrumKitForStyle(
  styleLabel: string | undefined
): DrumKitPresetId {
  const norm = normalizeStyleDropdownValue(styleLabel);
  if (norm === "Reggaeton" || norm === "Hip-Hop") {
    return "urban_808";
  }
  if (
    norm === "Jazz Swing" ||
    norm === "Bossa Nova" ||
    norm === "Samba" ||
    norm === "Bolero" ||
    norm === "Vals Criollo"
  ) {
    return "jazz_vintage";
  }
  return detectDrumKitFromStyle(norm);
}

function extractCleanSectionBadge(
  rawLabel: string | undefined,
  fallback: string
): string {
  if (!rawLabel) return fallback;
  const cleaned = rawLabel
    .replace(/^\[|\]$/g, "")
    .replace(/^(secci[oó]n|section|parte|part)\s*/i, "")
    .trim();
  if (!cleaned) return fallback;
  if (/^intro/i.test(cleaned)) return "IN";
  if (/^coda/i.test(cleaned)) return "CO";
  return cleaned.charAt(0).toUpperCase();
}

function audioBufferToWav(
  buffer: AudioBuffer | Tone.ToneAudioBuffer,
  opt?: { float32?: boolean }
): Blob {
  const rawBuffer: AudioBuffer =
    buffer && typeof (buffer as any).get === "function"
      ? (buffer as any).get()
      : (buffer as AudioBuffer);

  const options = opt || {};
  const numChannels = rawBuffer.numberOfChannels;
  const sampleRate = rawBuffer.sampleRate;
  const format = options.float32 ? 3 : 1;
  const bitDepth = format === 3 ? 32 : 16;

  let result: Float32Array;
  if (numChannels === 2) {
    result = interleaveWavChannels(
      rawBuffer.getChannelData(0),
      rawBuffer.getChannelData(1)
    );
  } else {
    result = rawBuffer.getChannelData(0);
  }

  const wavArrayBuffer = encodeWavBuffer(
    result,
    format,
    sampleRate,
    numChannels,
    bitDepth
  );
  return new Blob([wavArrayBuffer], { type: "audio/wav" });
}

function encodeWavBuffer(
  samples: Float32Array,
  format: number,
  sampleRate: number,
  numChannels: number,
  bitDepth: number
): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeWavString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeWavString(view, 8, "WAVE");
  writeWavString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeWavString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  if (format === 1) {
    floatTo16BitPCM(view, 44, samples);
  } else {
    writeFloat32Samples(view, 44, samples);
  }

  return buffer;
}

function interleaveWavChannels(
  inputL: Float32Array,
  inputR: Float32Array
): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeFloat32Samples(
  output: DataView,
  offset: number,
  input: Float32Array
): void {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}

function floatTo16BitPCM(
  output: DataView,
  offset: number,
  input: Float32Array
): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeWavString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function buildStandardMidiFileBlob(
  sequence: any[],
  bpm: number,
  songTitle: string
): Blob {
  const ppq = 480;
  const mpqn = Math.round(60000000 / Math.max(30, bpm));

  const writeVarLen = (val: number): number[] => {
    let buffer = val & 0x7f;
    const bytes: number[] = [];
    while ((val >>= 7)) {
      buffer <<= 8;
      buffer |= (val & 0x7f) | 0x80;
    }
    while (true) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  };

  interface RawMidiEvent {
    tick: number;
    data: number[];
  }

  const events: RawMidiEvent[] = [];

  events.push({
    tick: 0,
    data: [
      0xff,
      0x51,
      0x03,
      (mpqn >> 16) & 0xff,
      (mpqn >> 8) & 0xff,
      mpqn & 0xff,
    ],
  });

  const titleBytes = Array.from(songTitle || "Rumie Harmonic Pro").map((ch) =>
    Math.min(127, ch.charCodeAt(0))
  );
  events.push({
    tick: 0,
    data: [0xff, 0x03, titleBytes.length, ...titleBytes],
  });

  events.push({ tick: 0, data: [0xc0, 0x00] });
  events.push({ tick: 0, data: [0xc1, 0x20] });

  let cursorTicks = 0;
  sequence.forEach((item) => {
    const beats = item.beatsLength || 4;
    const durationTicks = Math.max(120, Math.round(beats * ppq));
    const voicingMidis: number[] =
      Array.isArray(item.voicingMidis) && item.voicingMidis.length > 0
        ? item.voicingMidis
        : [60, 64, 67, 71];

    const bassMidi = Math.max(36, Math.min(55, (voicingMidis[0] % 12) + 36));

    voicingMidis.forEach((m) => {
      const safeM = Math.max(21, Math.min(108, Math.round(m)));
      events.push({ tick: cursorTicks, data: [0x90, safeM, 82] });
      events.push({
        tick: cursorTicks + durationTicks - 15,
        data: [0x80, safeM, 0],
      });
    });

    events.push({ tick: cursorTicks, data: [0x91, bassMidi, 92] });
    events.push({
      tick: cursorTicks + durationTicks - 15,
      data: [0x81, bassMidi, 0],
    });

    cursorTicks += durationTicks;
  });

  events.sort((a, b) => a.tick - b.tick);

  const trackBytes: number[] = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    trackBytes.push(...writeVarLen(delta), ...ev.data);
  }
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0x00,
    0x00,
    0x00,
    0x06,
    0x00,
    0x00,
    0x00,
    0x01,
    (ppq >> 8) & 0xff,
    ppq & 0xff,
  ];

  const len = trackBytes.length;
  const trackHeader = [
    0x4d,
    0x54,
    0x72,
    0x6b,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ];

  const fullArray = new Uint8Array([...header, ...trackHeader, ...trackBytes]);
  return new Blob([fullArray], { type: "audio/midi" });
}

export interface FlattenedMeasure extends SongMeasure {
  measure: SongMeasure;
  originalIndex: number;
  isEndOfPlayback?: boolean;
}

export function flattenCompasses(compasses: SongMeasure[]): FlattenedMeasure[] {
  if (!compasses || compasses.length === 0) return [];

  const cloneMeasure = (
    m: SongMeasure,
    originalIndex: number,
    isEndOfPlayback: boolean = false
  ): FlattenedMeasure => {
    const cloned: SongMeasure = JSON.parse(JSON.stringify(m));
    return {
      ...cloned,
      measure: cloned,
      originalIndex,
      isEndOfPlayback: isEndOfPlayback || !!m.isEnd,
    };
  };

  const result: FlattenedMeasure[] = [];
  let idx = 0;

  while (idx < compasses.length) {
    let repeatStartIdx = idx;
    let volta1StartIdx = -1;
    let repeatEndIdx = -1;
    let volta2StartIdx = -1;

    for (let scan = idx; scan < compasses.length; scan++) {
      if (
        compasses[scan].repeatStart &&
        scan > idx &&
        volta1StartIdx === -1 &&
        repeatEndIdx === -1
      ) {
        break;
      }
      if (compasses[scan].repeatStart && scan === idx) {
        repeatStartIdx = scan;
      }
      if (compasses[scan].volta === 1 && volta1StartIdx === -1) {
        volta1StartIdx = scan;
      }
      if (compasses[scan].repeatEnd && repeatEndIdx === -1) {
        repeatEndIdx = scan;
        if (
          scan + 1 < compasses.length &&
          compasses[scan + 1].volta === 2
        ) {
          volta2StartIdx = scan + 1;
        }
        break;
      }
      if (compasses[scan].volta === 2 && volta1StartIdx !== -1) {
        volta2StartIdx = scan;
        if (repeatEndIdx === -1) {
          repeatEndIdx = scan - 1;
        }
        break;
      }
    }

    if (
      volta1StartIdx !== -1 &&
      volta2StartIdx !== -1 &&
      volta1StartIdx < volta2StartIdx
    ) {
      const volta1EndIdx =
        repeatEndIdx !== -1 &&
        repeatEndIdx >= volta1StartIdx &&
        repeatEndIdx < volta2StartIdx
          ? repeatEndIdx
          : volta2StartIdx - 1;

      for (let i = repeatStartIdx; i <= volta1EndIdx; i++) {
        const isEnd = !!compasses[i].isEnd;
        result.push(cloneMeasure(compasses[i], i, isEnd));
        if (isEnd) return result;
      }

      for (let i = repeatStartIdx; i < volta1StartIdx; i++) {
        const isEnd = !!compasses[i].isEnd;
        result.push(cloneMeasure(compasses[i], i, isEnd));
        if (isEnd) return result;
      }

      idx = volta2StartIdx;
      continue;
    }

    if (repeatEndIdx !== -1 && repeatEndIdx >= repeatStartIdx) {
      for (let i = repeatStartIdx; i <= repeatEndIdx; i++) {
        const isEnd = !!compasses[i].isEnd;
        result.push(cloneMeasure(compasses[i], i, isEnd));
        if (isEnd) return result;
      }
      for (let i = repeatStartIdx; i <= repeatEndIdx; i++) {
        const isEnd = !!compasses[i].isEnd;
        result.push(cloneMeasure(compasses[i], i, isEnd));
        if (isEnd) return result;
      }
      idx = repeatEndIdx + 1;
      continue;
    }

    const isEnd = !!compasses[idx].isEnd;
    result.push(cloneMeasure(compasses[idx], idx, isEnd));
    if (isEnd) return result;
    idx++;
  }

  return result;
}

export const linearizeSongMeasures = flattenCompasses;

export function buildSongPlaybackSequence(
  song: Song | null,
  transposition: number,
  globalKey: string
) {
  if (!song) return [];
  let flatIdx = 0;
  const seq: any[] = [];
  const flattened = flattenCompasses(song.measures || []);
  let lastResolvedMeasureSlots: string[] = [];
  let previousVoicingMidis: number[] | null = null;

  flattened.forEach((entry) => {
    const measure = entry.measure || entry;
    const beatsPerMeasure = getBeatsPerBar(song.timeSignature || "4/4");
    const rawChordsInput =
      measure.chords && measure.chords.length > 0 ? measure.chords : [""];

    const isMeasureFullSimile =
      rawChordsInput.length === 1 &&
      (rawChordsInput[0] === "%" ||
        (typeof rawChordsInput[0] === "object" &&
          ((rawChordsInput[0] as any)?.chordName === "%" ||
            (rawChordsInput[0] as any)?.name === "%")));

    let effectiveMeasureChords: any[] = rawChordsInput;
    let isClonedFromPrevMeasure = false;

    if (isMeasureFullSimile && lastResolvedMeasureSlots.length > 0) {
      effectiveMeasureChords = [...lastResolvedMeasureSlots];
      isClonedFromPrevMeasure = true;
    }

    const slotCount =
      effectiveMeasureChords.length <= 1
        ? 1
        : effectiveMeasureChords.length === 2
        ? 2
        : 4;
    const lengthPerChord = beatsPerMeasure / slotCount;

    const resolvedChordsThisMeasure: string[] = [];

    const staticMeasureBaseIdx = (song.measures || [])
      .slice(0, entry.originalIndex)
      .reduce((acc, m) => {
        const mChords = m.chords && m.chords.length > 0 ? m.chords : [""];
        return acc + (mChords.length <= 1 ? 1 : mChords.length === 2 ? 2 : 4);
      }, 0);

    for (let sIdx = 0; sIdx < slotCount; sIdx++) {
      const rawChord = effectiveMeasureChords[sIdx] || "";
      const actualChordName =
        typeof rawChord === "string"
          ? rawChord
          : (rawChord as any)?.chordName ||
            (rawChord as any)?.name ||
            (rawChord as any)?.text ||
            "";
      const isSimile = actualChordName === "%" || isClonedFromPrevMeasure;

      let chordToPlay = actualChordName;
      if (actualChordName === "%") {
        if (lastResolvedMeasureSlots.length > 0) {
          chordToPlay =
            lastResolvedMeasureSlots[sIdx] ||
            lastResolvedMeasureSlots[lastResolvedMeasureSlots.length - 1];
        } else if (resolvedChordsThisMeasure.length > 0 && sIdx > 0) {
          chordToPlay = resolvedChordsThisMeasure[sIdx - 1];
        } else {
          for (let k = seq.length - 1; k >= 0; k--) {
            const prev = seq[k]?.resolvedChord;
            if (prev && prev !== "%" && prev.trim() !== "") {
              chordToPlay = prev;
              break;
            }
          }
        }
        if (!chordToPlay || chordToPlay === "%") chordToPlay = "C";
      }
      resolvedChordsThisMeasure.push(chordToPlay);

      const transposed =
        chordToPlay && chordToPlay !== "%"
          ? transposeChordString(chordToPlay, transposition, globalKey)
          : chordToPlay || "";
      const parsed =
        chordToPlay && chordToPlay !== "%"
          ? parseChord(transposed)
          : { root: "", type: "", suffix: "" };

      let frequencies: number[] = [];
      let voicingMidis: number[] = [];
      if (parsed.root) {
        voicingMidis = buildJazzVoicing(transposed, previousVoicingMidis);
        previousVoicingMidis = voicingMidis;
        frequencies = voicingMidis.map((m) => 440 * Math.pow(2, (m - 69) / 12));
      }

      const isLastChordOfMeasure = sIdx === slotCount - 1;
      const isLastItem = !!(entry.isEndOfPlayback && isLastChordOfMeasure);

      seq.push({
        globalChordIndex: flatIdx,
        originalFlatIndex:
          staticMeasureBaseIdx + (isClonedFromPrevMeasure ? 0 : sIdx),
        frequencies,
        voicingMidis,
        beatsLength: lengthPerChord,
        chordString: transposed,
        originalString: isClonedFromPrevMeasure ? "%" : actualChordName,
        resolvedChord: chordToPlay,
        isSimile,
        isEndMarker: !!measure.isEnd,
        isEndOfPlayback: isLastItem,
        globalKey,
        parsedRoot: parsed.root,
        parsedType: parsed.type,
        measureIndex: entry.originalIndex,
      });
      flatIdx++;
    }

    lastResolvedMeasureSlots = resolvedChordsThisMeasure;
  });

  return seq;
}

export default function JazzStandards({
  isVisible = true,
}: { isVisible?: boolean } = {}) {
  const { instrument, setInstrument } = useInstrument();
  const { language } = useLanguage();
  const isEs = language === "es";

  const [selectedSongId, setSelectedSongId] = useState(() => {
    const initial = sessionStorage.getItem("initialStandard");
    if (initial) {
      sessionStorage.removeItem("initialStandard");
      return initial;
    }
    return "autumn-leaves";
  });
  const [transposition, setTransposition] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showScalesInCells, setShowScalesInCells] = useState(false);
  const [masterVolPct, setMasterVolPct] = useState(85);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [measurePageOffset, setMeasurePageOffset] = useState(0);

  // Selector de Veces / Coros (Estilo iReal Pro: por defecto 3 veces)
  const [totalChoruses, setTotalChoruses] = useState<number>(3);
  const [currentChorusNumber, setCurrentChorusNumber] = useState<number>(1);
  const totalChorusesRef = useRef<number>(3);
  const currentChorusRef = useRef<number>(1);

  useEffect(() => {
    totalChorusesRef.current = totalChoruses;
  }, [totalChoruses]);

  const [isDeleteSongModalOpen, setIsDeleteSongModalOpen] = useState(false);
  const [isMixerModalOpen, setIsMixerModalOpen] = useState(false);

  // Estados de Timbres HD (5 Teclados / 2 Guitarras Acústicas, 5 Bajos y 3 Kits de Batería)
  const [selectedHarmonyPreset, setSelectedHarmonyPreset] =
    useState<HarmonyVoicePresetId>(() =>
      interactiveAnalysisAudio.getHarmonyPreset()
    );
  const [selectedBassPreset, setSelectedBassPreset] =
    useState<BassVoicePresetId>(() => interactiveAnalysisAudio.getBassPreset());
  const [selectedDrumKitPreset, setSelectedDrumKitPreset] =
    useState<DrumKitPresetId>(() =>
      interactiveAnalysisAudio.getDrumKitPreset()
    );

  const [mixerChannels, setMixerChannels] = useState({
    harmonyVol: 85,
    harmonyMuted: false,
    harmonySolo: false,
    bassVol: 85,
    bassMuted: false,
    bassSolo: false,
    drumsVol: 85,
    drumsMuted: false,
    drumsSolo: false,
  });

  const [isNewSheetModalOpen, setIsNewSheetModalOpen] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("Mi Nueva Progresión");
  const [newSheetMeasuresCount, setNewSheetMeasuresCount] =
    useState<number>(16);
  const [newSheetKey, setNewSheetKey] = useState<string>("C");
  const [newSheetTimeSig, setNewSheetTimeSig] = useState<string>("4/4");
  const [newSheetStyle, setNewSheetStyle] = useState<string>("Jazz Swing");

  const sanitizeChordString = (chord: string): string => {
    if (!chord || typeof chord !== "string") return chord;
    return chord.replace(/alt$/i, "");
  };

  const sanitizeSongs = (songList: Song[]): Song[] => {
    return songList.map((song) => ({
      ...song,
      measures: (song.measures || []).map((m) => ({
        ...m,
        chords: (m.chords || []).map(sanitizeChordString),
      })),
    }));
  };

  const [allSongs, setAllSongs] = useState<Song[]>(() => {
    try {
      localStorage.removeItem("allSongsList");
      const saved = localStorage.getItem("customSongs");
      const parsedCustom = saved ? JSON.parse(saved) : [];
      const standardIds = new Set(JAZZ_STANDARDS.map((s: Song) => s.id));
      const validCustom = Array.isArray(parsedCustom)
        ? parsedCustom.filter(
            (s: Song) => s?.isCustom && !standardIds.has(s.id)
          )
        : [];
      return sanitizeSongs([...JAZZ_STANDARDS, ...validCustom]);
    } catch (e) {
      return sanitizeSongs([...JAZZ_STANDARDS]);
    }
  });

  useEffect(() => {
    const customOnly = allSongs.filter((s) => s.isCustom);
    localStorage.setItem("customSongs", JSON.stringify(customOnly));
  }, [allSongs]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [showChordModal, setShowChordModal] = useState(false);
  const [showScaleModal, setShowScaleModal] = useState(false);

  const [customAnalyses, setCustomAnalyses] = useState<
    Record<
      string,
      { numeral: string; category: AnalysisCategory; groupWithNext?: boolean }
    >
  >({});
  const [editingCell, setEditingCell] = useState<{
    key: string;
    flatIndex: number;
    numeral: string;
    category: AnalysisCategory;
    groupWithNext: boolean;
  } | null>(null);

  const [focusedChord, setFocusedChord] = useState<{
    originalString: string;
    transposedString: string;
    analysisContext: AnalyzedChord | null;
    flatIndex?: number;
  } | null>(null);

  const currentSong = useMemo(() => {
    return allSongs.find((s) => s.id === selectedSongId) || allSongs[0];
  }, [selectedSongId, allSongs]);

  const isCustomSong = Boolean(
    currentSong?.isCustom || String(currentSong?.id || "").startsWith("custom-")
  );
  const isEditingActive = isEditMode;

  const [selectedStyleLabel, setSelectedStyleLabel] = useState<string>(() =>
    normalizeStyleDropdownValue(currentSong?.style)
  );
  const [activeDrumStyle, setActiveDrumStyle] = useState<DrumStyle>(() =>
    detectDrumStyleFromSongStyle(currentSong?.style)
  );

  const styleAllowsGuitar = useMemo(
    () => doesStyleAllowGuitar(selectedStyleLabel),
    [selectedStyleLabel]
  );

  useEffect(() => {
    const currentPresetObj = HARMONY_VOICE_PRESETS.find(
      (p) => p.id === selectedHarmonyPreset
    );
    if (instrument === "guitar") {
      if (!doesStyleAllowGuitar(selectedStyleLabel)) {
        setInstrument("piano");
        return;
      }
      if (currentPresetObj?.category !== "guitar") {
        const defaultGuitar: HarmonyVoicePresetId =
          selectedStyleLabel === "Bossa Nova" ||
          selectedStyleLabel === "Samba" ||
          selectedStyleLabel === "Bolero" ||
          selectedStyleLabel === "Vals Criollo"
            ? "nylon_concert"
            : "acoustic_steel";
        setSelectedHarmonyPreset(defaultGuitar);
        interactiveAnalysisAudio.setHarmonyPreset(defaultGuitar);
        setMixerChannels((prev) => ({ ...prev, harmonyVol: 65 }));
        interactiveAnalysisAudio.setChannelVolumeFromPercent("guitar", 65);
      }
    } else if (
      instrument === "piano" &&
      currentPresetObj?.category !== "piano"
    ) {
      const targetKeyboard = getDefaultKeyboardPresetForStyle(selectedStyleLabel);
      setSelectedHarmonyPreset(targetKeyboard);
      interactiveAnalysisAudio.setHarmonyPreset(targetKeyboard);
      setMixerChannels((prev) => ({ ...prev, harmonyVol: 85 }));
      interactiveAnalysisAudio.setChannelVolumeFromPercent("piano", 85);
    }
  }, [instrument]);

  /**
   * Aplica las reglas automáticas de instrumento y timbre según el estilo:
   * - Soul / R&B, Funk / Fusion, Hip-Hop y Reggaetón -> Teclado Vintage Tine EP (Rhodes)
   * - Pop, Rock, Blues, Reggae, Cumbia -> Teclado Grand Piano HD (y desactiva guitarra)
   * - Jazz Swing, Bossa Nova, Samba, Bolero y Vals Criollo -> Permite Piano o Guitarra Acústica
   */
  const applyStyleInstrumentationRules = React.useCallback(
    (styleName: string) => {
      const normalized = normalizeStyleDropdownValue(styleName);
      const allowsGtr = doesStyleAllowGuitar(normalized);
      const defaultKb = getDefaultKeyboardPresetForStyle(normalized);

      const autoKit = getIdealDrumKitForStyle(normalized);
      setSelectedDrumKitPreset(autoKit);
      interactiveAnalysisAudio.setDrumKitPreset(autoKit);

      if (!allowsGtr) {
        if (instrument === "guitar") {
          setInstrument("piano");
        }
        setSelectedHarmonyPreset(defaultKb);
        interactiveAnalysisAudio.setHarmonyPreset(defaultKb);
      } else {
        if (instrument === "guitar") {
          const gtrPreset: HarmonyVoicePresetId =
            normalized === "Bossa Nova" ||
            normalized === "Samba" ||
            normalized === "Bolero" ||
            normalized === "Vals Criollo"
              ? "nylon_concert"
              : "acoustic_steel";
          setSelectedHarmonyPreset(gtrPreset);
          interactiveAnalysisAudio.setHarmonyPreset(gtrPreset);
        } else {
          setSelectedHarmonyPreset(defaultKb);
          interactiveAnalysisAudio.setHarmonyPreset(defaultKb);
        }
      }
    },
    [instrument, setInstrument]
  );

  useEffect(() => {
    const normalized = normalizeStyleDropdownValue(currentSong?.style);
    setSelectedStyleLabel(normalized);
    setActiveDrumStyle(detectDrumStyleFromSongStyle(normalized));
    applyStyleInstrumentationRules(normalized);
  }, [currentSong?.id, currentSong?.style]);

  /**
   * Al cambiar de Estilo en el selector:
   * - Si elige "Vals Criollo", cambia automáticamente el compás a 3/4.
   * - Si vuelve a otro estilo desde un Vals en 3/4, restablece a 4/4.
   */
  const handleSelectStyleOption = (newStyleLabel: string) => {
    const normalized = normalizeStyleDropdownValue(newStyleLabel);
    setSelectedStyleLabel(normalized);
    const resolvedDrumStyle = detectDrumStyleFromSongStyle(normalized);
    setActiveDrumStyle(resolvedDrumStyle);

    applyStyleInstrumentationRules(normalized);

    let nextTimeSig = currentSong.timeSignature || "4/4";
    if (normalized === "Vals Criollo") {
      nextTimeSig = "3/4";
    } else if (
      selectedStyleLabel === "Vals Criollo" &&
      currentSong.timeSignature === "3/4"
    ) {
      nextTimeSig = "4/4";
    }

    const newSong = {
      ...currentSong,
      style: normalized,
      timeSignature: nextTimeSig,
    };
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSong : s))
    );
  };

  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState<
    number | null
  >(0);
  const [selectedChordSlotIndex, setSelectedChordSlotIndex] =
    useState<number>(0);
  const [quickChordInput, setQuickChordInput] = useState<string>("");
  const [isQuickChordDropdownOpen, setIsQuickChordDropdownOpen] =
    useState(false);
  const quickChordInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      selectedMeasureIndex !== null &&
      currentSong?.measures?.[selectedMeasureIndex]
    ) {
      const m = currentSong.measures[selectedMeasureIndex];
      const chords = m.chords || [];
      const currentSlotVal = chords[selectedChordSlotIndex] ?? chords[0] ?? "";
      const chordName =
        typeof currentSlotVal === "string"
          ? currentSlotVal
          : (currentSlotVal as any)?.chordName || "";
      setQuickChordInput(chordName);
    }
  }, [selectedMeasureIndex, selectedChordSlotIndex, currentSong]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        quickChordInputRef.current &&
        !quickChordInputRef.current.contains(e.target as Node)
      ) {
        setIsQuickChordDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleUpdateChordName = (
    measureIndex: number,
    chordIndex: number,
    newChord: string
  ) => {
    let trimmed = sanitizeChordString(newChord.trim());
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (!newSongObject.measures || !newSongObject.measures[measureIndex])
      return;

    if (!newSongObject.measures[measureIndex].chords) {
      newSongObject.measures[measureIndex].chords = [""];
    }

    let chordStr = trimmed;
    if (trimmed && transposition !== 0) {
      chordStr = transposeChordString(trimmed, -transposition, globalKey);
    }

    newSongObject.measures[measureIndex].chords[chordIndex] =
      sanitizeChordString(chordStr);
    newSongObject.isCustom = true;

    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
    );

    const flatIdx = (measureFlatIndices[measureIndex] ?? 0) + chordIndex;
    const analysisCtx = analyzedMeasures[measureIndex]?.[chordIndex];
    handleChordClick(chordStr, analysisCtx, flatIdx, false);
    if (trimmed && trimmed !== "%") {
      playChord(trimmed);
    }
  };

  const handleSetMeasureSubdivision = (count: 1 | 2 | 4) => {
    const targetIdx = selectedMeasureIndex ?? 0;
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (!newSongObject.measures || !newSongObject.measures[targetIdx]) return;

    const currentChords = (newSongObject.measures[targetIdx].chords || []).map(
      (c: any) => (typeof c === "string" ? c : c?.chordName || "")
    );

    let newChords: string[] = [];
    if (count === 1) {
      newChords = [currentChords[0] || ""];
    } else if (count === 2) {
      newChords = [currentChords[0] || "", currentChords[1] || ""];
    } else if (count === 4) {
      newChords = [
        currentChords[0] || "",
        currentChords[1] || "",
        currentChords[2] || "",
        currentChords[3] || "",
      ];
    }

    newSongObject.measures[targetIdx].chords = newChords;
    newSongObject.isCustom = true;
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
    );
    if (selectedChordSlotIndex >= count) {
      setSelectedChordSlotIndex(count - 1);
    }
  };

  const handleToggleRepeatStart = (measureIndex: number) => {
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (newSongObject.measures && newSongObject.measures[measureIndex]) {
      newSongObject.measures[measureIndex].repeatStart =
        !newSongObject.measures[measureIndex].repeatStart;
      newSongObject.isCustom = true;
      setAllSongs((prev) =>
        prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
      );
    }
  };

  const handleToggleRepeatEnd = (measureIndex: number) => {
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (newSongObject.measures && newSongObject.measures[measureIndex]) {
      newSongObject.measures[measureIndex].repeatEnd =
        !newSongObject.measures[measureIndex].repeatEnd;
      newSongObject.isCustom = true;
      setAllSongs((prev) =>
        prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
      );
    }
  };

  const handleToggleVolta = (measureIndex: number, voltaNum: 1 | 2) => {
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (newSongObject.measures && newSongObject.measures[measureIndex]) {
      const currentVolta = newSongObject.measures[measureIndex].volta;
      newSongObject.measures[measureIndex].volta =
        currentVolta === voltaNum ? undefined : voltaNum;
      newSongObject.isCustom = true;
      setAllSongs((prev) =>
        prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
      );
    }
  };

  const handleAddMeasureAfter = (measureIndex: number | null) => {
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (!newSongObject.measures) newSongObject.measures = [];

    const newMeasure: SongMeasure = {
      id: `m-${Date.now()}`,
      chords: [""],
    };

    const insertIdx =
      measureIndex !== null ? measureIndex + 1 : newSongObject.measures.length;
    newSongObject.measures.splice(insertIdx, 0, newMeasure);
    newSongObject.isCustom = true;

    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
    );
    setSelectedMeasureIndex(insertIdx);
    setSelectedChordSlotIndex(0);
  };

  const handleDeleteMeasure = (measureIndex: number) => {
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (!newSongObject.measures) newSongObject.measures = [];

    if (newSongObject.measures.length <= 1) {
      newSongObject.measures[0] = {
        id: `m-1-${Date.now()}`,
        chords: [""],
      };
    } else {
      newSongObject.measures.splice(measureIndex, 1);
    }

    newSongObject.isCustom = true;
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
    );
    const maxIdx = Math.max(0, (newSongObject.measures.length || 1) - 1);
    setSelectedMeasureIndex(Math.min(measureIndex, maxIdx));
  };

  const handleDeleteCurrentCustomSong = () => {
    setAllSongs((prev) => {
      const updated = prev.filter((s) => s.id !== currentSong.id);
      const nextSongs =
        updated.length > 0 ? updated : sanitizeSongs([...JAZZ_STANDARDS]);
      try {
        localStorage.setItem(
          "customSongs",
          JSON.stringify(nextSongs.filter((s) => s.isCustom))
        );
      } catch (_) {}
      setSelectedSongId(nextSongs[0].id);
      return nextSongs;
    });
    setIsDeleteSongModalOpen(false);
    setIsEditMode(false);
  };

  // Atajo global Barra Espaciadora
  useEffect(() => {
    const isTextInputElement = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
      if (el.tagName === "INPUT") {
        const type = ((el as HTMLInputElement).type || "text").toLowerCase();
        return (
          type !== "range" &&
          type !== "checkbox" &&
          type !== "radio" &&
          type !== "button"
        );
      }
      return false;
    };

    const handleSpaceKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        const activeEl = document.activeElement as HTMLElement | null;
        const target = e.target as HTMLElement | null;

        if (isTextInputElement(activeEl) || isTextInputElement(target)) return;

        e.preventDefault();
        e.stopPropagation();

        if (activeEl && typeof activeEl.blur === "function") {
          activeEl.blur();
        }

        if (e.repeat) return;

        if (metronomeControlRef.current) {
          metronomeControlRef.current.togglePlayback();
        } else {
          const btn = document.getElementById("metronome-toggle-btn");
          if (btn) btn.click();
        }
      }
    };

    window.addEventListener("keydown", handleSpaceKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleSpaceKeyDown, {
        capture: true,
      });
    };
  }, []);

  const handleToggleSection = (label: string) => {
    const targetIdx = selectedMeasureIndex ?? 0;
    let newSongObject = JSON.parse(JSON.stringify(currentSong)) as Song;
    if (!newSongObject.measures || !newSongObject.measures[targetIdx]) return;

    const currentLabel = newSongObject.measures[targetIdx].sectionLabel;
    const formatted = `[${label.replace(/^\[|\]$/g, "")}]`;

    if (currentLabel === formatted) {
      newSongObject.measures[targetIdx].sectionLabel = undefined;
    } else {
      newSongObject.measures[targetIdx].sectionLabel = formatted;
    }

    newSongObject.isCustom = true;
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSongObject : s))
    );
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const metronomeControlRef = useRef<MetronomeControls | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportToastMessage, setExportToastMessage] = useState<string | null>(
    null
  );
  const [pdfExportSuccess, setPdfExportSuccess] = useState(false);
  const [isExportingWav, setIsExportingWav] = useState(false);

  const triggerExportToast = (msg: string) => {
    setExportToastMessage(msg);
    setTimeout(() => {
      setExportToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleTriggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const updateMixerChannelVol = (
    ch: "harmony" | "bass" | "drums",
    valPct: number
  ) => {
    const safePct = Math.max(0, Math.min(100, Math.round(valPct)));
    const muteKey = `${ch}Muted` as
      | "harmonyMuted"
      | "bassMuted"
      | "drumsMuted";
    const wasMuted = mixerChannels[muteKey];

    setMixerChannels((prev) => ({
      ...prev,
      [`${ch}Vol`]: safePct,
      ...(wasMuted && safePct > 0 ? { [muteKey]: false } : {}),
    }));

    try {
      if (ch === "harmony") {
        if (wasMuted && safePct > 0) {
          interactiveAnalysisAudio.toggleChannelMute("piano");
        }
        interactiveAnalysisAudio.setChannelVolumeFromPercent("piano", safePct);
      } else if (ch === "bass") {
        if (wasMuted && safePct > 0) {
          interactiveAnalysisAudio.toggleChannelMute("bass");
        }
        interactiveAnalysisAudio.setChannelVolumeFromPercent("bass", safePct);
      } else if (ch === "drums") {
        if (wasMuted && safePct > 0) {
          interactiveAnalysisAudio.toggleChannelMute("drums");
        }
        interactiveAnalysisAudio.setChannelVolumeFromPercent("drums", safePct);
      }
    } catch (_) {}
  };

  const toggleMixerChannelMute = (ch: "harmony" | "bass" | "drums") => {
    const key = `${ch}Muted` as
      | "harmonyMuted"
      | "bassMuted"
      | "drumsMuted";
    const nextMuted = !mixerChannels[key];
    setMixerChannels((prev) => ({ ...prev, [key]: nextMuted }));
    try {
      if (ch === "harmony") {
        interactiveAnalysisAudio.toggleChannelMute("piano");
      } else if (ch === "bass") {
        interactiveAnalysisAudio.toggleChannelMute("bass");
      } else if (ch === "drums") {
        interactiveAnalysisAudio.toggleChannelMute("drums");
      }
    } catch (_) {}
  };

  const toggleMixerChannelSolo = (ch: "harmony" | "bass" | "drums") => {
    const key = `${ch}Solo` as "harmonySolo" | "bassSolo" | "drumsSolo";
    const nextSolo = !mixerChannels[key];
    setMixerChannels((prev) => ({ ...prev, [key]: nextSolo }));
    try {
      if (ch === "harmony") {
        interactiveAnalysisAudio.toggleChannelSolo(
          instrument === "guitar" ? "guitar" : "piano"
        );
      } else if (ch === "bass") {
        interactiveAnalysisAudio.toggleChannelSolo("bass");
      } else if (ch === "drums") {
        interactiveAnalysisAudio.toggleChannelSolo("drums");
      }
    } catch (_) {}
  };

  const handleExportSession = () => {
    try {
      const sessionData = {
        app: "Rumie Harmonic Pro",
        version: "2.0",
        format: "linus-session",
        exportedAt: new Date().toISOString(),
        id: currentSong.id,
        title: currentSong.title || "Mi Nueva Progresión",
        style: selectedStyleLabel || currentSong.style || "Jazz Swing",
        activeDrumStyle: activeDrumStyle || "Jazz Swing",
        tempo: currentSong.tempo || 120,
        timeSignature: currentSong.timeSignature || "4/4",
        defaultKey: currentSong.defaultKey || "C",
        defaultIsMinor: Boolean(currentSong.defaultIsMinor),
        transposition: transposition || 0,
        sections: currentSong.sections || { A: 0 },
        measures: currentSong.measures || [],
      };

      const jsonString = JSON.stringify(sessionData, null, 2);
      const blob = new Blob([jsonString], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeTitle = (currentSong.title || "sesion-rumie")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/gi, "_");
      link.download = `${safeTitle}.linus`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al exportar la sesión .linus:", error);
    }
  };

  const handleExportMidi = () => {
    setIsExportModalOpen(false);
    try {
      const seq = buildSongPlaybackSequence(
        currentSong,
        transposition,
        globalKey
      );
      const midiBlob = buildStandardMidiFileBlob(
        seq,
        currentSong.tempo || 120,
        currentSong.title || "Rumie Harmonic Pro"
      );
      const url = URL.createObjectURL(midiBlob);
      const a = document.createElement("a");
      const safeTitle = (currentSong.title || "progresion_rumie")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/gi, "_");
      a.href = url;
      a.download = `${safeTitle}.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      triggerExportToast("¡Archivo MIDI (.mid) exportado correctamente!");
    } catch (e) {
      console.error("Error exportando MIDI:", e);
    }
  };

  const handleDownloadDirectPDF = () => {
    setIsExportModalOpen(false);
    try {
      downloadLeadSheetPDF({
        song: transposedSongForScore,
        transposition,
        globalKey: displayedKeyCenter,
      });
      setPdfExportSuccess(true);
      setTimeout(() => setPdfExportSuccess(false), 4500);
    } catch (err) {
      console.error("Error al descargar el archivo PDF directo:", err);
    }
  };

  const handleExportWav = async (extensionFormat: "wav" | "mp3" = "wav") => {
    if (isExportingWav) return;
    setIsExportingWav(true);
    triggerExportToast(
      `Renderizando mezcla en .${extensionFormat.toUpperCase()}...`
    );

    try {
      if (
        metronomeControlRef.current &&
        metronomeControlRef.current.isPlaying()
      ) {
        try {
          metronomeControlRef.current.stop();
        } catch (_) {}
      }

      try {
        await Tone.start();
      } catch (_) {}

      const bpmVal = Math.max(
        30,
        Math.min(300, Number(currentSong?.tempo) || 120)
      );
      const timeSig = currentSong?.timeSignature || "4/4";
      const beatsPerBar =
        parseInt(timeSig.split("/")[0], 10) || getBeatsPerBar(timeSig);
      const secondsPerBeat =
        timeSig.split("/")[1]?.trim() === "8"
          ? 60.0 / bpmVal / 2.0
          : 60.0 / bpmVal;
      const activeStyle: DrumStyle =
        activeDrumStyle ||
        detectDrumStyleFromSongStyle(currentSong?.style) ||
        "Jazz Swing";
      const harmonicInst: "piano" | "guitar" | "epiano" =
        instrument === "guitar" && styleAllowsGuitar
          ? "guitar"
          : (instrument as any) === "epiano"
          ? "epiano"
          : "piano";

      const seq = buildSongPlaybackSequence(
        currentSong,
        transposition,
        globalKey
      );
      const seqTotalBeats =
        seq.length > 0
          ? seq.reduce((acc, item) => acc + (item.beatsLength || beatsPerBar), 0)
          : Math.max(4, (currentSong?.measures?.length || 4) * beatsPerBar);
      const progressionDurationSec = seqTotalBeats * secondsPerBeat;

      const mixerState = interactiveAnalysisAudio.getMixerState();
      const harmMixerCh =
        harmonicInst === "guitar"
          ? mixerState.guitar
          : harmonicInst === "epiano"
          ? mixerState.rhodes
          : mixerState.piano;

      const isHarmonyAudible = !harmMixerCh.isMuted;
      const harmonyPan = harmMixerCh.pan ?? -0.15;
      const isBassAudible = !mixerState.bass.isMuted;
      const bassPan = mixerState.bass.pan ?? 0.0;
      const isDrumsAudible =
        !mixerState.drums.isMuted && activeStyle !== "Metronome Básico";
      const drumsVol = mixerState.drums.volume;

      const bandBuffers =
        await interactiveAnalysisAudio.getBuffersForOfflineRender();

      const harmonyEvents: {
        time: number;
        notes: string[];
        duration: number;
        velocity: number;
      }[] = [];
      const bassEvents: {
        time: number;
        noteName: string;
        duration: number;
        velocity: number;
      }[] = [];
      const drumEvents: {
        time: number;
        instrument:
          | "kick"
          | "snare"
          | "rim"
          | "hihat"
          | "hihat_closed"
          | "hihat_open"
          | "ride";
        velocity: number;
      }[] = [];

      let currentBeatCursor = 0;

      for (let i = 0; i < seq.length; i++) {
        const currentChord = seq[i];
        const chordBeats = currentChord.beatsLength || beatsPerBar;
        const chordStartTimeSec = currentBeatCursor * secondsPerBeat;

        let effectiveChord = currentChord;
        if (!effectiveChord.chordString) {
          for (let back = 1; back <= seq.length; back++) {
            const prevIdx = (i - back + seq.length) % seq.length;
            if (seq[prevIdx] && seq[prevIdx].chordString) {
              effectiveChord = {
                ...currentChord,
                chordString: seq[prevIdx].chordString,
                frequencies: seq[prevIdx].frequencies,
                parsedRoot: seq[prevIdx].parsedRoot,
                parsedType: seq[prevIdx].parsedType,
              };
              break;
            }
          }
        }

        let nextChordString: string | null = null;
        if (i + 1 < seq.length) {
          nextChordString =
            seq[i + 1].chordString || effectiveChord.chordString;
        } else if (seq.length > 0) {
          nextChordString = seq[0].chordString || effectiveChord.chordString;
        }

        if (effectiveChord.chordString) {
          if (isHarmonyAudible) {
            const comping = generateComping(
              effectiveChord,
              activeStyle,
              currentBeatCursor,
              harmonicInst,
              timeSig
            );
            comping.forEach((c) => {
              if (!c.freqs || c.freqs.length === 0) return;
              const hitStartSec =
                chordStartTimeSec + c.timeOffset * secondsPerBeat;
              const hitDurationSec = Math.max(
                0.22,
                c.durationBeats * secondsPerBeat
              );

              const validNotes = Array.from(
                new Set(
                  c.freqs
                    .filter((f) => f > 0 && !isNaN(f))
                    .map((f) => {
                      let freq = f;
                      while (freq < 140) freq *= 2;
                      while (freq > 780) freq /= 2;
                      return Tone.Frequency(freq).toNote();
                    })
                )
              );

              if (validNotes.length > 0) {
                const polyHeadroom = Math.min(
                  1.0,
                  1.0 / Math.sqrt(validNotes.length)
                );
                harmonyEvents.push({
                  time: Math.max(0, hitStartSec),
                  notes: validNotes,
                  duration: hitDurationSec,
                  velocity: 0.9 * polyHeadroom,
                });
              }
            });
          }

          if (isBassAudible) {
            const bassNotes = generateWalkingBass(
              effectiveChord.chordString,
              chordBeats,
              nextChordString,
              activeStyle,
              currentBeatCursor,
              timeSig
            );
            bassNotes.forEach((n) => {
              if (
                isNaN(n.freq) ||
                isNaN(n.timeOffset) ||
                isNaN(n.durationBeats)
              )
                return;
              const noteStartSec =
                chordStartTimeSec + n.timeOffset * secondsPerBeat;
              const safeDurBeats = Math.max(
                0.25,
                Math.min(4.0, n.durationBeats)
              );
              const noteDurSec = Math.max(
                0.28,
                safeDurBeats * secondsPerBeat * 0.85
              );
              const noteName = Tone.Frequency(n.freq).toNote();
              bassEvents.push({
                time: Math.max(0, noteStartSec),
                noteName,
                duration: noteDurSec,
                velocity: 0.85,
              });
            });
          }
        }

        currentBeatCursor += chordBeats;
      }

      if (isDrumsAudible) {
        for (let globalBeat = 0; globalBeat < seqTotalBeats; globalBeat++) {
          const beatInMeasure = globalBeat % beatsPerBar;
          const beatStartSec = globalBeat * secondsPerBeat;
          const matrix = getDrumMatrixForBeat(
            activeStyle,
            beatInMeasure,
            globalBeat,
            timeSig
          );

          for (const hit of matrix.kick) {
            drumEvents.push({
              time: Math.max(0, beatStartSec + hit.timeOffset * secondsPerBeat),
              instrument: hit.instrument,
              velocity: hit.velocity,
            });
          }
          for (const hit of matrix.snare) {
            drumEvents.push({
              time: Math.max(0, beatStartSec + hit.timeOffset * secondsPerBeat),
              instrument: hit.instrument,
              velocity: hit.velocity,
            });
          }
          for (const hit of matrix.hihat) {
            drumEvents.push({
              time: Math.max(0, beatStartSec + hit.timeOffset * secondsPerBeat),
              instrument: hit.instrument,
              velocity: hit.velocity,
            });
          }
          for (const hit of matrix.ride) {
            drumEvents.push({
              time: Math.max(0, beatStartSec + hit.timeOffset * secondsPerBeat),
              instrument: hit.instrument,
              velocity: hit.velocity,
            });
          }
        }
      }

      const totalDuration = Math.max(4, progressionDurationSec) + 2.0;

      const renderedBuffer = await Tone.Offline(async ({ transport }) => {
        transport.bpm.setValueAtTime(bpmVal, 0);
        const rawDestination = Tone.getDestination();
        const countInOffsetSec = Tone.Time("1:0:0").toSeconds();

        if (isHarmonyAudible && harmonyEvents.length > 0) {
          const harmFilter = new Tone.Filter({
            frequency: 140,
            type: "highpass",
          });
          const harmPanner = new Tone.Panner(harmonyPan);
          harmFilter.chain(harmPanner, rawDestination);

          const sourceMap =
            harmonicInst === "guitar" ? bandBuffers.guitar : bandBuffers.piano;

          const harmUrls: Record<string, AudioBuffer> = {};
          Object.entries(sourceMap).forEach(([midiStr, buf]) => {
            if (buf) {
              const noteStr = Tone.Frequency(Number(midiStr), "midi").toNote();
              harmUrls[noteStr] = buf;
            }
          });

          if (Object.keys(harmUrls).length > 0) {
            const offlineHarmSampler = new Tone.Sampler({
              urls: harmUrls,
              attack: 0.008,
              release: 0.9,
              curve: "exponential",
            }).connect(harmFilter);
            offlineHarmSampler.volume.setValueAtTime(-12, 0);

            harmonyEvents.forEach((ev) => {
              transport.schedule((time) => {
                offlineHarmSampler.releaseAll(time);
                offlineHarmSampler.triggerAttackRelease(
                  ev.notes,
                  ev.duration,
                  time,
                  ev.velocity
                );
              }, countInOffsetSec + ev.time);
            });
          }
        }

        if (isBassAudible && bassEvents.length > 0) {
          const bassFilter = new Tone.Filter({
            frequency: 2600,
            type: "lowpass",
          });
          const bassPanner = new Tone.Panner(bassPan);
          bassFilter.chain(bassPanner, rawDestination);

          const bassUrls: Record<string, AudioBuffer> = {};
          Object.entries(bandBuffers.bass).forEach(([midiStr, buf]) => {
            if (buf) {
              const noteStr = Tone.Frequency(Number(midiStr), "midi").toNote();
              bassUrls[noteStr] = buf;
            }
          });

          if (Object.keys(bassUrls).length > 0) {
            const offlineBassSampler = new Tone.Sampler({
              urls: bassUrls,
              attack: 0.014,
              release: 0.25,
              curve: "exponential",
            }).connect(bassFilter);
            offlineBassSampler.volume.setValueAtTime(2, 0);

            bassEvents.forEach((ev) => {
              transport.schedule((time) => {
                offlineBassSampler.releaseAll(time);
                offlineBassSampler.triggerAttackRelease(
                  ev.noteName,
                  ev.duration,
                  time,
                  ev.velocity
                );
              }, countInOffsetSec + ev.time);
            });
          }
        }

        if (isDrumsAudible && drumEvents.length > 0) {
          const drumVolDb = drumsVol > 0.001 ? Tone.gainToDb(drumsVol) : -100;
          const kickSampler = bandBuffers.drums.kick
            ? new Tone.Sampler({
                urls: { C4: bandBuffers.drums.kick },
              }).connect(rawDestination)
            : null;
          if (kickSampler) kickSampler.volume.setValueAtTime(drumVolDb, 0);

          const snareSampler = bandBuffers.drums.snare
            ? new Tone.Sampler({
                urls: { C4: bandBuffers.drums.snare },
              }).connect(rawDestination)
            : null;
          if (snareSampler) snareSampler.volume.setValueAtTime(drumVolDb, 0);

          const rideSampler = bandBuffers.drums.ride
            ? new Tone.Sampler({
                urls: { C4: bandBuffers.drums.ride },
              }).connect(rawDestination)
            : null;
          if (rideSampler) rideSampler.volume.setValueAtTime(drumVolDb, 0);

          drumEvents.forEach((hit) => {
            transport.schedule((time) => {
              if (hit.instrument === "kick" && kickSampler) {
                kickSampler.triggerAttackRelease("C4", 0.7, time, 0.85);
              } else if (hit.instrument === "snare" && snareSampler) {
                snareSampler.triggerAttackRelease("C4", 0.5, time, 0.75);
              } else if (hit.instrument === "ride" && rideSampler) {
                rideSampler.triggerAttackRelease("C4", 1.5, time, 0.65);
              }
            }, countInOffsetSec + hit.time);
          });
        }

        transport.start(0);
      }, totalDuration + 4 * secondsPerBeat);

      const wavBlob = audioBufferToWav(renderedBuffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const safeTitle = (currentSong?.title || "mezcla_rumie")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/gi, "_")
        .replace(/^_+|_+$/g, "");
      a.download = `${safeTitle || "mezcla_rumie"}.${extensionFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setIsExportModalOpen(false);
      triggerExportToast(
        `¡Audio .${extensionFormat.toUpperCase()} exportado correctamente!`
      );
    } catch (error) {
      console.error("Error exportando audio offline:", error);
      triggerExportToast("Error al renderizar y exportar el archivo de audio.");
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleCycleComplete = React.useCallback(() => {
    const nextChorus = currentChorusRef.current + 1;
    if (nextChorus > totalChorusesRef.current) {
      currentChorusRef.current = 1;
      setCurrentChorusNumber(1);
      if (metronomeControlRef.current) {
        metronomeControlRef.current.stop();
      }
      setIsPlayingState(false);
      setCurrentPlayingIndex(null);
    } else {
      currentChorusRef.current = nextChorus;
      setCurrentChorusNumber(nextChorus);
    }
  }, []);

  const handleIsPlayingChange = (playing: boolean) => {
    setIsPlayingState(playing);
    if (!playing) {
      setCurrentPlayingIndex(null);
      currentChorusRef.current = 1;
      setCurrentChorusNumber(1);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;
        const parsed = JSON.parse(content);

        let loadedMeasures: SongMeasure[] = [];
        if (Array.isArray(parsed.measures)) {
          loadedMeasures = parsed.measures.map((m: any, idx: number) => ({
            id: m.id || `m-${idx + 1}-${Date.now()}`,
            chords: Array.isArray(m.chords)
              ? m.chords
              : typeof m.chord === "string"
              ? [m.chord]
              : m.chords
              ? [String(m.chords)]
              : [""],
            sectionLabel: m.sectionLabel || undefined,
            repeatStart: Boolean(m.repeatStart),
            repeatEnd: Boolean(m.repeatEnd),
            volta: m.volta || undefined,
            isEnd: Boolean(m.isEnd),
            modulateTo: m.modulateTo || undefined,
          }));
        }

        if (loadedMeasures.length === 0) return;

        const restoredSong: Song = {
          id: `custom-${Date.now()}`,
          title: parsed.title || "Sesión Cargada",
          style: parsed.style || "Jazz Swing",
          tempo: parsed.tempo || 120,
          timeSignature: parsed.timeSignature || "4/4",
          defaultKey: parsed.defaultKey || "C",
          defaultIsMinor: Boolean(parsed.defaultIsMinor),
          isCustom: true,
          sections: parsed.sections || { A: 0 },
          measures: loadedMeasures,
        };

        setAllSongs((prev) => [...prev, restoredSong]);
        setSelectedSongId(restoredSong.id);
        setSelectedMeasureIndex(0);
        setSelectedChordSlotIndex(0);
        triggerExportToast("Sesión (.linus) cargada correctamente.");
      } catch (err) {
        console.error("Error al procesar el archivo .linus:", err);
      }
    };
    reader.readAsText(file);
  };

  const { globalKey, globalIsMinor } = useMemo(() => {
    let rawKey = currentSong.defaultKey || "C";
    let isMinStr = /m|-|min/i.test(rawKey);
    let key = rawKey.replace(/m|-|min/gi, "").trim() as RootNote;
    let isMinor = !!currentSong.defaultIsMinor || isMinStr;

    if (
      currentSong.defaultIsMinor === undefined &&
      !isMinStr &&
      currentSong?.measures
    ) {
      const allFlatChords = currentSong.measures
        .flatMap((m) => m.chords || [])
        .filter((c) => {
          const str =
            typeof c === "string"
              ? c
              : (c as any)?.chordName || (c as any)?.name || "";
          return str && str.trim() !== "" && str !== "%";
        });
      if (allFlatChords.length > 0) {
        const firstC = allFlatChords[0];
        const lastC = allFlatChords[allFlatChords.length - 1];
        const firstParsed = parseChord(
          typeof firstC === "string" ? firstC : (firstC as any)?.chordName || ""
        );
        const lastParsed = parseChord(
          typeof lastC === "string" ? lastC : (lastC as any)?.chordName || ""
        );
        const cleanTonic = (
          key in ROOT_MIDI_OFFSET_MAP ? key : "C"
        ) as RootNote;

        if (
          (isMinorQuality(firstParsed.type) &&
            ROOT_MIDI_OFFSET_MAP[firstParsed.root] ===
              ROOT_MIDI_OFFSET_MAP[cleanTonic]) ||
          (isMinorQuality(lastParsed.type) &&
            ROOT_MIDI_OFFSET_MAP[lastParsed.root] ===
              ROOT_MIDI_OFFSET_MAP[cleanTonic])
        ) {
          isMinor = true;
        }
      }
    }

    return { globalKey: key || "C", globalIsMinor: isMinor };
  }, [currentSong]);

  const activeKeyDropdownValue = useMemo(
    () => normalizeKeySelectionValue(globalKey, globalIsMinor),
    [globalKey, globalIsMinor]
  );

  const quickChordSuggestions = useMemo(() => {
    if (!isQuickChordDropdownOpen) return [];
    return getMasterChordSuggestions(quickChordInput, globalKey);
  }, [isQuickChordDropdownOpen, quickChordInput, globalKey]);

  const analyzedChords = useMemo(() => {
    let currentKey = globalKey;
    let currentIsMinor = globalIsMinor;

    const contexts: ChordInputContext[] = [];

    (currentSong?.measures || []).forEach((m) => {
      if (m.modulateTo) {
        currentKey = m.modulateTo.key;
        currentIsMinor = m.modulateTo.isMinor;
      }
      const rawChords = m.chords && m.chords.length > 0 ? m.chords : [""];
      const slotCount =
        rawChords.length <= 1 ? 1 : rawChords.length === 2 ? 2 : 4;
      for (let i = 0; i < slotCount; i++) {
        const c = rawChords[i] || "";
        const actualChordName =
          typeof c === "string"
            ? c
            : (c as any)?.chordName ||
              (c as any)?.name ||
              (c as any)?.text ||
              "";
        contexts.push({
          chordString: actualChordName,
          keyContext: currentKey,
          isMinorKey: currentIsMinor,
        });
      }
    });

    return analyzeSongHarmony(contexts);
  }, [currentSong, globalKey, globalIsMinor]);

  const analyzedMeasures = useMemo(() => {
    let globalIdx = 0;
    return (currentSong?.measures || []).map((m) => {
      const rawChords = m.chords && m.chords.length > 0 ? m.chords : [""];
      const slotCount =
        rawChords.length <= 1 ? 1 : rawChords.length === 2 ? 2 : 4;
      return Array.from({ length: slotCount }, () => analyzedChords[globalIdx++]);
    });
  }, [currentSong, analyzedChords]);

  const allRawChords = useMemo(() => {
    return (currentSong?.measures || []).flatMap((m) => {
      const rawChords = m.chords && m.chords.length > 0 ? m.chords : [""];
      const slotCount =
        rawChords.length <= 1 ? 1 : rawChords.length === 2 ? 2 : 4;
      return Array.from({ length: slotCount }, (_, i) => {
        const c = rawChords[i] || "";
        const rawStr =
          typeof c === "string"
            ? c
            : (c as any)?.chordName || (c as any)?.name || "";
        return sanitizeChordString(rawStr);
      });
    });
  }, [currentSong]);

  const measureFlatIndices = useMemo(() => {
    let acc = 0;
    return (currentSong?.measures || []).map((m) => {
      const start = acc;
      const rawChords = m.chords && m.chords.length > 0 ? m.chords : [""];
      const slotCount =
        rawChords.length <= 1 ? 1 : rawChords.length === 2 ? 2 : 4;
      acc += slotCount;
      return start;
    });
  }, [currentSong]);

  const volta1SpanSet = useMemo(() => {
    const set = new Set<number>();
    const measures = currentSong?.measures || [];
    for (let i = 0; i < measures.length; i++) {
      if (measures[i].volta === 1) {
        set.add(i);
        for (let j = i + 1; j < measures.length; j++) {
          if (measures[j].volta === 2 || measures[j].repeatStart) break;
          set.add(j);
          if (measures[j].repeatEnd) break;
        }
      }
    }
    return set;
  }, [currentSong?.measures]);

  useEffect(() => {
    setTransposition(0);
    setSelectedMeasureIndex(0);
    setSelectedChordSlotIndex(0);
    setMeasurePageOffset(0);
    setIsDeleteSongModalOpen(false);
    currentChorusRef.current = 1;
    setCurrentChorusNumber(1);
  }, [selectedSongId]);

  const syncDawPlayheadToMeasure = React.useCallback(
    (measureIndex: number, slotIdx: number = 0, flatIdx?: number) => {
      const clampedMeasure = Math.max(0, Math.floor(measureIndex));
      const bPerBar = getBeatsPerBar(currentSong?.timeSignature || "4/4");
      const bpmVal = Math.max(
        20,
        Tone.Transport.bpm.value || currentSong?.tempo || 120
      );
      const secondsPerBeat = 60 / bpmVal;
      const targetSeconds = clampedMeasure * bPerBar * secondsPerBeat;

      try {
        Tone.Transport.seconds = targetSeconds;
      } catch (_) {}

      window.dispatchEvent(
        new CustomEvent("linus-seek-measure", {
          detail: {
            measureIndex: clampedMeasure,
            bar: clampedMeasure + 1.0,
            targetSeconds,
            slotIdx,
            flatIndex: flatIdx,
            source: "chord-grid",
          },
        })
      );
    },
    [currentSong?.timeSignature, currentSong?.tempo]
  );

  useEffect(() => {
    if (
      currentSong &&
      currentSong.measures.length > 0 &&
      currentSong.measures[0].chords.length > 0 &&
      analyzedMeasures.length > 0
    ) {
      const rawChord = currentSong.measures[0].chords[0];
      const firstChord =
        typeof rawChord === "string"
          ? rawChord
          : (rawChord as any)?.chordName ||
            (rawChord as any)?.name ||
            (rawChord as any)?.text ||
            "";
      const transposedFirst =
        transposition !== 0
          ? transposeChordString(firstChord, transposition, globalKey)
          : firstChord;
      setFocusedChord({
        originalString: firstChord,
        transposedString: transposedFirst,
        analysisContext: analyzedMeasures[0]?.[0] || null,
        flatIndex: 0,
      });
    } else {
      setFocusedChord(null);
    }
  }, [selectedSongId]);

  const handleTranspose = (amount: number) => {
    setTransposition((prev) => {
      const nextValue = prev + amount;
      if (nextValue > 11) return -11;
      if (nextValue < -11) return 11;
      return nextValue;
    });
  };

  const handleResetTranspose = () => {
    setTransposition(0);
  };

  const playChord = (chordToPlay: string) => {
    const parsed = parseChord(chordToPlay);
    let frequencies: number[] = [];
    if (parsed.root) {
      const midiNotes = buildJazzVoicing(chordToPlay);
      frequencies = midiNotes.map((m) => 440 * Math.pow(2, (m - 69) / 12));
    }
    if (frequencies.length > 0) {
      interactiveAnalysisAudio.playHarmonyChord(
        frequencies,
        0,
        1.8,
        instrument === "piano" || !styleAllowsGuitar ? "piano" : "guitar"
      );
    }
  };

  const handleChordClick = (
    chordString: string,
    analysisContext?: AnalyzedChord,
    flatIndex?: number,
    shouldPlayAudio: boolean = false
  ) => {
    let effectiveChordString = chordString;
    if (chordString === "%") {
      for (let prevIdx = (flatIndex ?? 1) - 1; prevIdx >= 0; prevIdx--) {
        const prev = allRawChords[prevIdx];
        if (prev && prev !== "%") {
          effectiveChordString = prev;
          break;
        }
      }
      if (effectiveChordString === "%") effectiveChordString = "C";
    }

    const transposedString =
      transposition === 0
        ? effectiveChordString
        : transposeChordString(effectiveChordString, transposition, globalKey);

    setFocusedChord({
      originalString: chordString,
      transposedString,
      analysisContext: analysisContext || null,
      flatIndex,
    });

    if (shouldPlayAudio && transposedString && transposedString !== "%") {
      playChord(transposedString);
    }
  };

  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(
    null
  );

  const playbackSequence = useMemo(() => {
    return buildSongPlaybackSequence(currentSong, transposition, globalKey);
  }, [currentSong, transposition, globalKey]);

  const getPlaybackSequence = React.useCallback(() => {
    return buildSongPlaybackSequence(currentSong, transposition, globalKey);
  }, [currentSong, transposition, globalKey]);

  useEffect(() => {
    if (currentPlayingIndex !== null) {
      const p =
        playbackSequence.find(
          (item) => item.originalFlatIndex === currentPlayingIndex
        ) || playbackSequence[currentPlayingIndex];
      if (p) {
        const analysisContext = analyzedChords[currentPlayingIndex] || null;
        setFocusedChord({
          originalString: p.originalString,
          transposedString: p.chordString,
          analysisContext,
          flatIndex: currentPlayingIndex,
        });
      }
    }
  }, [currentPlayingIndex, playbackSequence, analyzedChords]);

  const displayedKeyCenter = useMemo(() => {
    return transposeRoot(globalKey, transposition, globalKey);
  }, [globalKey, transposition]);

  const transposedSongForScore = useMemo(() => {
    const activeKeyStr = globalIsMinor
      ? `${displayedKeyCenter}m`
      : displayedKeyCenter;

    const transposedMeasures = (currentSong?.measures || []).map((m) => {
      let currentKeyForMeasure = globalKey;
      if (m.modulateTo?.key) {
        currentKeyForMeasure = m.modulateTo.key;
      }
      const rawChords = m.chords && m.chords.length > 0 ? m.chords : [""];
      const newChords = rawChords.map((c) => {
        const rawStr =
          typeof c === "string"
            ? c
            : (c as any)?.chordName ||
              (c as any)?.name ||
              (c as any)?.text ||
              "";
        const cleanStr = sanitizeChordString(rawStr);
        if (!cleanStr || cleanStr.trim() === "" || cleanStr === "%") {
          return cleanStr;
        }
        return transposition !== 0
          ? transposeChordString(cleanStr, transposition, currentKeyForMeasure)
          : cleanStr;
      });
      return {
        ...m,
        chords: newChords,
      };
    });

    return {
      ...currentSong,
      defaultKey: activeKeyStr,
      activeKey: activeKeyStr,
      transposition,
      isAlreadyTransposed: true,
      measures: transposedMeasures,
    } as Song & {
      activeKey: string;
      transposition: number;
      isAlreadyTransposed: boolean;
    };
  }, [currentSong, transposition, globalKey, globalIsMinor, displayedKeyCenter]);

  const focusedChordVoicingDetails = useMemo(() => {
    if (!focusedChord) return null;
    const parsed = parseChord(focusedChord.transposedString);
    const voicing = getGuitarChordVoicing(parsed.root, parsed.type);

    let scaleKeyCenter = displayedKeyCenter;
    if (focusedChord.analysisContext) {
      scaleKeyCenter = transposeRoot(
        focusedChord.analysisContext.keyContext,
        transposition,
        globalKey
      );
    }

    const isMinor = focusedChord.analysisContext?.isMinorKey ?? globalIsMinor;
    const numeral = focusedChord.analysisContext?.romanNumeral;
    const category = focusedChord.analysisContext?.category;

    const suggestedScale = getSuggestedScale(
      parsed.root,
      parsed.type,
      scaleKeyCenter,
      numeral,
      isMinor,
      null,
      category,
      null
    );

    return {
      root: parsed.root,
      type: parsed.type,
      suffix: parsed.suffix,
      voicing,
      suggestedScale,
    };
  }, [
    focusedChord,
    displayedKeyCenter,
    transposition,
    globalKey,
    globalIsMinor,
  ]);

  const effectiveChordDetails = useMemo(() => {
    if (focusedChordVoicingDetails) return focusedChordVoicingDetails;
    let rawStr = "";
    const selMeasure = currentSong?.measures?.[selectedMeasureIndex ?? 0];
    if (selMeasure && selMeasure.chords && selMeasure.chords.length > 0) {
      const c =
        selMeasure.chords[selectedChordSlotIndex ?? 0] || selMeasure.chords[0];
      rawStr =
        typeof c === "string"
          ? c
          : (c as any)?.chordName || (c as any)?.name || "";
    }
    if (!rawStr && allRawChords.length > 0) {
      rawStr =
        allRawChords.find((c) => c && c !== "%" && c.trim() !== "") || "Cmaj7";
    }
    if (!rawStr) rawStr = "Cmaj7";

    const parsed = parseChord(rawStr);
    const voicing = getGuitarChordVoicing(parsed.root, parsed.type);
    const suggestedScale = getSuggestedScale(
      parsed.root,
      parsed.type,
      displayedKeyCenter,
      undefined,
      globalIsMinor,
      undefined,
      undefined
    );

    return {
      root: parsed.root,
      type: parsed.type,
      suffix: parsed.suffix,
      voicing,
      suggestedScale,
    };
  }, [
    focusedChordVoicingDetails,
    currentSong,
    selectedMeasureIndex,
    selectedChordSlotIndex,
    allRawChords,
    displayedKeyCenter,
    globalIsMinor,
  ]);

  const effectiveChordString =
    focusedChord?.transposedString ||
    focusedChord?.originalString ||
    (effectiveChordDetails
      ? `${effectiveChordDetails.root}${effectiveChordDetails.suffix}`
      : "Cmaj7");

  const selectedMeasure =
    selectedMeasureIndex !== null && currentSong.measures
      ? currentSong.measures[selectedMeasureIndex]
      : null;

  const handleSelectKeyFromDropdown = (selectedVal: string) => {
    const isMinorSelected = selectedVal.endsWith("m");
    const cleanRoot = selectedVal.replace(/m$/i, "").trim();
    const newSong: Song = {
      ...currentSong,
      isCustom: true,
      defaultKey: cleanRoot,
      defaultIsMinor: isMinorSelected,
    };
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSong : s))
    );
    setTransposition(0);
  };

  const handleConfirmCreateNewSheet = () => {
    const safeCount = Math.max(
      1,
      Math.min(64, Number(newSheetMeasuresCount) || 16)
    );
    const generatedMeasures: SongMeasure[] = Array.from(
      { length: safeCount },
      (_, idx) => ({
        id: `m-${idx + 1}-${Date.now()}`,
        chords: [""],
        sectionLabel:
          idx === 0
            ? "[A]"
            : idx === 8 && safeCount >= 16
            ? "[B]"
            : idx === 16 && safeCount >= 24
            ? "[A]"
            : idx === 24 && safeCount >= 32
            ? "[C]"
            : undefined,
      })
    );

    const isMinorNew = newSheetKey.endsWith("m");
    const cleanRootNew = newSheetKey.replace(/m$/i, "").trim() || "C";
    const normNewStyle = normalizeStyleDropdownValue(newSheetStyle);
    const autoTimeSig =
      normNewStyle === "Vals Criollo" ? "3/4" : newSheetTimeSig || "4/4";

    const newSong: Song = {
      id: `custom-${Date.now()}`,
      title: newSheetTitle.trim() || "Mi Nueva Progresión",
      defaultKey: cleanRootNew,
      defaultIsMinor: isMinorNew,
      timeSignature: autoTimeSig,
      style: normNewStyle,
      tempo: 120,
      isCustom: true,
      sections: { A: 0 },
      measures: generatedMeasures,
    };

    setAllSongs((prev) => {
      const updated = [...prev, newSong];
      localStorage.setItem(
        "customSongs",
        JSON.stringify(updated.filter((s) => s.isCustom))
      );
      return updated;
    });
    setSelectedSongId(newSong.id);
    setSelectedMeasureIndex(0);
    setSelectedChordSlotIndex(0);
    setIsEditMode(true);
    setIsNewSheetModalOpen(false);
  };

  const handleMusicXMLImport = (song: Song) => {
    setAllSongs((prev) => {
      const updated = [...prev, song];
      localStorage.setItem(
        "customSongs",
        JSON.stringify(updated.filter((s) => s.isCustom))
      );
      return updated;
    });
    setSelectedSongId(song.id);
    setSelectedMeasureIndex(0);
    setSelectedChordSlotIndex(0);
  };

  const handleBpmDelta = (delta: number) => {
    const current = Number(currentSong.tempo) || 120;
    const nextBpm = Math.max(40, Math.min(240, current + delta));
    const newSong = { ...currentSong, tempo: nextBpm };
    setAllSongs((prev) =>
      prev.map((s) => (s.id === currentSong.id ? newSong : s))
    );
    try {
      Tone.Transport.bpm.value = nextBpm;
    } catch (_) {}
  };

  const handleMasterVolChange = (pct: number) => {
    const safePct = Math.max(0, Math.min(100, pct));
    setMasterVolPct(safePct);
    const norm = (safePct / 85) * 0.9;
    try {
      interactiveAnalysisAudio.setMasterVolume(norm);
    } catch (_) {}
  };

  const handlePlayTrigger = () => {
    if (metronomeControlRef.current) {
      metronomeControlRef.current.togglePlayback();
    } else {
      const btn = document.getElementById("metronome-toggle-btn");
      if (btn) btn.click();
    }
  };

  const handleStopTrigger = () => {
    if (metronomeControlRef.current) {
      metronomeControlRef.current.stop();
    }
    setIsPlayingState(false);
    setCurrentPlayingIndex(null);
    currentChorusRef.current = 1;
    setCurrentChorusNumber(1);
  };

  const handleRestartLoopTrigger = () => {
    syncDawPlayheadToMeasure(0, 0, 0);
    setSelectedMeasureIndex(0);
    setSelectedChordSlotIndex(0);
    currentChorusRef.current = 1;
    setCurrentChorusNumber(1);
  };

  const totalMeasures = currentSong?.measures?.length || 0;
  const visibleMeasuresSlice = useMemo(() => {
    const list = currentSong?.measures || [];
    return list.slice(measurePageOffset, measurePageOffset + 32);
  }, [currentSong?.measures, measurePageOffset]);

  const rowsOf8Measures = useMemo(() => {
    const rows: {
      rowIndex: number;
      sectionBadge: string;
      items: { measure: SongMeasure; globalIndex: number }[];
    }[] = [];

    const defaultRowBadges = ["A", "B", "A", "C"];

    for (let r = 0; r < 4; r++) {
      const startInSlice = r * 8;
      const chunk = visibleMeasuresSlice.slice(startInSlice, startInSlice + 8);
      if (chunk.length === 0) break;

      const firstGlobalIdx = measurePageOffset + startInSlice;
      const firstM = chunk[0];
      let badge = defaultRowBadges[r] || "A";

      if (firstM?.sectionLabel) {
        badge = extractCleanSectionBadge(firstM.sectionLabel, badge);
      } else if (currentSong.sections) {
        const foundSec = Object.entries(currentSong.sections).find(
          ([_, idx]) => idx === firstGlobalIdx
        );
        if (foundSec) {
          badge = extractCleanSectionBadge(foundSec[0], badge);
        }
      }

      rows.push({
        rowIndex: r,
        sectionBadge: badge,
        items: chunk.map((m, idx) => ({
          measure: m,
          globalIndex: firstGlobalIdx + idx,
        })),
      });
    }

    return rows;
  }, [visibleMeasuresSlice, measurePageOffset, currentSong.sections]);

  const renderStyleOptions = () => (
    <>
      {STYLE_CATEGORIES_CATALOG.map((cat) => (
        <optgroup
          key={cat.groupEs}
          label={isEs ? cat.groupEs : cat.groupEn}
          className="bg-[#0c0e14] text-[#f25100] font-bold"
        >
          {cat.styles.map((st) => (
            <option
              key={st.value}
              value={st.value}
              className="bg-[#141722] text-white font-normal"
            >
              {isEs ? st.labelEs : st.labelEn}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="w-full min-h-screen bg-[#090a0d] text-zinc-100 flex flex-col select-none">
      {/* Motor de Audio Oculto */}
      <div className="hidden" aria-hidden="true">
        <Metronome
          key={`metro-${currentSong.id}-${currentSong.timeSignature || "4/4"}`}
          initialBPM={currentSong.tempo}
          inline={true}
          playbackSequence={playbackSequence}
          getPlaybackSequence={getPlaybackSequence}
          importedMelody={currentSong.importedMelody}
          songStyle={selectedStyleLabel}
          drumStyle={activeDrumStyle}
          onDrumStyleChange={(st) => {
            setActiveDrumStyle(st);
            const normSt = normalizeStyleDropdownValue(st);
            setSelectedStyleLabel(normSt);
            applyStyleInstrumentationRules(normSt);
          }}
          timeSignature={currentSong.timeSignature || "4/4"}
          onTimeSignatureChange={(sig) => {
            const newSong = {
              ...currentSong,
              isCustom: true,
              timeSignature: sig,
            };
            setAllSongs((prev) =>
              prev.map((s) => (s.id === currentSong.id ? newSong : s))
            );
          }}
          onPlayingIndexChange={setCurrentPlayingIndex}
          metronomeControlRef={metronomeControlRef}
          onCycleComplete={handleCycleComplete}
          onIsPlayingChange={handleIsPlayingChange}
          selectedMeasureIndex={selectedMeasureIndex}
          isVisible={isVisible}
          dawTracks={[]}
        />
      </div>

      {/* =====================================================================
          1. HEADER SUPERIOR CORPORATIVO (ESTÁTICO EN 1 SOLA LÍNEA SIN SALTOS)
      ===================================================================== */}
      <header className="w-full bg-[#0c0e14] border-b border-[#1c1f2b] px-4 sm:px-6 h-16 flex items-center justify-between gap-3 print:hidden shrink-0">
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#f25100] flex items-center justify-center shadow-[0_0_18px_rgba(242,81,0,0.45)] shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-baseline gap-1.5 leading-none">
              <span>Rumie Harmonic</span>
              <span className="font-light text-zinc-400">Pro</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-zinc-400 mt-1 leading-none">
              {isEs
                ? "APRENDE, COMPRENDE Y CREA MÚSICA"
                : "LEARN, UNDERSTAND AND CREATE MUSIC"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Selector de Canción */}
          <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-10 px-3 w-[220px] sm:w-[255px]">
            <Folder size={15} className="text-[#f25100] mr-2.5 shrink-0" />
            <select
              value={selectedSongId}
              onChange={(e) => {
                setSelectedSongId(e.target.value);
                setIsEditMode(false);
              }}
              className="w-full bg-transparent text-sm font-bold text-white appearance-none outline-none pr-6 cursor-pointer truncate"
            >
              {[
                "Mis Progresiones Personalizadas",
                "Estándares de Jazz / Swing",
                "Bebop & Up-Tempo Swing",
                "Bossa Nova & Latin Jazz",
                "Gypsy Jazz / Manouche",
                "Modal & Post-Bop",
                "Funk, Soul Jazz & Blues",
                "Baladas de Jazz",
              ].map((groupName) => {
                const groupSongs = allSongs.filter(
                  (s) => getSongCategoryGroup(s) === groupName
                );
                if (groupSongs.length === 0) return null;
                return (
                  <optgroup
                    key={groupName}
                    label={`${groupName} (${groupSongs.length})`}
                    className="bg-[#0c0e14] text-[#f25100] font-bold"
                  >
                    {groupSongs.map((song) => (
                      <option
                        key={song.id}
                        value={song.id}
                        className="bg-[#141722] text-white font-normal"
                      >
                        {song.title} {song.isCustom ? "★" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 text-zinc-400 pointer-events-none"
            />
          </div>

          {/* Botón Papelera de Ancho Fijo Permanente */}
          <button
            type="button"
            disabled={!isCustomSong}
            onClick={() => {
              if (isCustomSong) setIsDeleteSongModalOpen(true);
            }}
            title={
              isCustomSong
                ? isEs
                  ? "Eliminar esta Hoja en Blanco"
                  : "Delete this custom progression"
                : isEs
                ? "Los estándares del catálogo base están protegidos"
                : "Built-in standards cannot be deleted"
            }
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
              isCustomSong
                ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400 hover:text-red-300 cursor-pointer"
                : "bg-[#141722]/40 border-[#1c1f2b] text-zinc-700 cursor-not-allowed"
            }`}
          >
            <Trash2 size={15} />
          </button>

          {/* Botón (+ Hoja en Blanco) */}
          <button
            type="button"
            onClick={() => {
              setNewSheetTitle("Mi Nueva Progresión");
              setNewSheetMeasuresCount(16);
              setIsNewSheetModalOpen(true);
            }}
            title={
              isEs
                ? "Nueva Hoja en Blanco (Elegir cantidad de compases)"
                : "New Blank Sheet (Choose measure count)"
            }
            className="h-10 px-3 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={16} className="text-[#f25100]" />
            <span className="text-xs font-bold hidden sm:inline">
              {isEs ? "Hoja en Blanco" : "Blank Sheet"}
            </span>
          </button>

          {/* Botón Abrir Sesión (.linus) */}
          <button
            type="button"
            onClick={handleTriggerFileInput}
            title={
              isEs
                ? "Abrir / Cargar Sesión guardada (.linus)"
                : "Open / Load saved session (.linus)"
            }
            className="h-10 px-3 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <FolderOpen size={15} className="text-amber-400" />
            <span className="text-xs font-bold hidden lg:inline">
              {isEs ? "Abrir Sesión" : "Open Session"}
            </span>
          </button>

          {/* Importar MusicXML */}
          <div className="shrink-0">
            <MusicXMLImporter compact={true} onImport={handleMusicXMLImport} />
          </div>

          {/* Switch Piano | Guitarra */}
          <div className="flex items-center bg-[#141722] p-1 rounded-xl border border-[#262a3b] h-10 shrink-0">
            <button
              type="button"
              onClick={() => setInstrument("piano")}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                instrument === "piano"
                  ? "bg-[#f25100]/20 text-white border border-[#f25100]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Piano size={14} className="text-[#f25100]" />
              <span>Piano</span>
            </button>
            <button
              type="button"
              disabled={!styleAllowsGuitar}
              onClick={() => {
                if (styleAllowsGuitar) setInstrument("guitar");
              }}
              title={
                styleAllowsGuitar
                  ? isEs
                    ? "Cambiar a Guitarra Acústica"
                    : "Switch to Acoustic Guitar"
                  : isEs
                  ? "Este estilo utiliza exclusivamente Teclado (Piano / Rhodes)"
                  : "This style uses Keyboard only"
              }
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                !styleAllowsGuitar
                  ? "opacity-35 cursor-not-allowed text-zinc-600"
                  : instrument === "guitar"
                  ? "bg-[#f25100]/20 text-white border border-[#f25100] cursor-pointer"
                  : "text-zinc-400 hover:text-white cursor-pointer"
              }`}
            >
              <Guitar size={14} className="text-[#f25100]" />
              <span>{isEs ? "Guitarra" : "Guitar"}</span>
            </button>
          </div>

          <LanguageSwitch />
        </div>
      </header>

      {/* =====================================================================
          2. BARRA DE TRANSPORTE HORIZONTAL
      ===================================================================== */}
      <div className="w-full bg-[#0e1017] border-b border-[#1c1f2b] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 print:hidden shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePlayTrigger}
            title={
              isEs
                ? "Reproducir / Pausar (Atajo: Barra Espaciadora)"
                : "Play / Pause (Shortcut: Spacebar)"
            }
            className="w-12 h-12 rounded-full bg-[#f25100] hover:bg-[#ff621a] text-white flex items-center justify-center shadow-[0_0_20px_rgba(242,81,0,0.5)] transition-transform active:scale-95 cursor-pointer shrink-0"
          >
            <Play size={20} className="fill-current ml-0.5" />
          </button>

          <button
            type="button"
            onClick={handleStopTrigger}
            title={isEs ? "Detener" : "Stop"}
            className="w-10 h-10 rounded-full bg-[#161924] hover:bg-[#1f2433] border border-[#262a3b] text-zinc-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Square size={14} className="fill-current" />
          </button>

          <button
            type="button"
            onClick={handleRestartLoopTrigger}
            title={isEs ? "Volver al Compás 1" : "Return to Measure 1"}
            className="w-10 h-10 rounded-full bg-[#161924] hover:bg-[#1f2433] border border-[#262a3b] text-zinc-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Controles Centrales: Estilo | Veces (3x) | Tempo | Tonalidad | Compás | Transponer */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              {isEs ? "Estilo" : "Style"}
            </span>
            <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-3 min-w-[165px]">
              <Music size={13} className="text-[#f25100] mr-2 shrink-0" />
              <select
                value={selectedStyleLabel}
                onChange={(e) => handleSelectStyleOption(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-white appearance-none outline-none pr-5 cursor-pointer"
              >
                {renderStyleOptions()}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 text-zinc-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Selector Veces (Estilo iReal Pro: 1x a 10x, por defecto 3x) */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              {isEs ? "Veces" : "Repeats"}
            </span>
            <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2.5 min-w-[82px]">
              <Repeat size={13} className="text-[#f25100] mr-1.5 shrink-0" />
              <select
                value={totalChoruses}
                onChange={(e) => {
                  const val = Number(e.target.value) || 3;
                  setTotalChoruses(val);
                  totalChorusesRef.current = val;
                }}
                className="w-full bg-transparent text-xs font-mono font-bold text-white appearance-none outline-none pr-4 cursor-pointer"
                title={
                  isEs
                    ? "Cantidad de veces (coros) que se repetirá la canción completa"
                    : "Number of times (choruses) to play the full song"
                }
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                  <option key={num} value={num} className="bg-[#141722]">
                    {num}x
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2 text-zinc-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              Tempo
            </span>
            <div className="flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2.5 gap-2">
              <Gauge size={13} className="text-zinc-400 shrink-0" />
              <span className="text-xs font-mono font-bold text-white min-w-[30px] text-center">
                {currentSong.tempo}
              </span>
              <div className="flex flex-col border-l border-[#262a3b] pl-1.5 -my-1">
                <button
                  type="button"
                  onClick={() => handleBpmDelta(2)}
                  className="text-[9px] text-zinc-400 hover:text-white leading-none py-0.5 cursor-pointer"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleBpmDelta(-2)}
                  className="text-[9px] text-zinc-400 hover:text-white leading-none py-0.5 cursor-pointer"
                >
                  ▼
                </button>
              </div>
            </div>
          </div>

          {/* Tonalidad (12 Mayores + 12 Menores) */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              {isEs ? "Tonalidad" : "Key"}
            </span>
            <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-3 min-w-[92px]">
              <select
                value={activeKeyDropdownValue}
                onChange={(e) => handleSelectKeyFromDropdown(e.target.value)}
                className="w-full bg-transparent text-xs font-mono font-bold text-white appearance-none outline-none pr-4 cursor-pointer"
              >
                <optgroup
                  label={isEs ? "Tonalidades Mayores" : "Major Keys"}
                  className="bg-[#0c0e14] text-[#f25100] font-bold"
                >
                  {MAJOR_KEYS_LIST.map((k) => (
                    <option
                      key={`maj-${k.value}`}
                      value={k.value}
                      className="bg-[#141722] text-white font-normal"
                    >
                      {k.value}
                    </option>
                  ))}
                </optgroup>
                <optgroup
                  label={isEs ? "Tonalidades Menores" : "Minor Keys"}
                  className="bg-[#0c0e14] text-[#f25100] font-bold"
                >
                  {MINOR_KEYS_LIST.map((k) => (
                    <option
                      key={`min-${k.value}`}
                      value={k.value}
                      className="bg-[#141722] text-white font-normal"
                    >
                      {k.value}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 text-zinc-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              {isEs ? "Compás" : "Meter"}
            </span>
            <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-3 min-w-[84px]">
              <select
                value={currentSong.timeSignature || "4/4"}
                onChange={(e) => {
                  const newSong = {
                    ...currentSong,
                    isCustom: true,
                    timeSignature: e.target.value,
                  };
                  setAllSongs((prev) =>
                    prev.map((s) => (s.id === currentSong.id ? newSong : s))
                  );
                }}
                className="w-full bg-transparent text-xs font-mono font-bold text-white appearance-none outline-none pr-4 cursor-pointer"
              >
                <option value="4/4" className="bg-[#141722]">
                  4/4
                </option>
                <option value="3/4" className="bg-[#141722]">
                  3/4
                </option>
                <option value="6/8" className="bg-[#141722]">
                  6/8
                </option>
                <option value="12/8" className="bg-[#141722]">
                  12/8
                </option>
                <option value="2/4" className="bg-[#141722]">
                  2/4
                </option>
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 text-zinc-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-400 pl-1">
              {isEs ? "Transponer" : "Transpose"}
            </span>
            <div className="flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2.5 gap-2">
              <ArrowUpDown size={13} className="text-zinc-400 shrink-0" />
              <span
                className={`text-xs font-mono font-bold min-w-[36px] text-center ${
                  transposition === 0 ? "text-white" : "text-[#f25100]"
                }`}
              >
                {transposition > 0 ? `+${transposition}` : transposition} st
              </span>
              <div className="flex flex-col border-l border-[#262a3b] pl-1.5 -my-1">
                <button
                  type="button"
                  onClick={() => handleTranspose(1)}
                  className="text-[9px] text-zinc-400 hover:text-white leading-none py-0.5 cursor-pointer"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleTranspose(-1)}
                  className="text-[9px] text-zinc-400 hover:text-white leading-none py-0.5 cursor-pointer"
                >
                  ▼
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Derecha: Botón MIXER + PDF + WAV + Menú Exportación */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMixerModalOpen(true)}
            title={
              isEs
                ? "Abrir Mixer y Sonidos HD (Teclados, Guitarras, Bajos, Kits de Batería)"
                : "Open Band Mixer & HD Sounds"
            }
            className="h-11 px-3.5 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#f25100]/50 hover:border-[#f25100] text-white flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
          >
            <Sliders size={14} className="text-[#f25100]" />
            <span className="text-[10px] font-extrabold text-[#f25100]">
              MIXER
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadDirectPDF}
            className="h-11 px-3.5 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-zinc-200 hover:text-white flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
          >
            <FileText size={14} className="text-zinc-300" />
            <span className="text-[10px] font-extrabold">PDF</span>
          </button>

          <button
            type="button"
            disabled={isExportingWav}
            onClick={() => handleExportWav("wav")}
            className="h-11 px-3.5 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-zinc-200 hover:text-white flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
          >
            {isExportingWav ? (
              <Loader2 size={14} className="animate-spin text-[#f25100]" />
            ) : (
              <BarChart2 size={14} className="text-zinc-300" />
            )}
            <span className="text-[10px] font-extrabold">WAV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            title="Más formatos de exportación (MIDI, MP3, .linus)"
            className="w-10 h-11 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          3. WORKSPACE PRINCIPAL
      ===================================================================== */}
      <div className="flex-1 w-full max-w-[1860px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* COLUMNA IZQUIERDA (9 COLUMNAS): PARTITURA */}
        <div className="xl:col-span-9 bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5 min-w-0">
              {isEditingActive ? (
                <input
                  value={currentSong.title}
                  onChange={(e) => {
                    const newSong = {
                      ...currentSong,
                      isCustom: true,
                      title: e.target.value,
                    };
                    setAllSongs((prev) =>
                      prev.map((s) => (s.id === currentSong.id ? newSong : s))
                    );
                  }}
                  className="text-xl sm:text-2xl font-bold text-white tracking-tight bg-transparent border-b border-dashed border-[#f25100]/70 focus:border-[#f25100] outline-none"
                  placeholder="Título de la canción"
                />
              ) : (
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                  {currentSong.title}
                </h2>
              )}
              <span className="text-sm text-zinc-400 font-medium">
                · {selectedStyleLabel} ·{" "}
                <strong className="text-zinc-200">
                  {ROOT_DISPLAY_NAME_MAP[displayedKeyCenter] ||
                    displayedKeyCenter}
                  {globalIsMinor ? "m" : ""}
                </strong>
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#141722] border border-[#262a3b] text-[#f25100]">
                {isPlayingState
                  ? `${isEs ? "Vuelta" : "Chorus"} ${currentChorusNumber}/${totalChoruses}`
                  : `${totalChoruses} ${isEs ? "Veces" : "Choruses"}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-[#141722] p-1 rounded-xl border border-[#262a3b]">
                <button
                  type="button"
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    showAnalysis
                      ? "bg-[#f25100]/20 text-[#ff7b3a] border border-[#f25100]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <BarChart2 size={13} className="text-[#f25100]" />
                  <span>{isEs ? "Análisis" : "Analysis"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowChordModal(true)}
                  className="h-8 px-3 rounded-lg text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Piano size={13} />
                  <span>{isEs ? "Acordes" : "Chords"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowScalesInCells(!showScalesInCells)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    showScalesInCells
                      ? "bg-[#f25100]/20 text-[#ff7b3a] border border-[#f25100]"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  <Music size={13} />
                  <span>{isEs ? "Escalas" : "Scales"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowScaleModal(true)}
                  className="h-8 px-3 rounded-lg text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <LayoutGrid size={13} />
                  <span>{isEs ? "Diagramas" : "Diagrams"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* GRILLA DE COMPASES */}
          <div className="flex flex-col gap-2.5">
            {rowsOf8Measures.map((row) => (
              <div
                key={`row-8-${row.rowIndex}`}
                className="flex items-stretch gap-2.5"
              >
                <div className="w-7 sm:w-8 rounded-xl bg-[#141722] border border-[#f25100] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(242,81,0,0.15)]">
                  <span className="text-sm sm:text-base font-black text-[#f25100]">
                    {row.sectionBadge}
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-4 sm:grid-cols-8 bg-[#0b0d13] border border-[#1d2130] rounded-xl overflow-visible">
                  {row.items.map(({ measure, globalIndex }, colIdx) => {
                    const rawChordsList =
                      measure?.chords && measure.chords.length > 0
                        ? measure.chords
                        : [""];
                    const slotCount: 1 | 2 | 4 =
                      rawChordsList.length <= 1
                        ? 1
                        : rawChordsList.length === 2
                        ? 2
                        : 4;
                    const slots = Array.from(
                      { length: slotCount },
                      (_, i) => rawChordsList[i] ?? ""
                    );

                    const isSelectedMeasure =
                      selectedMeasureIndex === globalIndex;
                    const isPartOfVolta1Span = volta1SpanSet.has(globalIndex);
                    const hasVoltaBracket =
                      Boolean(measure.volta) || isPartOfVolta1Span;

                    return (
                      <div
                        key={measure.id || `m-${globalIndex}`}
                        onClick={() => {
                          setSelectedMeasureIndex(globalIndex);
                          setSelectedChordSlotIndex(0);
                          const targetFlatIdx =
                            measureFlatIndices[globalIndex] ?? 0;
                          syncDawPlayheadToMeasure(
                            globalIndex,
                            0,
                            targetFlatIdx
                          );
                        }}
                        className={`relative min-h-[104px] sm:min-h-[112px] p-2 flex flex-col justify-center items-center transition-colors cursor-pointer ${
                          colIdx < row.items.length - 1
                            ? "border-r border-[#1c202e]"
                            : ""
                        } ${
                          isSelectedMeasure
                            ? "bg-[#f25100]/[0.09] ring-1 ring-inset ring-[#f25100]/60"
                            : "hover:bg-[#141824]/70"
                        }`}
                      >
                        {measure.repeatStart && (
                          <div className="absolute left-0 top-0 bottom-0 flex items-center z-10 pointer-events-none pl-0.5">
                            <div className="w-[2.5px] h-full bg-[#f25100]" />
                            <div className="flex flex-col gap-1.5 ml-[2px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f25100]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f25100]" />
                            </div>
                          </div>
                        )}

                        {measure.repeatEnd && (
                          <div className="absolute right-0 top-0 bottom-0 flex items-center z-10 pointer-events-none pr-0.5">
                            <div className="flex flex-col gap-1.5 mr-[2px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f25100]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f25100]" />
                            </div>
                            <div className="w-[2.5px] h-full bg-[#f25100]" />
                          </div>
                        )}

                        {hasVoltaBracket && (
                          <div className="absolute top-0 left-0 right-0 h-3 pointer-events-none z-20 flex items-start">
                            <div
                              className={`w-full border-t-2 border-[#f25100] h-2.5 flex items-start ${
                                measure.volta ? "border-l" : ""
                              } ${measure.repeatEnd ? "border-r" : ""}`}
                            >
                              {measure.volta && (
                                <span className="bg-[#090a0d] text-[#f25100] font-mono font-bold text-[9px] px-1 -mt-1.5 ml-5">
                                  {measure.volta}.
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <span className="absolute top-1.5 left-2 text-[10px] font-mono text-zinc-500 select-none">
                          {globalIndex + 1}
                        </span>

                        <div
                          className="grid w-full h-full items-center gap-0.5 pt-2"
                          style={{
                            gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))`,
                          }}
                        >
                          {slots.map((rawChord, slotIdx) => {
                            const rawChordName =
                              typeof rawChord === "string"
                                ? rawChord
                                : (rawChord as any)?.chordName ||
                                  (rawChord as any)?.name ||
                                  "";
                            const actualChordName =
                              sanitizeChordString(rawChordName);
                            const transposedChordName = transposeChordString(
                              actualChordName,
                              transposition,
                              globalKey
                            );
                            const flatIndex =
                              (measureFlatIndices[globalIndex] ?? 0) + slotIdx;

                            const isPlaying = currentPlayingIndex === flatIndex;
                            const isFocused =
                              focusedChord?.flatIndex === flatIndex;
                            const overrideKey = `${currentSong.id}-${flatIndex}`;
                            const measureAnalysis =
                              analyzedMeasures[globalIndex]?.[slotIdx];
                            let analyzeRes =
                              measureAnalysis ||
                              analyzeChord(
                                actualChordName,
                                flatIndex,
                                allRawChords,
                                globalKey + (globalIsMinor ? "m" : "")
                              );

                            const parsedOriginal = parseChord(actualChordName);
                            let analysis: AnalyzedChord = measureAnalysis || {
                              chordString: actualChordName,
                              root:
                                (analyzeRes as any).root ||
                                parsedOriginal.root,
                              type:
                                (analyzeRes as any).type ||
                                parsedOriginal.type,
                              keyContext:
                                analyzeRes.keyContext || (globalKey as any),
                              isMinorKey:
                                analyzeRes.isMinorKey || globalIsMinor,
                              romanNumeral: analyzeRes.romanNumeral,
                              category: analyzeRes.category as any,
                              color: analyzeRes.color,
                              suggestedScale: analyzeRes.suggestedScale,
                            };

                            if (customAnalyses[overrideKey]) {
                              analysis = {
                                ...analysis,
                                romanNumeral:
                                  customAnalyses[overrideKey].numeral,
                                category: customAnalyses[overrideKey]
                                  .category as AnalysisCategory,
                              };
                            }

                            let shortScaleName: string | null = null;
                            if (
                              showScalesInCells &&
                              actualChordName &&
                              actualChordName !== "%"
                            ) {
                              const p = parseChord(transposedChordName);
                              if (p.root) {
                                const sc = getSuggestedScale(
                                  p.root,
                                  p.type,
                                  transposeRoot(
                                    analysis.keyContext || globalKey,
                                    transposition,
                                    globalKey
                                  ),
                                  analysis.romanNumeral,
                                  analysis.isMinorKey
                                );
                                if (sc?.name) {
                                  const cleanSc = sc.name
                                    .replace(/\s*\([^)]*\)/g, "")
                                    .split("·")[0]
                                    .trim();
                                  shortScaleName = cleanSc
                                    .toUpperCase()
                                    .startsWith(p.root.toUpperCase() + " ")
                                    ? cleanSc
                                    : `${p.root} ${cleanSc}`;
                                }
                              }
                            }

                            return (
                              <div
                                key={`cell-${globalIndex}-${slotIdx}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMeasureIndex(globalIndex);
                                  setSelectedChordSlotIndex(slotIdx);
                                  syncDawPlayheadToMeasure(
                                    globalIndex,
                                    slotIdx,
                                    flatIndex
                                  );
                                  handleChordClick(
                                    actualChordName,
                                    showAnalysis ? analysis : undefined,
                                    flatIndex
                                  );
                                }}
                                className="flex flex-col items-center justify-center gap-1 w-full"
                              >
                                {showAnalysis &&
                                  analysis?.romanNumeral &&
                                  analysis.romanNumeral !== "-" && (
                                    <span
                                      onClick={(e) => {
                                        if (isEditingActive) {
                                          e.stopPropagation();
                                          setEditingCell({
                                            key: overrideKey,
                                            flatIndex,
                                            numeral: analysis.romanNumeral,
                                            category: analysis.category,
                                            groupWithNext:
                                              !!customAnalyses[overrideKey]
                                                ?.groupWithNext,
                                          });
                                        }
                                      }}
                                      className={`text-sm sm:text-base font-serif italic font-bold text-[#f25100] leading-none ${
                                        isEditingActive
                                          ? "underline decoration-dotted cursor-pointer"
                                          : ""
                                      }`}
                                    >
                                      {analysis.romanNumeral}
                                    </span>
                                  )}

                                <ChordNameInput
                                  chordName={
                                    actualChordName === "%"
                                      ? "%"
                                      : transposedChordName
                                  }
                                  isEditMode={isEditingActive}
                                  isPlaying={isPlaying}
                                  isFocused={isFocused}
                                  sequenceGroupingClass=""
                                  globalKey={globalKey}
                                  onSave={(newChordName) => {
                                    handleUpdateChordName(
                                      globalIndex,
                                      slotIdx,
                                      newChordName
                                    );
                                  }}
                                  onClick={() => {
                                    setSelectedMeasureIndex(globalIndex);
                                    setSelectedChordSlotIndex(slotIdx);
                                    syncDawPlayheadToMeasure(
                                      globalIndex,
                                      slotIdx,
                                      flatIndex
                                    );
                                    handleChordClick(
                                      actualChordName,
                                      showAnalysis ? analysis : undefined,
                                      flatIndex
                                    );
                                  }}
                                />

                                {shortScaleName && (
                                  <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[95px] leading-none mt-0.5">
                                    {shortScaleName}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===================================================================
            COLUMNA DERECHA (3 COLUMNAS)
        =================================================================== */}
        <div className="xl:col-span-3 flex flex-col gap-3 print:hidden">
          {isEditingActive ? (
            <>
              {/* 1° ARRIBA DEL TODO: PANEL DE EDICIÓN DE COMPÁS */}
              <div className="bg-[#0e1017] border border-[#f25100]/60 rounded-2xl p-4 flex flex-col gap-3.5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#1c1f2b] pb-2.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                    <Pencil size={13} className="text-[#f25100]" />
                    <span>
                      {isEs ? "Edición de Compás" : "Measure Editor"}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-[#f25100] bg-[#f25100]/10 px-2 py-0.5 rounded-md border border-[#f25100]/30">
                      Compás #{(selectedMeasureIndex ?? 0) + 1} · Slot{" "}
                      {(selectedChordSlotIndex ?? 0) + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditMode(false)}
                      className="w-6 h-6 rounded-lg bg-[#161924] hover:bg-[#f25100] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      title={
                        isEs
                          ? "Cerrar herramienta de edición"
                          : "Close editor tool"
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Input de Acorde Actual + Aplicar */}
                <div
                  className="flex items-center gap-2 bg-[#141722] border border-[#f25100] rounded-xl p-1.5 relative"
                  ref={quickChordInputRef}
                >
                  <input
                    type="text"
                    value={quickChordInput}
                    onChange={(e) => {
                      setQuickChordInput(e.target.value);
                      setIsQuickChordDropdownOpen(true);
                    }}
                    onFocus={() => setIsQuickChordDropdownOpen(true)}
                    onClick={() => setIsQuickChordDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setIsQuickChordDropdownOpen(false);
                        if (selectedMeasureIndex !== null) {
                          handleUpdateChordName(
                            selectedMeasureIndex,
                            selectedChordSlotIndex,
                            quickChordInput
                          );
                        }
                      }
                    }}
                    placeholder="Ej: Am7, D7, Gmaj7..."
                    className="flex-1 bg-transparent text-sm font-mono font-black text-white placeholder-zinc-500 outline-none px-2"
                  />

                  {isQuickChordDropdownOpen &&
                    quickChordSuggestions.length > 0 && (
                      <ul className="absolute top-[108%] left-0 right-0 z-50 bg-[#141722] border border-[#2a2d3d] rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-[#1f2230]">
                        {quickChordSuggestions.map((suggestion) => (
                          <li
                            key={suggestion.chord}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuickChordInput(suggestion.chord);
                              setIsQuickChordDropdownOpen(false);
                              if (selectedMeasureIndex !== null) {
                                handleUpdateChordName(
                                  selectedMeasureIndex,
                                  selectedChordSlotIndex,
                                  suggestion.chord
                                );
                              }
                            }}
                            className="hover:bg-[#f25100] hover:text-white px-3 py-2 cursor-pointer font-mono transition-colors text-zinc-200 flex items-center justify-between gap-2"
                          >
                            <span className="text-xs font-bold">
                              {suggestion.chord}
                            </span>
                            {suggestion.label && (
                              <span className="text-[10px] opacity-80 font-sans truncate">
                                {suggestion.label}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickChordDropdownOpen(false);
                      if (selectedMeasureIndex !== null) {
                        handleUpdateChordName(
                          selectedMeasureIndex,
                          selectedChordSlotIndex,
                          quickChordInput
                        );
                      }
                    }}
                    className="bg-[#f25100] hover:bg-[#ff621a] text-white font-extrabold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer shrink-0"
                  >
                    {isEs ? "Aplicar →" : "Apply →"}
                  </button>
                </div>

                {/* Ritmo Armónico (1 Slot, 2 Slots, 4 Slots) + % Repetir */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                      {isEs ? "Ritmo Armónico (Slots)" : "Harmonic Rhythm"}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          selectedMeasure?.chords?.[
                            selectedChordSlotIndex ?? 0
                          ] === "%" || selectedMeasure?.chords?.[0] === "%"
                        )}
                        onChange={(e) => {
                          if (selectedMeasureIndex !== null) {
                            const slot = selectedChordSlotIndex ?? 0;
                            const newVal = e.target.checked ? "%" : "";
                            setQuickChordInput(newVal);
                            handleUpdateChordName(
                              selectedMeasureIndex,
                              slot,
                              newVal
                            );
                          }
                        }}
                        className="w-3.5 h-3.5 rounded accent-[#f25100] cursor-pointer"
                      />
                      <span className="font-mono text-[11px]">% Repetir</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetMeasureSubdivision(1)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex flex-col items-center ${
                        (selectedMeasure?.chords?.length || 1) <= 1
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      <span>1 Slot</span>
                      <span className="text-[9px] opacity-80">Redonda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetMeasureSubdivision(2)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex flex-col items-center ${
                        (selectedMeasure?.chords?.length || 1) === 2
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      <span>2 Slots</span>
                      <span className="text-[9px] opacity-80">Blancas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetMeasureSubdivision(4)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex flex-col items-center ${
                        (selectedMeasure?.chords?.length || 1) >= 3
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      <span>4 Slots</span>
                      <span className="text-[9px] opacity-80">Negras</span>
                    </button>
                  </div>
                </div>

                {/* Barras de Repetición y Casillas */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                    {isEs ? "Barras y Casillas" : "Repeats & Voltas"}
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleRepeatStart(selectedMeasureIndex ?? 0)
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                        selectedMeasure?.repeatStart
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      |: Inicio
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleRepeatEnd(selectedMeasureIndex ?? 0)
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                        selectedMeasure?.repeatEnd
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      Fin :|
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleVolta(selectedMeasureIndex ?? 0, 1)
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                        selectedMeasure?.volta === 1
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      1.
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleVolta(selectedMeasureIndex ?? 0, 2)
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                        selectedMeasure?.volta === 2
                          ? "bg-[#f25100] text-white"
                          : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                      }`}
                    >
                      2.
                    </button>
                  </div>
                </div>

                {/* Estructura y Compases */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                    {isEs ? "Estructura y Compases" : "Sections & Measures"}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["A", "B", "C", "Intro", "Coda"] as const).map((sec) => {
                      const isSecActive =
                        selectedMeasure?.sectionLabel === `[${sec}]`;
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => handleToggleSection(sec)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                            isSecActive
                              ? "bg-[#f25100] text-white"
                              : "bg-[#141722] text-zinc-300 hover:text-white border border-[#262a3b]"
                          }`}
                        >
                          {sec}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleAddMeasureAfter(selectedMeasureIndex ?? 0)
                      }
                      className="h-8 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] text-xs font-bold text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={13} className="text-[#f25100]" />
                      <span>{isEs ? "Añadir Compás" : "Add Measure"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteMeasure(selectedMeasureIndex ?? 0)
                      }
                      className="h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-400 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>{isEs ? "Borrar Compás" : "Delete Measure"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2° DEBAJO DEL EDITOR: TARJETA HERRAMIENTAS COMPACTA */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Wrench size={13} className="text-[#f25100]" />
                    <span>{isEs ? "Herramientas" : "Tools"}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#f25100]">
                    {isEs ? "Modo Edición Activo" : "Edit Mode Active"}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(false)}
                    title={isEs ? "Cerrar Modo Edición" : "Close Edit Mode"}
                    className="h-9 rounded-xl bg-[#f25100] text-white border border-[#ff7433] shadow-[0_0_12px_rgba(242,81,0,0.4)] flex items-center justify-center cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMixerModalOpen(true)}
                    title={isEs ? "Abrir Mixer" : "Open Mixer"}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center cursor-pointer"
                  >
                    <Sliders size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTranspose(1)}
                    title={isEs ? "Transponer +1 semitono" : "Transpose +1"}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center cursor-pointer"
                  >
                    <ArrowUpDown size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetTranspose}
                    title={isEs ? "Restablecer Tonalidad" : "Reset Key"}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center cursor-pointer"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* MODO VISTA / REPRODUCCIÓN NORMAL */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Play size={12} className="text-[#f25100] fill-current" />
                    <span>{isEs ? "Reproducción" : "Playback"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMixerModalOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#141722] hover:bg-[#1c2030] border border-[#f25100]/50 text-[10px] font-extrabold text-[#f25100] flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders size={11} />
                    <span>MIXER</span>
                  </button>
                </div>

                {/* Selector de Estilo Depurado */}
                <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-3">
                  <Music size={13} className="text-[#f25100] mr-2 shrink-0" />
                  <select
                    value={selectedStyleLabel}
                    onChange={(e) => handleSelectStyleOption(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-white appearance-none outline-none pr-5 cursor-pointer"
                  >
                    {renderStyleOptions()}
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2.5 text-zinc-400 pointer-events-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex items-center justify-between bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2">
                    <Gauge size={12} className="text-zinc-400" />
                    <span className="text-xs font-mono font-bold text-white">
                      {currentSong.tempo}
                    </span>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => handleBpmDelta(2)}
                        className="text-[8px] text-zinc-400 hover:text-white leading-none cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBpmDelta(-2)}
                        className="text-[8px] text-zinc-400 hover:text-white leading-none cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Selector Veces (3x) en tarjeta lateral */}
                  <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2">
                    <Repeat size={12} className="text-[#f25100] mr-1 shrink-0" />
                    <select
                      value={totalChoruses}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 3;
                        setTotalChoruses(val);
                        totalChorusesRef.current = val;
                      }}
                      className="w-full bg-transparent text-xs font-mono font-bold text-white appearance-none outline-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                        <option key={num} value={num} className="bg-[#141722]">
                          {num}x
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={11}
                      className="absolute right-1.5 text-zinc-400 pointer-events-none"
                    />
                  </div>

                  <div className="relative flex items-center bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2">
                    <select
                      value={currentSong.timeSignature || "4/4"}
                      onChange={(e) => {
                        const newSong = {
                          ...currentSong,
                          isCustom: true,
                          timeSignature: e.target.value,
                        };
                        setAllSongs((prev) =>
                          prev.map((s) =>
                            s.id === currentSong.id ? newSong : s
                          )
                        );
                      }}
                      className="w-full bg-transparent text-xs font-mono font-bold text-white appearance-none outline-none cursor-pointer"
                    >
                      <option value="4/4" className="bg-[#141722]">
                        4/4
                      </option>
                      <option value="3/4" className="bg-[#141722]">
                        3/4
                      </option>
                      <option value="6/8" className="bg-[#141722]">
                        6/8
                      </option>
                      <option value="12/8" className="bg-[#141722]">
                        12/8
                      </option>
                    </select>
                    <ChevronDown
                      size={11}
                      className="absolute right-1.5 text-zinc-400 pointer-events-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-0.5">
                  <Volume2 size={15} className="text-zinc-400 shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={masterVolPct}
                    onChange={(e) =>
                      handleMasterVolChange(Number(e.target.value))
                    }
                    className="w-full accent-[#f25100] h-1.5 cursor-pointer"
                  />
                </div>
              </div>

              {/* TARJETA 2: HERRAMIENTAS */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Wrench size={13} className="text-[#f25100]" />
                    <span>{isEs ? "Herramientas" : "Tools"}</span>
                  </span>
                  <ChevronRight size={14} className="text-zinc-500" />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    title={
                      isEs
                        ? "Activar Modo Edición (Acordes, Slots, Casillas)"
                        : "Enable Edit Mode"
                    }
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMixerModalOpen(true)}
                    title={
                      isEs
                        ? "Abrir Mixer de Instrumentos"
                        : "Open Instrument Mixer"
                    }
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Sliders size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTranspose(1)}
                    title={
                      isEs ? "Transponer +1 semitono" : "Transpose +1 semitone"
                    }
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ArrowUpDown size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetTranspose}
                    title={isEs ? "Restablecer Tonalidad" : "Reset Key"}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>

              {/* TARJETA 3: ESTRUCTURA */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <LayoutGrid size={13} className="text-[#f25100]" />
                    <span>{isEs ? "Estructura" : "Structure"}</span>
                  </span>
                  <ChevronLeft size={14} className="text-zinc-500" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["A", "B", "C"] as const).map((sec) => {
                    const currentSec =
                      extractCleanSectionBadge(
                        currentSong.measures?.[selectedMeasureIndex ?? 0]
                          ?.sectionLabel,
                        ""
                      ) === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleToggleSection(sec)}
                        className={`h-9 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer ${
                          currentSec
                            ? "bg-[#f25100]/20 text-white border-[#f25100]"
                            : "bg-[#141722] text-zinc-300 hover:text-white border-[#262a3b]"
                        }`}
                      >
                        {sec}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between bg-[#141722] border border-[#262a3b] rounded-xl h-9 px-2">
                  <button
                    type="button"
                    disabled={measurePageOffset === 0}
                    onClick={() =>
                      setMeasurePageOffset((p) => Math.max(0, p - 32))
                    }
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {measurePageOffset + 1} –{" "}
                    {Math.min(totalMeasures, measurePageOffset + 32)}
                  </span>
                  <button
                    type="button"
                    disabled={measurePageOffset + 32 >= totalMeasures}
                    onClick={() =>
                      setMeasurePageOffset((p) =>
                        p + 32 < totalMeasures ? p + 32 : p
                      )
                    }
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              {/* TARJETA 4: VISTA */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Eye size={13} className="text-[#f25100]" />
                    <span>{isEs ? "Vista" : "View"}</span>
                  </span>
                  <ChevronRight size={14} className="text-zinc-500" />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAnalysis(!showAnalysis)}
                    title={isEs ? "Análisis de Grados" : "Degree Analysis"}
                    className={`h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                      showAnalysis
                        ? "bg-[#f25100]/20 text-[#f25100] border-[#f25100]"
                        : "bg-[#141722] text-zinc-300 hover:text-white border-[#262a3b]"
                    }`}
                  >
                    <BarChart2 size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowChordModal(true)}
                    title={isEs ? "Ver Acorde en Teclado" : "View Chord"}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Piano size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScalesInCells(!showScalesInCells)}
                    title={isEs ? "Mostrar Escalas en Compases" : "Show Scales"}
                    className={`h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                      showScalesInCells
                        ? "bg-[#f25100]/20 text-[#f25100] border-[#f25100]"
                        : "bg-[#141722] text-zinc-300 hover:text-white border-[#262a3b]"
                    }`}
                  >
                    <Music size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScaleModal(true)}
                    title={
                      isEs ? "Ver Diagrama de Escala" : "View Scale Diagram"
                    }
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] text-zinc-300 hover:text-white border border-[#262a3b] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <LayoutGrid size={15} />
                  </button>
                </div>
              </div>

              {/* TARJETA 5: EXPORTAR */}
              <div className="bg-[#0e1017] border border-[#1c1f2b] rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Upload size={13} className="text-[#f25100]" />
                    <span>{isEs ? "Exportar" : "Export"}</span>
                  </span>
                  <ChevronRight size={14} className="text-zinc-500" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadDirectPDF}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileText size={14} className="text-zinc-300" />
                    <span>PDF</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExportingWav}
                    onClick={() => handleExportWav("wav")}
                    className="h-9 rounded-xl bg-[#141722] hover:bg-[#1c2030] border border-[#262a3b] hover:border-[#f25100] text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isExportingWav ? (
                      <Loader2
                        size={14}
                        className="animate-spin text-[#f25100]"
                      />
                    ) : (
                      <BarChart2 size={14} className="text-zinc-300" />
                    )}
                    <span>WAV</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
          MODAL LIMPIO DE CONFIRMACIÓN PARA ELIMINAR HOJA EN BLANCO
      ===================================================================== */}
      {isDeleteSongModalOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsDeleteSongModalOpen(false)}
        >
          <div
            className="bg-[#111217] border border-[#262a3b] rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isEs ? "Eliminar Progresión" : "Delete Progression"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {isEs
                    ? `¿Deseas eliminar "${currentSong.title}"?`
                    : `Are you sure you want to delete "${currentSong.title}"?`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsDeleteSongModalOpen(false)}
                className="h-10 rounded-xl bg-[#161924] hover:bg-[#1f2433] border border-[#262a3b] text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
              >
                {isEs ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleDeleteCurrentCustomSong}
                className="h-10 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-extrabold text-white cursor-pointer"
              >
                {isEs ? "Sí, Eliminar" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CONSOLA MIXER Y SONIDOS HD DE BANDA
      ===================================================================== */}
      {isMixerModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsMixerModalOpen(false)}
        >
          <div
            className="bg-[#111217] border border-[#262a3b] rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1f2230] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#f25100] text-white flex items-center justify-center font-bold shadow-[0_0_14px_rgba(242,81,0,0.4)]">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isEs
                      ? "Mixer y Sonidos HD de Banda"
                      : "Live Band Mixer & HD Sounds"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {isEs
                      ? "Elige el timbre HD y controla el volumen, Mute y Solo"
                      : "Select HD timbre and control volume, Mute & Solo"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMixerModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#161720] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* SELECTORES DE TIMBRES HD (ARMONÍA, BAJO Y BATERÍA) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  {instrument === "guitar" && styleAllowsGuitar
                    ? isEs
                      ? "Guitarra Acústica HD"
                      : "HD Acoustic Guitar"
                    : isEs
                    ? "Timbre de Teclado HD"
                    : "HD Keyboard Sound"}
                </label>
                <select
                  value={selectedHarmonyPreset}
                  onChange={(e) => {
                    const val = e.target.value as HarmonyVoicePresetId;
                    setSelectedHarmonyPreset(val);
                    interactiveAnalysisAudio.setHarmonyPreset(val);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#161924] border border-[#262a3b] focus:border-[#f25100] text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {HARMONY_VOICE_PRESETS.filter((p) =>
                    instrument === "guitar" && styleAllowsGuitar
                      ? p.category === "guitar"
                      : p.category === "piano"
                  ).map((preset) => (
                    <option
                      key={preset.id}
                      value={preset.id}
                      className="bg-[#111217] text-white"
                    >
                      {isEs ? preset.labelEs : preset.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  {isEs ? "Timbre de Bajo HD" : "HD Bass Sound"}
                </label>
                <select
                  value={selectedBassPreset}
                  onChange={(e) => {
                    const val = e.target.value as BassVoicePresetId;
                    setSelectedBassPreset(val);
                    interactiveAnalysisAudio.setBassPreset(val);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#161924] border border-[#262a3b] focus:border-[#f25100] text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {BASS_VOICE_PRESETS.map((preset) => (
                    <option
                      key={preset.id}
                      value={preset.id}
                      className="bg-[#111217] text-white"
                    >
                      {isEs ? preset.labelEs : preset.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  {isEs
                    ? "Kit de Batería HD (Auto-ajustable por estilo)"
                    : "HD Drum Kit"}
                </label>
                <select
                  value={selectedDrumKitPreset}
                  onChange={(e) => {
                    const val = e.target.value as DrumKitPresetId;
                    setSelectedDrumKitPreset(val);
                    interactiveAnalysisAudio.setDrumKitPreset(val);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#161924] border border-[#262a3b] focus:border-[#f25100] text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {DRUM_KIT_PRESETS.map((kit) => (
                    <option
                      key={kit.id}
                      value={kit.id}
                      className="bg-[#111217] text-white"
                    >
                      {isEs ? kit.labelEs : kit.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {(
                [
                  {
                    id: "harmony",
                    name:
                      instrument === "piano" || !styleAllowsGuitar
                        ? isEs
                          ? "Piano / Teclado HD"
                          : "HD Keyboard"
                        : isEs
                        ? "Guitarra Acústica HD"
                        : "HD Acoustic Guitar",
                    vol: mixerChannels.harmonyVol,
                    muted: mixerChannels.harmonyMuted,
                    solo: mixerChannels.harmonySolo,
                  },
                  {
                    id: "bass",
                    name: isEs ? "Bajo / Contrabajo HD" : "HD Bass",
                    vol: mixerChannels.bassVol,
                    muted: mixerChannels.bassMuted,
                    solo: mixerChannels.bassSolo,
                  },
                  {
                    id: "drums",
                    name: isEs
                      ? `Batería (${selectedStyleLabel})`
                      : `Drums (${selectedStyleLabel})`,
                    vol: mixerChannels.drumsVol,
                    muted: mixerChannels.drumsMuted,
                    solo: mixerChannels.drumsSolo,
                  },
                ] as const
              ).map((ch) => (
                <div
                  key={ch.id}
                  className="bg-[#161924] border border-[#262a3b] rounded-xl p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                      {ch.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleMixerChannelMute(ch.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold border transition-colors cursor-pointer ${
                          ch.muted
                            ? "bg-red-500 text-white border-red-400"
                            : "bg-[#10121a] text-zinc-400 hover:text-white border-[#262a3b]"
                        }`}
                      >
                        MUTE
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMixerChannelSolo(ch.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold border transition-colors cursor-pointer ${
                          ch.solo
                            ? "bg-[#f25100] text-white border-[#ff7433]"
                            : "bg-[#10121a] text-zinc-400 hover:text-white border-[#262a3b]"
                        }`}
                      >
                        SOLO
                      </button>
                      <span className="text-xs font-mono font-bold text-[#f25100] w-10 text-right">
                        {ch.muted ? "0%" : `${ch.vol}%`}
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={ch.muted ? 0 : ch.vol}
                    onInput={(e) =>
                      updateMixerChannelVol(
                        ch.id,
                        Number((e.target as HTMLInputElement).value)
                      )
                    }
                    onChange={(e) =>
                      updateMixerChannelVol(ch.id, Number(e.target.value))
                    }
                    className="w-full accent-[#f25100] h-2 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsMixerModalOpen(false)}
              className="w-full h-10 rounded-xl bg-[#f25100] hover:bg-[#ff621a] text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer"
            >
              {isEs ? "Listo" : "Done"}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL NUEVA HOJA EN BLANCO
      ===================================================================== */}
      {isNewSheetModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsNewSheetModalOpen(false)}
        >
          <div
            className="bg-[#111217] border border-[#262a3b] rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1f2230] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#f25100] text-white flex items-center justify-center font-bold">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isEs ? "Nueva Hoja en Blanco" : "New Blank Sheet"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {isEs
                      ? "Elige cuántos compases quieres componer o enseñar"
                      : "Choose how many measures to compose or teach"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewSheetModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#161720] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">
                {isEs ? "Título de la Progresión" : "Progression Title"}
              </label>
              <input
                type="text"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#161720] border border-[#262a3b] focus:border-[#f25100] text-sm font-bold text-white outline-none"
                placeholder="Ej: Ejercicio II-V-I, Blues en Fa..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-zinc-300">
                {isEs ? "Cantidad de Compases" : "Number of Measures"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 4, label: "4 Compases" },
                  { count: 8, label: "8 Compases" },
                  { count: 12, label: "12 (Blues)" },
                  { count: 16, label: "16 Compases" },
                  { count: 24, label: "24 Compases" },
                  { count: 32, label: "32 (Estándar)" },
                ].map((opt) => (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => setNewSheetMeasuresCount(opt.count)}
                    className={`py-2 px-2.5 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer ${
                      newSheetMeasuresCount === opt.count
                        ? "bg-[#f25100] text-white border-[#ff7433]"
                        : "bg-[#161722] text-zinc-300 hover:text-white border-[#262a3b]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-300">
                {isEs ? "Estilo Musical" : "Musical Style"}
              </label>
              <select
                value={newSheetStyle}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewSheetStyle(val);
                  if (val === "Vals Criollo") {
                    setNewSheetTimeSig("3/4");
                  }
                }}
                className="h-10 px-3 rounded-xl bg-[#161720] border border-[#262a3b] text-sm font-bold text-white outline-none cursor-pointer"
              >
                {STYLE_CATEGORIES_CATALOG.map((cat) => (
                  <optgroup
                    key={`new-st-${cat.groupEs}`}
                    label={isEs ? cat.groupEs : cat.groupEn}
                    className="bg-[#0c0e14] text-[#f25100] font-bold"
                  >
                    {cat.styles.map((st) => (
                      <option
                        key={st.value}
                        value={st.value}
                        className="bg-[#161720] text-white font-normal"
                      >
                        {isEs ? st.labelEs : st.labelEn}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">
                  {isEs ? "Tonalidad (Mayor / Menor)" : "Key (Major / Minor)"}
                </label>
                <select
                  value={newSheetKey}
                  onChange={(e) => setNewSheetKey(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-[#161720] border border-[#262a3b] text-sm font-mono font-bold text-white outline-none cursor-pointer"
                >
                  <optgroup
                    label={isEs ? "Mayores" : "Major Keys"}
                    className="bg-[#0c0e14] text-[#f25100] font-bold"
                  >
                    {MAJOR_KEYS_LIST.map((k) => (
                      <option
                        key={`new-maj-${k.value}`}
                        value={k.value}
                        className="bg-[#161720] text-white font-normal"
                      >
                        {isEs ? k.labelEs : k.labelEn}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup
                    label={isEs ? "Menores" : "Minor Keys"}
                    className="bg-[#0c0e14] text-[#f25100] font-bold"
                  >
                    {MINOR_KEYS_LIST.map((k) => (
                      <option
                        key={`new-min-${k.value}`}
                        value={k.value}
                        className="bg-[#161720] text-white font-normal"
                      >
                        {isEs ? k.labelEs : k.labelEn}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">
                  {isEs ? "Compás (Métrica)" : "Time Signature"}
                </label>
                <select
                  value={newSheetTimeSig}
                  onChange={(e) => setNewSheetTimeSig(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-[#161720] border border-[#262a3b] text-sm font-mono font-bold text-white outline-none cursor-pointer"
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="12/8">12/8</option>
                  <option value="2/4">2/4</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmCreateNewSheet}
              className="w-full h-11 mt-1 rounded-xl bg-[#f25100] hover:bg-[#ff621a] text-white font-extrabold text-sm uppercase tracking-wider shadow-[0_0_18px_rgba(242,81,0,0.4)] transition-colors cursor-pointer"
            >
              {isEs
                ? `Crear Hoja de ${newSheetMeasuresCount} Compases`
                : `Create ${newSheetMeasuresCount}-Bar Sheet`}
            </button>
          </div>
        </div>
      )}

      {/* POPOVER PARA EDITAR GRADOS ROMANOS */}
      {isEditingActive && editingCell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditingCell(null)}
        >
          <div
            className="bg-[#111217] border border-[#252736] rounded-2xl p-4 w-72 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[#1f2230] pb-2">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Pencil size={14} className="text-[#f25100]" />
                <span>Editar Grado Armónico</span>
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase font-bold mb-1 block">
                  Grado Romano
                </label>
                <input
                  type="text"
                  value={editingCell.numeral}
                  onChange={(e) =>
                    setEditingCell({ ...editingCell, numeral: e.target.value })
                  }
                  className="w-full bg-[#090a0d] border border-[#252736] rounded-lg p-2 text-sm text-white focus:border-[#f25100] outline-none"
                  placeholder="Ej: ii, V7, V7/vi"
                />
              </div>
            </div>

            <button
              onClick={() => {
                setCustomAnalyses((prev) => ({
                  ...prev,
                  [editingCell.key]: {
                    numeral: editingCell.numeral,
                    category: editingCell.category,
                    groupWithNext: editingCell.groupWithNext,
                  },
                }));
                setEditingCell(null);
              }}
              className="w-full bg-[#f25100] hover:bg-[#ff621a] text-white font-bold py-2 rounded-xl transition flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <Save size={14} />
              <span>Guardar Grado</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE EXPORTACIÓN Y GESTIÓN DE PROYECTO */}
      {isExportModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden"
          onClick={() => setIsExportModalOpen(false)}
        >
          <div
            className="bg-[#111217] border border-[#252736] rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1f2230]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#f25100]/15 border border-[#f25100]/40 flex items-center justify-center text-[#f25100]">
                  <Download size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Exportar / Gestionar Sesión
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    PDF, MIDI, WAV, MP3, Guardar o Cargar (.linus)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#161720] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 mt-4">
              <button
                type="button"
                onClick={handleDownloadDirectPDF}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-sky-400 shrink-0">
                  <FileText size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Exportar Partitura de Acordes (.PDF)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Lead Sheet estilo Real Book listo para imprimir
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={handleExportMidi}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-[#f25100] shrink-0">
                  <Music size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Exportar Secuencia MIDI (.MID)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Voicings de jazz y línea de bajo para cualquier DAW
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={isExportingWav}
                onClick={() => handleExportWav("wav")}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-amber-400 shrink-0">
                  <BarChart2 size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Exportar Audio Master (.WAV)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Mezcla estéreo en calidad de estudio
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={isExportingWav}
                onClick={() => handleExportWav("mp3")}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-purple-400 shrink-0">
                  <Music size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Exportar Pista de Práctica (.MP3)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Pista de acompañamiento lista para compartir
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  handleExportSession();
                  triggerExportToast(
                    "Sesión (.linus) guardada correctamente."
                  );
                }}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-emerald-400 shrink-0">
                  <Save size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Guardar Proyecto Editable (.LINUS)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Guarda tu canción para seguir editándola después
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  handleTriggerFileInput();
                }}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[#161720] hover:bg-[#1d1f2b] border border-[#252736] hover:border-[#f25100] text-left transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#101117] border border-[#252736] flex items-center justify-center text-amber-400 shrink-0">
                  <FolderOpen size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-white">
                    Abrir / Cargar Sesión (.LINUS)
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    Carga una progresión guardada desde tu equipo
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISUALIZADOR DE ACORDE */}
      {showChordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowChordModal(false)}
        >
          <div
            className="bg-[#111217] border border-[#252736] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1f2230] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f25100] text-white flex items-center justify-center font-bold">
                  <Piano size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Visualizador de Acorde
                    {effectiveChordDetails && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[#f25100] text-white font-mono font-bold">
                        {effectiveChordString}
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowChordModal(false)}
                className="w-8 h-8 rounded-lg bg-[#161720] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="w-full flex flex-col items-center justify-center py-1">
              {effectiveChordDetails ? (
                instrument === "piano" ? (
                  <ChordPianoKeyboard
                    root={effectiveChordDetails.root}
                    type={effectiveChordDetails.type}
                    voicing={effectiveChordDetails.voicing}
                    title={effectiveChordDetails.suffix}
                    subtitle={`Acorde: ${effectiveChordString}`}
                  />
                ) : (
                  <ChordFretboard
                    root={effectiveChordDetails.root}
                    type={effectiveChordDetails.type}
                    voicing={effectiveChordDetails.voicing}
                    title={effectiveChordDetails.suffix}
                    subtitle={`Acorde: ${effectiveChordString}`}
                  />
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISUALIZADOR DE ESCALA */}
      {showScaleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowScaleModal(false)}
        >
          <div
            className="bg-[#111217] border border-[#252736] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1f2230] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f25100] text-white flex items-center justify-center font-bold">
                  <Eye size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Escala Recomendada
                    {effectiveChordDetails?.suggestedScale && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[#161720] border border-[#f25100]/50 text-[#f25100] font-mono font-bold">
                        {effectiveChordDetails.suggestedScale.name}
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowScaleModal(false)}
                className="w-8 h-8 rounded-lg bg-[#161720] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="w-full flex flex-col items-center justify-center py-1">
              {effectiveChordDetails?.suggestedScale ? (
                instrument === "piano" ? (
                  <ScalePianoKeyboard
                    scaleName={effectiveChordDetails.suggestedScale.name}
                    notes={effectiveChordDetails.suggestedScale.notes}
                    root={effectiveChordDetails.root}
                    chordString={effectiveChordString}
                  />
                ) : (
                  <ScaleFretboard
                    scaleName={effectiveChordDetails.suggestedScale.name}
                    notes={effectiveChordDetails.suggestedScale.notes}
                    root={effectiveChordDetails.root}
                    chordString={effectiveChordString}
                  />
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Toast de Exportación */}
      {exportToastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#111217] border border-[#f25100] text-white px-4 py-3 rounded-xl shadow-2xl print:hidden">
          <div className="w-2 h-2 rounded-full bg-[#f25100] animate-pulse shrink-0" />
          <span className="text-xs font-bold">{exportToastMessage}</span>
          <button
            type="button"
            onClick={() => setExportToastMessage(null)}
            className="text-zinc-400 hover:text-white ml-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".linus,.json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}