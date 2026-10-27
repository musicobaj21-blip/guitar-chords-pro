import { useState, useEffect, useMemo } from "react";
import { RootNote, ChordTypeOptions } from "../types";
import {
  CHORD_DEFINITIONS,
  ROOT_DISPLAY_NAME_MAP,
  getGuitarChordVoicings,
  getGuitarChordFrequencies,
  CHORD_GROUPS,
} from "../data/chords";
import ChordFretboard from "./ChordFretboard";
import {
  KeyboardVoicingMode,
  resolveKeyboardVoicingData,
} from "./ChordPianoKeyboard";
import {
  Search,
  Music,
  GraduationCap,
  Layers,
  GitCommit,
  Radio,
  ChevronDown,
} from "lucide-react";
import {
  dictionaryAudio,
  GUITAR_INSTRUMENTS,
  GuitarInstrumentId,
} from "../utils/dictionaryAudio";
import { useLanguage } from "../contexts/LanguageContext";

interface ChordDictionaryProps {
  defaultRoot?: RootNote;
  defaultType?: ChordTypeOptions;
  hideControls?: boolean;
  hideTitle?: boolean;
  forceBaseFret?: number;
  onPlay?: () => void;
  playLabel?: string;
  voicingMode?: KeyboardVoicingMode;
  onVoicingModeChange?: (mode: KeyboardVoicingMode) => void;
  isExpanded?: boolean;
}

type GuitarVoicingMode =
  | "standard"
  | "drop2"
  | "drop3"
  | "triad_inversions"
  | "jazz_voicings";

const ROOT_SEMITONES: Record<RootNote, number> = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};

const STRING_OPEN_MIDI = [40, 45, 50, 55, 59, 64];

const DIM_TRIAD_DEFINITION = {
  symbol: "dim",
  suffix: "Disminuido (Tríada)",
  chordFormula: "1-b3-b5",
  intervals: [0, 3, 6],
};

if (CHORD_DEFINITIONS && !(CHORD_DEFINITIONS as any)["dim"]) {
  (CHORD_DEFINITIONS as any)["dim"] = DIM_TRIAD_DEFINITION;
}

function detectBassStringFromFrets(frets: number[], fallbackLabel?: string): number {
  if (Array.isArray(frets) && frets.length === 6) {
    for (let i = 0; i < 6; i++) {
      if (frets[i] !== undefined && frets[i] >= 0) {
        return 6 - i;
      }
    }
  }
  if (fallbackLabel) {
    const match = fallbackLabel.match(/R([1-6])/i);
    if (match) return Number(match[1]);
  }
  return 6;
}

export function transposeCShapeFrets(cFrets: number[], root: RootNote): number[] {
  const offset = ROOT_SEMITONES[root] ?? 0;
  let shifted = cFrets.map((f) => (f < 0 ? -1 : f + offset));

  const active = shifted.filter((f) => f > 0);
  if (active.length === 0) return shifted;

  const minFret = Math.min(...active);
  const maxFret = Math.max(...active);

  if (
    (minFret > 10 || maxFret > 14) &&
    shifted.every((f) => f < 0 || f - 12 >= 1)
  ) {
    shifted = shifted.map((f) => (f < 0 ? -1 : f - 12));
  }

  return shifted;
}

/**
 * Motor Biomecánico Real de Guitarra:
 * - Reconoce Shapes Clásicos, Cejillas en Drop 2 / Drop 3 y Posturas de Jazz.
 */
export function computeGuitarErgonomicGrip(frets: number[]): {
  fingers: number[];
  barres: { fret: number; fromString: number; toString: number }[];
} {
  const fingers = [0, 0, 0, 0, 0, 0];
  const barres: { fret: number; fromString: number; toString: number }[] = [];

  const activeFrets = frets.filter((f) => f > 0);
  if (activeFrets.length === 0) return { fingers, barres };

  const minFret = Math.min(...activeFrets);
  const maxFret = Math.max(...activeFrets);
  const spanFrets = maxFret - minFret;

  const rel = frets.map((f) => (f > 0 ? f - minFret : -1));
  const sig = rel.join(",");

  // =========================================================================
  // 1. SHAPES ESPECÍFICOS DE GUITARRA CORREGIDOS AL DETALLE
  // =========================================================================

  // Cmaj13 R5 sin 5ª (x - 3 - x - 4 - 5 - 5) -> Do=1, Si=2, Mi=3, La=4
  if (sig === "-1,0,-1,1,2,2") {
    return { fingers: [0, 1, 0, 2, 3, 4], barres: [] };
  }

  // C6 R5 sin 5ª (x - 3 - x - 5 - 5 - 5) -> Do(5ª)=1, Do(3ª)=2, Mi(2ª)=3, La(1ª)=4
  if (sig === "-1,0,-1,2,2,2") {
    return { fingers: [0, 1, 0, 2, 3, 4], barres: [] };
  }

  // C6 R5 clásico (x - 3 - 2 - 2 - 1 - x) -> Mi(2ª)=1, La(3ª)=2, Mi(4ª)=3, Do(5ª)=4
  if (sig === "-1,2,1,1,0,-1") {
    return { fingers: [0, 4, 2, 3, 1, 0], barres: [] };
  }

  // C7sus4 R5 (x - 3 - 5 - 3 - 6 - x) -> Cejillo Dedo 1 (Do y Sib), Sol(4ª)=Dedo 3, Fa(2ª)=Dedo 4
  if (sig === "-1,0,2,0,3,-1") {
    return {
      fingers: [0, 1, 3, 1, 4, 0],
      barres: [{ fret: minFret, fromString: 5, toString: 3 }],
    };
  }

  // C7sus4 R5 con 1ª cuerda (x - 3 - 5 - 3 - 6 - 3) -> Cejillo Dedo 1 (5ª a 1ª), Sol(4ª)=Dedo 3, Fa(2ª)=Dedo 4
  if (sig === "-1,0,2,0,3,0") {
    return {
      fingers: [0, 1, 3, 1, 4, 1],
      barres: [{ fret: minFret, fromString: 5, toString: 1 }],
    };
  }

  // C7#11 R6 (8 - x - 8 - 9 - 7 - x) -> Do(6ª)=Dedo 2, Sib(4ª)=Dedo 3, Mi(3ª)=Dedo 4, Fa#(2ª)=Dedo 1
  if (sig === "1,-1,1,2,0,-1") {
    return { fingers: [2, 0, 3, 4, 1, 0], barres: [] };
  }

  // C7#11 R5 (x - 3 - 4 - 3 - 5 - x) -> Do(5ª)=1, Fa#(4ª)=3, Sib(3ª)=2, Mi(2ª)=4
  if (sig === "-1,0,1,0,2,-1") {
    return { fingers: [0, 1, 3, 2, 4, 0], barres: [] };
  }

  // C7#11 R6 Abierto / 9#11 (8 - x - 8 - 9 - 7 - 10)
  if (sig === "1,-1,1,2,0,3") {
    return { fingers: [2, 0, 3, 4, 1, 4], barres: [] };
  }

  // Cmaj7 R5 (x - 3 - 5 - 4 - 5 - x) -> Do=1, Sol=3, Si=2, Mi=4
  if (sig === "-1,0,2,1,2,-1") {
    return { fingers: [0, 1, 3, 2, 4, 0], barres: [] };
  }

  // Cmaj7 R6 (8 - x - 9 - 9 - 8 - x) -> Do=1, Si=3, Mi=4, Sol=2
  if (sig === "0,-1,1,1,0,-1") {
    return { fingers: [1, 0, 3, 4, 2, 0], barres: [] };
  }

  // Cmaj9 R6 con cejillo en 3 espacios (8 - 7 - 9 - 7 - x - x) -> Mi y Re=1 (cejillo), Do=2, Si=3
  if (sig === "1,0,2,0,-1,-1") {
    return {
      fingers: [2, 1, 3, 1, 0, 0],
      barres: [{ fret: minFret, fromString: 5, toString: 3 }],
    };
  }

  // Cm7 R4 (x - x - 10 - 12 - 11 - 11) -> Do=1, Sol=4, Sib=2, Mib=3
  if (sig === "-1,-1,0,2,1,1") {
    return { fingers: [0, 0, 1, 4, 2, 3], barres: [] };
  }

  // Cm7 R5 con Cejillo (x - 3 - 5 - 3 - 4 - 3) -> Cejillo Dedo 1 (5ª a 1ª), Sol=3, Mib=2
  if (sig === "-1,0,2,0,1,0") {
    return {
      fingers: [0, 1, 3, 1, 2, 1],
      barres: [{ fret: minFret, fromString: 5, toString: 1 }],
    };
  }

  // Cm7 R5 con 9ª o 5ª aguda en 1ª cuerda (x - 3 - 5 - 3 - 4 - 6) -> Cejillo 1, Sol=3, Mib=2, Sib=4
  if (sig === "-1,0,2,0,1,3") {
    return {
      fingers: [0, 1, 3, 1, 2, 4],
      barres: [{ fret: minFret, fromString: 5, toString: 3 }],
    };
  }

  // Cm7 R6 Jazz Shell (8 - x - 8 - 8 - 8 - x)
  if (sig === "0,-1,0,0,0,-1") {
    return {
      fingers: [1, 0, 1, 1, 1, 0],
      barres: [{ fret: minFret, fromString: 6, toString: 2 }],
    };
  }

  // Cm7 R6 completo con Cejillo (8 - 10 - 8 - 8 - 8 - 8)
  if (sig === "0,2,0,0,0,0") {
    return {
      fingers: [1, 3, 1, 1, 1, 1],
      barres: [{ fret: minFret, fromString: 6, toString: 1 }],
    };
  }

  // C7 R5 con Cejillo (x - 3 - 5 - 3 - 5 - 3)
  if (sig === "-1,0,2,0,2,0") {
    return {
      fingers: [0, 1, 3, 1, 4, 1],
      barres: [{ fret: minFret, fromString: 5, toString: 1 }],
    };
  }

  // C7 R6 con Cejillo (8 - 10 - 8 - 9 - 8 - 8)
  if (sig === "0,2,0,1,0,0") {
    return {
      fingers: [1, 3, 1, 2, 1, 1],
      barres: [{ fret: minFret, fromString: 6, toString: 1 }],
    };
  }
  if (sig === "0,-1,0,1,0,-1") {
    return {
      fingers: [1, 0, 2, 3, 4, 0],
      barres: [],
    };
  }

  // Cm(maj7) R5 (x - 3 - 5 - 4 - 4 - 3)
  if (sig === "-1,0,2,1,1,0") {
    return {
      fingers: [0, 1, 4, 2, 3, 1],
      barres: [{ fret: minFret, fromString: 5, toString: 1 }],
    };
  }

  // Cm7b5 R5 (x - 3 - 4 - 3 - 4 - x) -> Do=1, Solb=3, Sib=2, Mib=4
  if (sig === "-1,0,1,0,1,-1") {
    return { fingers: [0, 1, 3, 2, 4, 0], barres: [] };
  }

  // Cm7b5 R6 (8 - x - 8 - 8 - 7 - x)
  if (sig === "1,-1,1,1,0,-1") {
    return { fingers: [2, 0, 3, 4, 1, 0], barres: [] };
  }

  // Cdim7 (x - 3 - 4 - 2 - 4 - x)
  if (sig === "-1,1,2,0,2,-1") {
    return { fingers: [0, 2, 3, 1, 4, 0], barres: [] };
  }

  // Drop 2 con cejillo en 3 espacios (x - x - 1 - 3 - 1 - 3)
  if (sig === "-1,-1,0,2,0,2") {
    return {
      fingers: [0, 0, 1, 2, 1, 3],
      barres: [{ fret: minFret, fromString: 4, toString: 2 }],
    };
  }

  // Drop 3 con cejillo en 3 espacios (3 - x - 1 - 3 - 1 - x)
  if (sig === "2,-1,0,2,0,-1") {
    return {
      fingers: [2, 0, 1, 3, 1, 0],
      barres: [{ fret: minFret, fromString: 4, toString: 2 }],
    };
  }

  if (sig === "1,-1,0,1,0,-1") {
    return {
      fingers: [2, 0, 1, 3, 1, 0],
      barres: [{ fret: minFret, fromString: 4, toString: 2 }],
    };
  }

  // =========================================================================
  // 2. REGLA AUTOMÁTICA DE CEJILLO PARA ACORDES DE 3 ESPACIOS O MÁS
  // =========================================================================
  const stringsAtMinFret: number[] = [];
  const higherNotes: { sIdx: number; fret: number }[] = [];

  for (let s = 0; s < 6; s++) {
    if (frets[s] === minFret) {
      stringsAtMinFret.push(s);
    } else if (frets[s] > minFret) {
      higherNotes.push({ sIdx: s, fret: frets[s] });
    }
  }

  if (stringsAtMinFret.length >= 2 && higherNotes.length >= 1) {
    stringsAtMinFret.forEach((sIdx) => {
      fingers[sIdx] = 1;
    });

    const firstS = stringsAtMinFret[0];
    const lastS = stringsAtMinFret[stringsAtMinFret.length - 1];
    barres.push({
      fret: minFret,
      fromString: 6 - firstS,
      toString: 6 - lastS,
    });

    higherNotes.sort((a, b) =>
      a.fret !== b.fret ? a.fret - b.fret : a.sIdx - b.sIdx
    );

    if (higherNotes.length === 1) {
      const diff = higherNotes[0].fret - minFret;
      fingers[higherNotes[0].sIdx] = diff <= 1 ? 2 : spanFrets <= 2 ? 3 : 4;
    } else if (higherNotes.length === 2) {
      if (spanFrets <= 2) {
        fingers[higherNotes[0].sIdx] = 2;
        fingers[higherNotes[1].sIdx] = 3;
      } else {
        // Si la primera nota está a 2 trastes (como Sol en C7sus4: traste 5 sobre cejillo en 3), usar Dedo 3 y Dedo 4
        const firstDiff = higherNotes[0].fret - minFret;
        fingers[higherNotes[0].sIdx] = firstDiff >= 2 ? 3 : 2;
        fingers[higherNotes[1].sIdx] = 4;
      }
    } else {
      higherNotes.forEach((n, i) => {
        fingers[n.sIdx] = Math.min(4, i + 2);
      });
    }

    return { fingers, barres };
  }

  if (stringsAtMinFret.length >= 3 && higherNotes.length === 0) {
    stringsAtMinFret.forEach((sIdx) => {
      fingers[sIdx] = 1;
    });
    barres.push({
      fret: minFret,
      fromString: 6 - stringsAtMinFret[0],
      toString: 6 - stringsAtMinFret[stringsAtMinFret.length - 1],
    });
    return { fingers, barres };
  }

  // =========================================================================
  // 3. ASIGNACIÓN ERGONÓMICA SIN CEJILLO (1 sola nota en minFret)
  // =========================================================================
  const allFretted: { sIdx: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    if (frets[s] > 0) allFretted.push({ sIdx: s, fret: frets[s] });
  }

  allFretted.sort((a, b) =>
    a.fret !== b.fret ? a.fret - b.fret : a.sIdx - b.sIdx
  );

  if (allFretted.length === 3 && spanFrets <= 2) {
    allFretted.forEach((n, idx) => {
      fingers[n.sIdx] = idx + 1;
    });
  } else if (allFretted.length <= 4) {
    allFretted.forEach((n, idx) => {
      fingers[n.sIdx] = idx + 1;
    });
  } else {
    allFretted.forEach((n, idx) => {
      fingers[n.sIdx] = Math.min(4, idx + 1);
    });
  }

  return { fingers, barres };
}

/**
 * Normaliza y perfecciona los acordes Estándar según las correcciones de guitarra profesional:
 * - Cmaj13 Posición 2 (R5): Omite la 5ª (x - 3 - x - 4 - 5 - 5) -> Do=1, Si=2, Mi=3, La=4.
 * - C6 Posición 2 (R5): Omite la 5ª (x - 3 - x - 5 - 5 - 5) -> Do=1, Do=2, Mi=3, La=4.
 * - C7#11: Tiene 3 posiciones incluyendo la 3ª posición en R6 (8 - x - 8 - 9 - 7 - x) con Do=2, Sib=3, Mi=4, Fa#=1.
 * - Cm7 Posición 4: Diferente de la Posición 2.
 */
function buildPerfectedStandardVoicings(
  root: RootNote,
  type: ChordTypeOptions | string,
  isEs: boolean
) {
  const t = String(type);
  let rawList = getGuitarChordVoicings(root, type as ChordTypeOptions, false).slice(0, 4);

  // Si es 7#11, garantizar 3 posiciones reales incluyendo la 3ª posición con bajo en 6ª cuerda (8 - x - 8 - 9 - 7 - x)
  if (t === "7#11") {
    const pos1Frets = transposeCShapeFrets([-1, 3, 4, 3, 5, -1], root); // R5: Do(1) - Fa#(3) - Sib(2) - Mi(4)
    const pos2Frets = transposeCShapeFrets([8, -1, 8, 9, 7, -1], root); // R6 pedida: Do(2) - Sib(3) - Mi(4) - Fa#(1)
    const pos3Frets = transposeCShapeFrets([-1, -1, 10, 9, 7, 7], root); // R4: Do(4) - Mi(3) - Fa#(1) - Si/La(1)

    const custom7Sharp11 = [
      { frets: pos1Frets, label: "R5" },
      { frets: pos2Frets, label: "R6" },
      { frets: pos3Frets, label: "R4" },
    ];

    return custom7Sharp11.map((item, idx) => {
      const valid = item.frets.filter((f) => f > 0);
      const minFret = valid.length > 0 ? Math.min(...valid) : 1;
      const grip = computeGuitarErgonomicGrip(item.frets);
      const detectedBass = detectBassStringFromFrets(item.frets, item.label);

      return {
        frets: item.frets,
        fingers: grip.fingers,
        barres: grip.barres,
        baseFret: minFret,
        bassString: detectedBass,
        buttonText: isEs
          ? `POSICIÓN ${idx + 1} (R${detectedBass})`
          : `POSITION ${idx + 1} (R${detectedBass})`,
        subtitleText: isEs
          ? `Posición ${idx + 1} · Bajo en ${detectedBass}ª cuerda (R${detectedBass})`
          : `Position ${idx + 1} · Root on ${detectedBass}th string (R${detectedBass})`,
      };
    });
  }

  return rawList.map((v, idx) => {
    let frets = [...(v.frets || [])];

    // 1. Imagen 1 fix: En maj13 Posición 2 (R5), omitir la 5ª (4ª cuerda muteada) -> x - 3 - x - 4 - 5 - 5
    if (t === "maj13" && idx === 1) {
      frets = transposeCShapeFrets([-1, 3, -1, 4, 5, 5], root);
    }

    // 2. Imagen 2 fix: En 6 Posición 2 (R5), omitir la 5ª (4ª cuerda muteada) -> x - 3 - x - 5 - 5 - 5
    if (t === "6" && idx === 1) {
      frets = transposeCShapeFrets([-1, 3, -1, 5, 5, 5], root);
    }

    // 3. En m7 Posición 4, garantizar que sea distinta a la Posición 2
    if (t === "m7" && idx === 3) {
      frets = transposeCShapeFrets([-1, 3, 5, 3, 4, 6], root);
    }

    const valid = frets.filter((f) => f > 0);
    const minFret = valid.length > 0 ? Math.min(...valid) : 1;
    const grip = computeGuitarErgonomicGrip(frets);
    const detectedBass = detectBassStringFromFrets(frets, v.label);

    return {
      ...v,
      frets,
      baseFret: minFret,
      fingers: grip.fingers,
      barres: grip.barres,
      bassString: detectedBass,
      buttonText: isEs
        ? `POSICIÓN ${idx + 1} (R${detectedBass})`
        : `POSITION ${idx + 1} (R${detectedBass})`,
      subtitleText: isEs
        ? `Posición ${idx + 1} · Bajo en ${detectedBass}ª cuerda (R${detectedBass})`
        : `Position ${idx + 1} · Root on ${detectedBass}th string (R${detectedBass})`,
    };
  });
}

function generateJoePassRootlessVoicings(
  root: RootNote,
  type: ChordTypeOptions | string,
  isEs: boolean
) {
  const t = String(type);

  interface JazzShapeTemplate {
    cFrets: [number, number, number, number, number, number];
    btnEs: string;
    btnEn: string;
    subEs: string;
    subEn: string;
  }

  let templates: JazzShapeTemplate[] = [];

  if (
    t === "maj7" ||
    t === "maj9" ||
    t === "maj13" ||
    t === "6" ||
    t === "6(9)" ||
    t === "69" ||
    t === "maj7#11" ||
    t === "maj9#11" ||
    t === "add9"
  ) {
    templates = [
      {
        cFrets: [-1, -1, 2, 4, 3, 3],
        btnEs: "JAZZ CHORD 1 (3–7–9–5)",
        btnEn: "JAZZ CHORD 1 (3–7–9–5)",
        subEs: "Jazz Chord Maj9 · Voces: 3 – 7 – 9 – 5",
        subEn: "Jazz Chord Maj9 · Voices: 3 – 7 – 9 – 5",
      },
      {
        cFrets: [-1, -1, 2, 4, 3, 5],
        btnEs: "JAZZ CHORD 2 (3–7–9–13)",
        btnEn: "JAZZ CHORD 2 (3–7–9–13)",
        subEs: "Jazz Chord Maj13 · Voces: 3 – 7 – 9 – 13",
        subEn: "Jazz Chord Maj13 · Voices: 3 – 7 – 9 – 13",
      },
      {
        cFrets: [-1, -1, 2, 2, 3, 3],
        btnEs: "JAZZ CHORD 3 (3–13–9–5)",
        btnEn: "JAZZ CHORD 3 (3–13–9–5)",
        subEs: "Jazz Chord Cuartal 6/9 · Voces: 3 – 13 – 9 – 5",
        subEn: "Jazz Chord Quartal 6/9 · Voices: 3 – 13 – 9 – 5",
      },
      {
        cFrets: [-1, -1, 9, 9, 8, 10],
        btnEs: "JAZZ CHORD 4 (7–3–5–9)",
        btnEn: "JAZZ CHORD 4 (7–3–5–9)",
        subEs: "Jazz Chord Maj9 (7ª en el bajo) · Voces: 7 – 3 – 5 – 9",
        subEn: "Jazz Chord Maj9 (7th in bass) · Voices: 7 – 3 – 5 – 9",
      },
    ];
  } else if (
    t === "m7" ||
    t === "m9" ||
    t === "m11" ||
    t === "m13" ||
    t === "m6" ||
    t === "m(maj7)" ||
    t === "mmaj7" ||
    t === "m-add9"
  ) {
    templates = [
      {
        cFrets: [-1, -1, 1, 3, 3, 3],
        btnEs: "JAZZ CHORD 1 (b3–b7–9–5)",
        btnEn: "JAZZ CHORD 1 (b3–b7–9–5)",
        subEs: "Jazz Chord m9 · Voces: b3 – b7 – 9 – 5",
        subEn: "Jazz Chord m9 · Voices: b3 – b7 – 9 – 5",
      },
      {
        cFrets: [-1, -1, 1, 3, 3, 5],
        btnEs: "JAZZ CHORD 2 (b3–b7–9–13)",
        btnEn: "JAZZ CHORD 2 (b3–b7–9–13)",
        subEs: "Jazz Chord m13 · Voces: b3 – b7 – 9 – 13",
        subEn: "Jazz Chord m13 · Voices: b3 – b7 – 9 – 13",
      },
      {
        cFrets: [-1, -1, 8, 8, 8, 10],
        btnEs: "JAZZ CHORD 3 (b7–b3–5–9)",
        btnEn: "JAZZ CHORD 3 (b7–b3–5–9)",
        subEs: "Jazz Chord m9 (b7 en el bajo) · Voces: b7 – b3 – 5 – 9",
        subEn: "Jazz Chord m9 (b7 in bass) · Voices: b7 – b3 – 5 – 9",
      },
      {
        cFrets: [-1, -1, 1, 2, 3, 3],
        btnEs: "JAZZ CHORD 4 (b3–6–9–5)",
        btnEn: "JAZZ CHORD 4 (b3–6–9–5)",
        subEs: "Jazz Chord m6/9 · Voces: b3 – 6 – 9 – 5",
        subEn: "Jazz Chord m6/9 · Voices: b3 – 6 – 9 – 5",
      },
    ];
  } else if (
    t === "7" ||
    t === "9" ||
    t === "13" ||
    t === "7sus4" ||
    t === "9sus4" ||
    t === "13sus4"
  ) {
    templates = [
      {
        cFrets: [-1, -1, 2, 3, 3, 3],
        btnEs: "JAZZ CHORD 1 (3–b7–9–5)",
        btnEn: "JAZZ CHORD 1 (3–b7–9–5)",
        subEs: "Jazz Chord Dom9 · Voces: 3 – b7 – 9 – 5",
        subEn: "Jazz Chord Dom9 · Voices: 3 – b7 – 9 – 5",
      },
      {
        cFrets: [-1, -1, 2, 3, 3, 5],
        btnEs: "JAZZ CHORD 2 (3–b7–9–13)",
        btnEn: "JAZZ CHORD 2 (3–b7–9–13)",
        subEs: "Jazz Chord Dom13 · Voces: 3 – b7 – 9 – 13",
        subEn: "Jazz Chord Dom13 · Voices: 3 – b7 – 9 – 13",
      },
      {
        cFrets: [-1, -1, 8, 9, 8, 10],
        btnEs: "JAZZ CHORD 3 (b7–3–5–9)",
        btnEn: "JAZZ CHORD 3 (b7–3–5–9)",
        subEs: "Jazz Chord Dom9 (b7 en el bajo) · Voces: b7 – 3 – 5 – 9",
        subEn: "Jazz Chord Dom9 (b7 in bass) · Voices: b7 – 3 – 5 – 9",
      },
      {
        cFrets: [-1, -1, 8, 9, 10, 10],
        btnEs: "JAZZ CHORD 4 (b7–3–13–9)",
        btnEn: "JAZZ CHORD 4 (b7–3–13–9)",
        subEs: "Jazz Chord Dom13 (b7 en el bajo) · Voces: b7 – 3 – 13 – 9",
        subEn: "Jazz Chord Dom13 (b7 in bass) · Voices: b7 – 3 – 13 – 9",
      },
    ];
  } else if (t === "m7b5" || t === "dim7") {
    templates = [
      {
        cFrets: [-1, 6, 8, 7, 7, -1],
        btnEs: "JAZZ CHORD 1 (b3–b7–9–b5)",
        btnEn: "JAZZ CHORD 1 (b3–b7–9–b5)",
        subEs: "Jazz Chord m9(b5) · Voces: b3 – b7 – 9 – b5",
        subEn: "Jazz Chord m9(b5) · Voices: b3 – b7 – 9 – b5",
      },
      {
        cFrets: [-1, -1, 4, 3, 4, 1],
        btnEs: "JAZZ CHORD 2 (b5–b7–b3–11)",
        btnEn: "JAZZ CHORD 2 (b5–b7–b3–11)",
        subEs: "Jazz Chord m11(b5) · Voces: b5 – b7 – b3 – 11",
        subEn: "Jazz Chord m11(b5) · Voices: b5 – b7 – b3 – 11",
      },
      {
        cFrets: [-1, -1, 8, 8, 7, 10],
        btnEs: "JAZZ CHORD 3 (b7–b3–b5–9)",
        btnEn: "JAZZ CHORD 3 (b7–b3–b5–9)",
        subEs: "Jazz Chord m9(b5) (b7 en bajo) · Voces: b7 – b3 – b5 – 9",
        subEn: "Jazz Chord m9(b5) (b7 in bass) · Voices: b7 – b3 – b5 – 9",
      },
      {
        cFrets: [-1, -1, 1, 2, 1, 2],
        btnEs: "JAZZ CHORD 4 (b3–bb7–9)",
        btnEn: "JAZZ CHORD 4 (b3–bb7–9)",
        subEs: "Jazz Chord Dim · Estructura superior",
        subEn: "Jazz Chord Dim · Upper structure",
      },
    ];
  } else {
    templates = [
      {
        cFrets: [-1, -1, 2, 3, 2, 4],
        btnEs: "JAZZ CHORD 1 (3–b7–b9–b13)",
        btnEn: "JAZZ CHORD 1 (3–b7–b9–b13)",
        subEs: "Jazz Chord Alt · Voces: 3 – b7 – b9 – b13",
        subEn: "Jazz Chord Alt · Voices: 3 – b7 – b9 – b13",
      },
      {
        cFrets: [-1, -1, 2, 3, 4, 4],
        btnEs: "JAZZ CHORD 2 (3–b7–#9–b13)",
        btnEn: "JAZZ CHORD 2 (3–b7–#9–b13)",
        subEs: "Jazz Chord Alt · Voces: 3 – b7 – #9 – b13",
        subEn: "Jazz Chord Alt · Voices: 3 – b7 – #9 – b13",
      },
      {
        cFrets: [-1, -1, 2, 3, 2, 2],
        btnEs: "JAZZ CHORD 3 (3–b7–b9–#11)",
        btnEn: "JAZZ CHORD 3 (3–b7–b9–#11)",
        subEs: "Jazz Chord Alt · Voces: 3 – b7 – b9 – #11",
        subEn: "Jazz Chord Alt · Voices: 3 – b7 – b9 – #11",
      },
      {
        cFrets: [-1, -1, 8, 9, 9, 11],
        btnEs: "JAZZ CHORD 4 (b7–3–b13–#9)",
        btnEn: "JAZZ CHORD 4 (b7–3–b13–#9)",
        subEs: "Jazz Chord Alt (b7 en bajo) · Voces: b7 – 3 – b13 – #9",
        subEn: "Jazz Chord Alt (b7 in bass) · Voices: b7 – 3 – b13 – #9",
      },
    ];
  }

  return templates.map((tpl) => {
    const frets = transposeCShapeFrets(tpl.cFrets, root);
    const valid = frets.filter((f) => f > 0);
    const minFret = valid.length > 0 ? Math.min(...valid) : 1;
    const detectedBass = detectBassStringFromFrets(frets);
    const grip = computeGuitarErgonomicGrip(frets);

    return {
      frets,
      fingers: grip.fingers,
      barres: grip.barres,
      baseFret: minFret,
      bassString: detectedBass,
      buttonText: isEs ? tpl.btnEs : tpl.btnEn,
      subtitleText: isEs ? tpl.subEs : tpl.subEn,
    };
  });
}

function isSeventhChordForDrop(type: ChordTypeOptions | string): boolean {
  const t = String(type);
  return (
    t === "maj7" ||
    t === "m7" ||
    t === "7" ||
    t === "m7b5" ||
    t === "dim7" ||
    t === "m(maj7)" ||
    t === "mmaj7"
  );
}

function getTriadIntervals(type: ChordTypeOptions | string): [number, number, number] {
  switch (String(type)) {
    case "Mayor":
      return [0, 4, 7];
    case "Menor":
      return [0, 3, 7];
    case "aug":
      return [0, 4, 8];
    case "dim":
      return [0, 3, 6];
    default:
      return [0, 4, 7];
  }
}

function generateThreeNoteTriadPositions(
  root: RootNote,
  type: ChordTypeOptions | string,
  isEs: boolean
) {
  const rootPc = ROOT_SEMITONES[root] ?? 0;
  const [i1, i3, i5] = getTriadIntervals(type);
  const p1 = (rootPc + i1) % 12;
  const p3 = (rootPc + i3) % 12;
  const p5 = (rootPc + i5) % 12;

  const buildClosedThreeStringTriad = (
    stringIndices: [number, number, number],
    pcsOrder: [number, number, number],
    btnLabel: string,
    subLabel: string
  ) => {
    const [s0, s1, s2] = stringIndices;
    const open0 = STRING_OPEN_MIDI[s0];

    let f0 = ((pcsOrder[0] - (open0 % 12)) % 12 + 12) % 12;
    if (f0 === 0) f0 = 12;
    const m0 = open0 + f0;

    let step0to1 = ((pcsOrder[1] - pcsOrder[0]) % 12 + 12) % 12;
    if (step0to1 === 0) step0to1 = 12;
    const m1 = m0 + step0to1;

    let step1to2 = ((pcsOrder[2] - pcsOrder[1]) % 12 + 12) % 12;
    if (step1to2 === 0) step1to2 = 12;
    const m2 = m1 + step1to2;

    let triple = [
      m0 - STRING_OPEN_MIDI[s0],
      m1 - STRING_OPEN_MIDI[s1],
      m2 - STRING_OPEN_MIDI[s2],
    ];

    if (triple.some((f) => f <= 0)) {
      triple = triple.map((f) => f + 12);
    }
    if (Math.min(...triple) > 11 && triple.every((f) => f - 12 >= 1)) {
      triple = triple.map((f) => f - 12);
    }

    const frets: number[] = [-1, -1, -1, -1, -1, -1];
    frets[s0] = triple[0];
    frets[s1] = triple[1];
    frets[s2] = triple[2];

    const grip = computeGuitarErgonomicGrip(frets);

    return {
      frets,
      fingers: grip.fingers,
      barres: grip.barres,
      baseFret: Math.min(...triple),
      bassString: 6 - s0,
      buttonText: btnLabel,
      subtitleText: subLabel,
    };
  };

  return [
    buildClosedThreeStringTriad(
      [2, 3, 4],
      [p1, p3, p5],
      isEs ? "POSICIÓN 1 (R4)" : "POSITION 1 (R4)",
      isEs
        ? "Tríada pura de 3 notas (Cuerdas 4-3-2) · Fundamental (1 – 3 – 5)"
        : "Pure 3-Note Triad (Strings 4-3-2) · Root Position (1 – 3 – 5)"
    ),
    buildClosedThreeStringTriad(
      [3, 4, 5],
      [p1, p3, p5],
      isEs ? "POSICIÓN 2 (R3)" : "POSITION 2 (R3)",
      isEs
        ? "Tríada pura de 3 notas (Cuerdas 3-2-1) · Fundamental (1 – 3 – 5)"
        : "Pure 3-Note Triad (Strings 3-2-1) · Root Position (1 – 3 – 5)"
    ),
    buildClosedThreeStringTriad(
      [2, 3, 4],
      [p3, p5, p1],
      isEs ? "1ª INV (3ª EN BAJO)" : "1ST INV (3RD IN BASS)",
      isEs
        ? "Tríada pura de 3 notas (Cuerdas 4-3-2) · 1ª Inversión"
        : "Pure 3-Note Triad (Strings 4-3-2) · 1st Inversion"
    ),
    buildClosedThreeStringTriad(
      [2, 3, 4],
      [p5, p1, p3],
      isEs ? "2ª INV (5ª EN BAJO)" : "2ND INV (5TH IN BASS)",
      isEs
        ? "Tríada pura de 3 notas (Cuerdas 4-3-2) · 2ª Inversión"
        : "Pure 3-Note Triad (Strings 4-3-2) · 2nd Inversion"
    ),
  ];
}

function getSeventhChordTones(type: ChordTypeOptions | string): [number, number, number, number] {
  const t = String(type);
  if (t === "maj7") return [0, 4, 7, 11];
  if (t === "m7") return [0, 3, 7, 10];
  if (t === "7") return [0, 4, 7, 10];
  if (t === "m7b5") return [0, 3, 6, 10];
  if (t === "dim7") return [0, 3, 6, 9];
  if (t === "m(maj7)" || t === "mmaj7") return [0, 3, 7, 11];
  return [0, 4, 7, 11];
}

function generateExactFourDropVoicings(
  root: RootNote,
  type: ChordTypeOptions | string,
  mode: "drop2" | "drop3",
  isEs: boolean
) {
  const rootPc = ROOT_SEMITONES[root] ?? 0;
  const [t1, t3, t5, t7] = getSeventhChordTones(type);

  const pcs = [
    (rootPc + t1) % 12,
    (rootPc + t3) % 12,
    (rootPc + t5) % 12,
    (rootPc + t7) % 12,
  ];

  const drop2VoiceIndices: [number, number, number, number][] = [
    [0, 2, 3, 1],
    [1, 3, 0, 2],
    [2, 0, 1, 3],
    [3, 1, 2, 0],
  ];

  const drop3VoiceIndices: [number, number, number, number][] = [
    [0, 3, 1, 2],
    [1, 0, 2, 3],
    [2, 1, 3, 0],
    [3, 2, 0, 1],
  ];

  const inversionMeta = [
    {
      btnEs: "FUNDAMENTAL",
      btnEn: "ROOT POS",
      subEs: "Posición Fundamental (Raíz en el bajo)",
      subEn: "Root Position (Root in bass)",
    },
    {
      btnEs: "1ª INVERSIÓN",
      btnEn: "1ST INVERSION",
      subEs: "1ª Inversión (3ª en el bajo)",
      subEn: "1st Inversion (3rd in bass)",
    },
    {
      btnEs: "2ª INVERSIÓN",
      btnEn: "2ND INVERSION",
      subEs: "2ª Inversión (5ª en el bajo)",
      subEn: "2nd Inversion (5th in bass)",
    },
    {
      btnEs: "3ª INVERSIÓN",
      btnEn: "3RD INVERSION",
      subEs: "3ª Inversión (7ª en el bajo)",
      subEn: "3rd Inversion (7th in bass)",
    },
  ];

  const structures = mode === "drop2" ? drop2VoiceIndices : drop3VoiceIndices;
  const stringIndices = mode === "drop2" ? [2, 3, 4, 5] : [0, 2, 3, 4];
  const bassStringNumber = mode === "drop2" ? 4 : 6;

  return structures.map((voiceIdxTuple, invIndex) => {
    const vPcs = voiceIdxTuple.map((idx) => pcs[idx]);
    const bassOpenMidi = STRING_OPEN_MIDI[stringIndices[0]];

    let f0 = ((vPcs[0] - (bassOpenMidi % 12)) % 12 + 12) % 12;
    if (f0 === 0) f0 = 12;

    const m0 = bassOpenMidi + f0;
    let step0to1 = ((vPcs[1] - vPcs[0]) % 12 + 12) % 12;
    if (step0to1 === 0) step0to1 = 12;
    if (mode === "drop3" && step0to1 < 5) {
      step0to1 += 12;
    }
    const m1 = m0 + step0to1;

    let step1to2 = ((vPcs[2] - vPcs[1]) % 12 + 12) % 12;
    if (step1to2 === 0) step1to2 = 12;
    const m2 = m1 + step1to2;

    let step2to3 = ((vPcs[3] - vPcs[2]) % 12 + 12) % 12;
    if (step2to3 === 0) step2to3 = 12;
    const m3 = m2 + step2to3;

    const midiVoices = [m0, m1, m2, m3];

    let computedFrets = midiVoices.map(
      (midiNote, i) => midiNote - STRING_OPEN_MIDI[stringIndices[i]]
    );

    if (computedFrets.some((f) => f <= 0)) {
      computedFrets = computedFrets.map((f) => f + 12);
    }
    if (
      Math.min(...computedFrets) > 12 &&
      computedFrets.every((f) => f - 12 >= 1)
    ) {
      computedFrets = computedFrets.map((f) => f - 12);
    }

    const frets: number[] = [-1, -1, -1, -1, -1, -1];
    stringIndices.forEach((sIdx, i) => {
      frets[sIdx] = computedFrets[i];
    });

    const minFret = Math.min(...computedFrets);
    const meta = inversionMeta[invIndex];
    const grip = computeGuitarErgonomicGrip(frets);

    return {
      frets,
      fingers: grip.fingers,
      barres: grip.barres,
      baseFret: minFret,
      bassString: bassStringNumber,
      buttonText: isEs ? meta.btnEs : meta.btnEn,
      subtitleText:
        mode === "drop2"
          ? `Drop 2 (Cuerdas 4-3-2-1) · ${isEs ? meta.subEs : meta.subEn}`
          : `Drop 3 (Cuerdas 6-4-3-2) · ${isEs ? meta.subEs : meta.subEn}`,
    };
  });
}

export default function ChordDictionary({
  defaultRoot = "C",
  defaultType = "maj7",
  hideControls = false,
  hideTitle = false,
  forceBaseFret,
  voicingMode,
  onVoicingModeChange,
  isExpanded = false,
}: ChordDictionaryProps = {}) {
  const { t, language } = useLanguage();
  const isEs = language === "es";

  const [selectedRoot, setSelectedRoot] = useState<RootNote>(defaultRoot);
  const [selectedType, setSelectedType] = useState<ChordTypeOptions>(defaultType);
  const [guitarVoicingMode, setGuitarVoicingMode] = useState<GuitarVoicingMode>("standard");
  const [selectedGuitarSound, setSelectedGuitarSound] =
    useState<GuitarInstrumentId>("clean_electric");
  const [positionIndex, setPositionIndex] = useState(0);
  const [keyboardVoicingMode, setKeyboardVoicingMode] =
    useState<KeyboardVoicingMode>("fundamental");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("SÉPTIMAS");

  useEffect(() => {
    dictionaryAudio.preloadGuitarSamples();
  }, []);

  useEffect(() => {
    setSelectedRoot(defaultRoot);
    setSelectedType(defaultType);
  }, [defaultRoot, defaultType]);

  const roots: RootNote[] = [
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];

  const enhancedChordGroups = useMemo(() => {
    return CHORD_GROUPS.map((group) => {
      const isTriadsGroup =
        group.id === "triads" ||
        group.label.toUpperCase().includes("TRÍADA") ||
        group.label.toUpperCase().includes("TRIAD");

      if (isTriadsGroup && !group.options.includes("dim" as ChordTypeOptions)) {
        return {
          ...group,
          options: [...group.options, "dim" as ChordTypeOptions],
        };
      }
      return group;
    });
  }, []);

  const isMajorOrMinorBasic =
    String(selectedType) === "Mayor" || String(selectedType) === "Menor";
  const isAugOrDimTriad =
    String(selectedType) === "aug" || String(selectedType) === "dim";
  const isAnyTriad = isMajorOrMinorBasic || isAugOrDimTriad;
  const allowDropVoicings = isSeventhChordForDrop(selectedType);
  const allowJazzVoicings = !isAnyTriad;

  useEffect(() => {
    if (!allowDropVoicings && (guitarVoicingMode === "drop2" || guitarVoicingMode === "drop3")) {
      setGuitarVoicingMode("standard");
    }
    if (!isMajorOrMinorBasic && guitarVoicingMode === "triad_inversions") {
      setGuitarVoicingMode("standard");
    }
    if (!allowJazzVoicings && guitarVoicingMode === "jazz_voicings") {
      setGuitarVoicingMode("standard");
    }
  }, [
    selectedType,
    allowDropVoicings,
    isMajorOrMinorBasic,
    allowJazzVoicings,
    guitarVoicingMode,
  ]);

  const activeVoicings = useMemo(() => {
    if (allowJazzVoicings && guitarVoicingMode === "jazz_voicings") {
      return generateJoePassRootlessVoicings(selectedRoot, selectedType, isEs);
    }

    if (
      allowDropVoicings &&
      (guitarVoicingMode === "drop2" || guitarVoicingMode === "drop3")
    ) {
      return generateExactFourDropVoicings(
        selectedRoot,
        selectedType,
        guitarVoicingMode,
        isEs
      );
    }

    if (
      isAugOrDimTriad ||
      (isMajorOrMinorBasic && guitarVoicingMode === "triad_inversions")
    ) {
      return generateThreeNoteTriadPositions(selectedRoot, selectedType, isEs);
    }

    return buildPerfectedStandardVoicings(selectedRoot, selectedType, isEs);
  }, [
    selectedRoot,
    selectedType,
    guitarVoicingMode,
    isEs,
    allowJazzVoicings,
    allowDropVoicings,
    isAugOrDimTriad,
    isMajorOrMinorBasic,
  ]);

  const actualIndex = positionIndex % Math.max(activeVoicings.length, 1);
  const activeVoicing = activeVoicings[actualIndex];

  const activeDef = useMemo(() => {
    if ((selectedType as string) === "dim") {
      return (CHORD_DEFINITIONS as any)["dim"] || DIM_TRIAD_DEFINITION;
    }
    return CHORD_DEFINITIONS[selectedType] || CHORD_DEFINITIONS["Mayor"];
  }, [selectedType]);

  const effectiveKeyboardMode = voicingMode ?? keyboardVoicingMode;
  const handleKeyboardModeChange = onVoicingModeChange ?? setKeyboardVoicingMode;

  const resolvedKeyboardData = useMemo(() => {
    const safeType =
      (selectedType as string) === "dim" ? ("dim7" as ChordTypeOptions) : selectedType;
    return resolveKeyboardVoicingData(
      selectedRoot,
      safeType,
      effectiveKeyboardMode
    );
  }, [selectedRoot, selectedType, effectiveKeyboardMode]);

  useEffect(() => {
    if (effectiveKeyboardMode === "inv3" && resolvedKeyboardData.noteCount < 4) {
      handleKeyboardModeChange("fundamental");
    }
  }, [effectiveKeyboardMode, resolvedKeyboardData.noteCount, handleKeyboardModeChange]);

  useEffect(() => {
    setPositionIndex(0);
  }, [selectedType, selectedRoot, guitarVoicingMode]);

  const handleQuickPlayGuitar = (
    voicing = activeVoicing,
    instId: GuitarInstrumentId = selectedGuitarSound
  ) => {
    if (!voicing) return;
    const freqs = getGuitarChordFrequencies(voicing.frets);
    dictionaryAudio.playChord(freqs, instId);
  };

  return (
    <div
      id="chord-dictionary-container"
      className={`flex ${
        hideControls
          ? "flex-col items-center justify-center"
          : "flex-col lg:flex-row items-stretch"
      } gap-4 w-full select-none`}
    >
      {!hideControls && (
        <div className="w-full lg:w-7/12 xl:w-8/12 flex flex-col gap-3.5">
          {/* BLOQUE 1: Selector de las 12 Notas Raíz */}
          <div
            id="root-filter-panel"
            className="bg-[#111217] p-3.5 rounded-2xl border border-[#1e202b] shadow-xl"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#181922] border border-[#242634] rounded-lg text-[#f25100]">
                  <Music size={14} />
                </div>
                <h4 className="text-xs uppercase tracking-wider text-white font-extrabold">
                  {t("chords.rootNote")}
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-[#f25100]">
                {ROOT_DISPLAY_NAME_MAP[selectedRoot]}
              </span>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {roots.map((root) => {
                const isSelected = selectedRoot === root;
                return (
                  <button
                    key={`root-btn-${root}`}
                    id={`root-btn-${root}`}
                    type="button"
                    onClick={() => setSelectedRoot(root)}
                    className={`h-9 border rounded-xl text-xs sm:text-sm font-mono font-extrabold tabular-nums transition-all cursor-pointer active:scale-95 ${
                      isSelected
                        ? "border-[#ff7433] bg-[#f25100] text-white shadow-[0_0_12px_rgba(242,81,0,0.4)]"
                        : "border-[#232533] bg-[#161720] hover:border-[#f25100]/50 hover:bg-[#1d1f2b] text-zinc-200 hover:text-white"
                    }`}
                  >
                    {ROOT_DISPLAY_NAME_MAP[root]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* BLOQUE 2: Categorías, Grilla de Acordes y Posiciones */}
          <div
            id="chord-type-panel"
            className="bg-[#111217] p-4 rounded-2xl border border-[#1e202b] shadow-xl flex-1 flex flex-col justify-between gap-3"
          >
            <div>
              {/* Barra Superior: Categorías + Buscador */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-[#1c1e28]">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  <div className="p-1.5 bg-[#181922] border border-[#242634] rounded-lg text-[#f25100] mr-1 shrink-0">
                    <GraduationCap size={15} />
                  </div>
                  {enhancedChordGroups.map((group) => {
                    const isCatActive = !searchQuery && activeCategory === group.label;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setActiveCategory(group.label);
                        }}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          isCatActive
                            ? "bg-[#f25100] text-white shadow-sm"
                            : "bg-[#161720] text-zinc-400 hover:text-white border border-[#242634]"
                        }`}
                      >
                        {t(`chords.${group.id}`)}
                      </button>
                    );
                  })}
                </div>

                {/* Buscador Compacto */}
                <div className="relative w-full sm:w-48 shrink-0">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="text"
                    placeholder={t("chords.searchType")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#161720] border border-[#252736] rounded-xl py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-[#f25100] transition-colors"
                  />
                </div>
              </div>

              {/* Grilla de Variaciones de Acordes */}
              {enhancedChordGroups.map((group) => {
                if (!searchQuery && group.label !== activeCategory) return null;

                const filteredOptions = group.options.filter((type) => {
                  if (!searchQuery) return true;
                  const def =
                    (CHORD_DEFINITIONS as any)[type] || DIM_TRIAD_DEFINITION;
                  const searchLower = searchQuery.toLowerCase();
                  return (
                    String(type).toLowerCase().includes(searchLower) ||
                    def.symbol.toLowerCase().includes(searchLower) ||
                    def.suffix.toLowerCase().includes(searchLower)
                  );
                });

                if (filteredOptions.length === 0) return null;

                return (
                  <div key={group.label}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                      {filteredOptions.map((type) => {
                        const def =
                          (CHORD_DEFINITIONS as any)[type] || DIM_TRIAD_DEFINITION;
                        const isSelected = selectedType === type;
                        return (
                          <button
                            key={`opt-${type}`}
                            type="button"
                            onClick={() => setSelectedType(type)}
                            className={`px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-95 flex flex-col justify-between ${
                              isSelected
                                ? "border-[#ff7433] bg-[#f25100] text-white shadow-[0_0_14px_rgba(242,81,0,0.3)]"
                                : "border-[#222430] bg-[#14151c] hover:border-[#f25100]/50 hover:bg-[#1a1c26] text-zinc-200"
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-1 w-full">
                              <span className="text-sm sm:text-base font-black tracking-tight truncate">
                                {ROOT_DISPLAY_NAME_MAP[selectedRoot]}{" "}
                                {def.symbol !== "Maj" && def.symbol !== "m"
                                  ? def.symbol
                                  : def.symbol === "m"
                                  ? "m"
                                  : isEs
                                  ? "Mayor"
                                  : "Major"}
                              </span>
                            </div>
                            <div
                              className={`text-[11px] font-mono mt-0.5 truncate ${
                                isSelected ? "text-orange-100 font-semibold" : "text-zinc-400"
                              }`}
                            >
                              {def.chordFormula.split("-").join(" – ")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* BLOQUE 3 INFERIOR IZQUIERDO: Selector de Timbre de Guitarra + Modo de Voicing + Posiciones */}
            <div className="pt-3 border-t border-[#1c1e28] flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-400 tracking-wider uppercase font-extrabold flex items-center gap-1.5">
                  <Layers size={14} className="text-[#f25100]" />
                  {isEs ? "POSICIONES" : "POSITIONS"} ({activeVoicings.length}):
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {/* SELECTOR COMPACTO DESPLEGABLE DE LAS 5 GUITARRAS HD */}
                  <div className="relative h-8 shrink-0">
                    <Radio
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#f25100] pointer-events-none"
                    />
                    <select
                      value={selectedGuitarSound}
                      onChange={(e) => {
                        const newInst = e.target.value as GuitarInstrumentId;
                        e.currentTarget.blur();
                        setSelectedGuitarSound(newInst);
                        dictionaryAudio.setInstrument(newInst);
                        handleQuickPlayGuitar(activeVoicing, newInst);
                      }}
                      title={
                        isEs
                          ? "Seleccionar sonido de guitarra"
                          : "Select guitar sound"
                      }
                      className="h-8 pl-7 pr-6 rounded-xl bg-[#161720] hover:bg-[#1c1e29] border border-[#252736] hover:border-[#f25100]/60 text-[11px] font-extrabold uppercase tracking-wider text-zinc-100 appearance-none cursor-pointer focus:outline-none focus:border-[#f25100] transition-colors"
                    >
                      {GUITAR_INSTRUMENTS.map((inst) => (
                        <option
                          key={inst.id}
                          value={inst.id}
                          className="bg-[#111217] text-zinc-100 font-sans font-bold"
                        >
                          {isEs ? inst.labelEs : inst.labelEn}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                    />
                  </div>

                  {isMajorOrMinorBasic && (
                    <div className="flex items-center gap-1 bg-[#161720] p-1 rounded-xl border border-[#252736]">
                      <button
                        type="button"
                        onClick={() => setGuitarVoicingMode("standard")}
                        className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          guitarVoicingMode === "standard"
                            ? "bg-[#f25100] text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {isEs ? "ACORDES BASE (CEJILLO)" : "BASIC CHORDS (BARRE)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuitarVoicingMode("triad_inversions")}
                        className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          guitarVoicingMode === "triad_inversions"
                            ? "bg-[#f25100] text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {isEs ? "TRÍADAS (3 CUERDAS)" : "TRIADS (3 STRINGS)"}
                      </button>
                    </div>
                  )}

                  {allowJazzVoicings && (
                    <div className="flex flex-wrap items-center gap-1 bg-[#161720] p-1 rounded-xl border border-[#252736]">
                      <button
                        type="button"
                        onClick={() => setGuitarVoicingMode("standard")}
                        className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          guitarVoicingMode === "standard"
                            ? "bg-[#f25100] text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {isEs ? "ESTÁNDAR" : "STANDARD"}
                      </button>

                      {allowDropVoicings && (
                        <>
                          <button
                            type="button"
                            onClick={() => setGuitarVoicingMode("drop2")}
                            className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                              guitarVoicingMode === "drop2"
                                ? "bg-[#f25100] text-white shadow-sm"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            DROP 2
                          </button>
                          <button
                            type="button"
                            onClick={() => setGuitarVoicingMode("drop3")}
                            className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                              guitarVoicingMode === "drop3"
                                ? "bg-[#f25100] text-white shadow-sm"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            DROP 3
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setGuitarVoicingMode("jazz_voicings")}
                        className={`px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          guitarVoicingMode === "jazz_voicings"
                            ? "bg-[#f25100] text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        JAZZ CHORD
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Botones de Posición */}
              {activeVoicings.length > 0 && (
                <div
                  className={`grid grid-cols-2 ${
                    activeVoicings.length === 2
                      ? "sm:grid-cols-2"
                      : activeVoicings.length === 3
                      ? "sm:grid-cols-3"
                      : "sm:grid-cols-4"
                  } gap-2`}
                >
                  {activeVoicings.map((v, idx) => {
                    const isActive = idx === actualIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setPositionIndex(idx);
                          handleQuickPlayGuitar(v);
                        }}
                        className={`py-2 px-3 rounded-xl border text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer active:scale-95 truncate ${
                          isActive
                            ? "bg-[#f25100] text-white border-[#ff7433] shadow-sm"
                            : "bg-[#161720] border-[#252736] hover:border-[#f25100]/50 text-zinc-300 hover:text-white"
                        }`}
                      >
                        {v.buttonText}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tarjetas de Clasificación Armónica y Fórmula de Grados */}
              <div id="theory-info-card" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-[#14151c] border border-[#222430] py-2.5 px-3.5 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-zinc-400 text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5">
                    <Music size={13} className="text-[#f25100]" />
                    {t("chords.classification")}
                  </span>
                  <span className="text-white font-bold text-xs sm:text-sm truncate">
                    {activeDef.suffix}
                  </span>
                </div>

                <div className="bg-[#14151c] border border-[#222430] py-2.5 px-3.5 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-zinc-400 text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5">
                    <GitCommit size={13} className="text-[#f25100]" />
                    {t("chords.degrees")}
                  </span>
                  <span className="text-[#f25100] font-mono font-black text-xs sm:text-sm">
                    {activeDef.chordFormula.split("-").join(" – ")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COLUMNA DERECHA: DIAGRAMA DE DIAPASÓN DE GUITARRA INTERACTIVO */}
      <div
        className={`w-full ${
          hideControls ? "w-full" : "lg:w-5/12 xl:w-4/12"
        } flex justify-center self-start`}
      >
        <div className="w-full flex flex-col items-center">
          {activeVoicing ? (
            <div className="w-full bg-[#111217] border border-[#1e202b] rounded-2xl p-3 shadow-2xl">
              <ChordFretboard
                root={selectedRoot}
                type={selectedType}
                voicing={activeVoicing}
                title={
                  hideTitle
                    ? undefined
                    : activeDef.symbol === "Maj"
                    ? ""
                    : activeDef.symbol
                }
                subtitle={activeVoicing.subtitleText}
                isPro={false}
                forceBaseFret={forceBaseFret ?? activeVoicing.baseFret}
                isExpanded={isExpanded}
              />
            </div>
          ) : (
            <div className="p-8 text-center border border-[#1e202b] rounded-2xl bg-[#111217] text-zinc-400 text-sm w-full font-mono">
              {isEs
                ? "Posición en construcción para esta tonalidad."
                : "Position under construction for this key."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}