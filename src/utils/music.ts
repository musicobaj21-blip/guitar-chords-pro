import { RootNote, ChordTypeOptions } from "../types";
import { ROOT_MIDI_OFFSET_MAP, CHORD_DEFINITIONS } from "../data/chords";
import { EXPLORER_CATEGORIES } from "../data/scales";

// Dos arreglos cromáticos: uno con sostenidos y otro con bemoles para ortografía armónica estricta
export const CHROMATIC_SHARPS: RootNote[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

export const CHROMATIC_FLATS: RootNote[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"
];

// Compatibilidad hacia atrás
export const CHROMATIC_PREFERENCE_SHARPS = CHROMATIC_SHARPS;
export const CHROMATIC_PREFERENCE_FLATS = CHROMATIC_FLATS;

/**
 * Detecta si una tonalidad (o la tonalidad resultante tras transponer)
 * pertenece a la familia de los bemoles (F, Bb, Eb, Ab, Db, Gb o sus relativas menores: Dm, Gm, Cm, Fm, Bbm, Ebm).
 */
export function isFlatKeyFamily(keyCenter: RootNote | string = "C", semitones: number = 0): boolean {
  if (!keyCenter) return false;

  const keyStr = String(keyCenter).trim();
  const isMinor = /m|-|min/i.test(keyStr);
  const cleanKey = keyStr.replace(/m|-|min/ig, "").trim();

  // Si semitones === 0, evaluar directamente la tonalidad dada:
  const flatMajorKeys = ["F", "Bb", "Eb", "Ab", "Db", "Gb"];
  const flatMinorKeys = ["D", "G", "C", "F", "Bb", "Eb"]; // Dm, Gm, Cm, Fm, Bbm, Ebm

  const baseOffset = ROOT_MIDI_OFFSET_MAP[cleanKey as RootNote];
  if (baseOffset === undefined) {
    return isMinor ? flatMinorKeys.includes(cleanKey) : flatMajorKeys.includes(cleanKey);
  }

  // Tonalidad destino tras la transposición (0..11)
  const targetPitchClass = ((baseOffset + semitones) % 12 + 12) % 12;

  if (isMinor) {
    // Relativas menores de la familia de bemoles:
    // Dm (F) = 2, Gm (Bb) = 7, Cm (Eb) = 0, Fm (Ab) = 5, Bbm (Db) = 10, Ebm (Gb) = 3
    const flatMinorPitchClasses = [2, 7, 0, 5, 10, 3];
    return flatMinorPitchClasses.includes(targetPitchClass);
  } else {
    // Tonalidades mayores de la familia de bemoles:
    // F = 5, Bb = 10, Eb = 3, Ab = 8, Db = 1, Gb = 6
    const flatMajorPitchClasses = [5, 10, 3, 8, 1, 6];
    return flatMajorPitchClasses.includes(targetPitchClass);
  }
}

/**
 * Transpone cualquier RootNote por un número de semitonos (positivo o negativo)
 * respetando la ortografía enharmónica según la tonalidad destino.
 */
export function transposeRoot(root: RootNote, semitones: number, keyCenter: RootNote | string = "C"): RootNote {
  const currentOffset = ROOT_MIDI_OFFSET_MAP[root];
  if (currentOffset === undefined) return root;

  // Calcular nueva clase de altura (0-11)
  let transposedOffset = (currentOffset + semitones) % 12;
  if (transposedOffset < 0) {
    transposedOffset += 12;
  }

  // Si la tonalidad destino pertenece a la familia de los bemoles, usar arreglo de bemoles; de lo contrario, sostenidos
  const useFlats = isFlatKeyFamily(keyCenter, semitones);
  const scale = useFlats ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
  return scale[transposedOffset];
}

/**
 * Generates a suggested scale string and notes for a given root and chord type
 */
export interface SuggestedScale {
  name: string;
  notes: string[];
  intervals?: number[];
}

export interface ScaleMapping {
  name: string;
  intervals: number[];
}

/**
 * Diccionario global de mapeo de escalas sugeridas para el análisis armónico
 */
export const scaleMappings: Record<string, ScaleMapping> = {
  // Grado i (Tónica Menor): Eólica por defecto (Aeolian / Natural Minor)
  minorTonic: {
    name: "Eólica",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  // Acordes menores estándar (ej. ii): Dórica
  minorDefault: {
    name: "Dórica",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  // Acordes mayores (Grado I): Jónica
  major: {
    name: "Jónica",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  // Grado IV (IV o IVmaj7): Lidia
  lydian: {
    name: "Lidia",
    intervals: [0, 2, 4, 6, 7, 9, 11],
  },
  // Sustituto Tritonal (subV7, subV7/V, etc.): Lidia Dominante
  tritoneSubstitute: {
    name: "Lidia Dominante",
    intervals: [0, 2, 4, 6, 7, 9, 10],
  },
  lydianDominant: {
    name: "Lidia Dominante",
    intervals: [0, 2, 4, 6, 7, 9, 10],
  },
  // Dominantes de resolución menor (V7 -> i o V7 -> vi): Frigia Dominante (Phrygian Dominant)
  dominantMinorResolution: {
    name: "Frigia Dominante",
    intervals: [0, 1, 4, 5, 7, 8, 10],
  },
  // Dominantes estándar (resolución mayor): Mixolidia
  dominantDefault: {
    name: "Mixolidia",
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  // Acorde alterado: Escala Alterada (Superlocria)
  altered: {
    name: "Alterada",
    intervals: [0, 1, 3, 4, 6, 8, 10],
  },
  // Grado iii: Frigia (Phrygian)
  phrygian: {
    name: "Frigia",
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  // Alias de modos diatónicos
  dorian: {
    name: "Dórica",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  aeolian: {
    name: "Eólica",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  ionian: {
    name: "Jónica",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  mixolydian: {
    name: "Mixolidia",
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  locrian: {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  phrygianDominant: {
    name: "Frigia Dominante",
    intervals: [0, 1, 4, 5, 7, 8, 10],
  },
  // Semidisminuido (m7b5 / iiø): Locria
  halfDiminished: {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  // Disminuido (dim7): Disminuida
  diminished: {
    name: "Disminuida",
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
  },
  // Aumentado: Tonos Enteros
  augmented: {
    name: "Tonos Enteros",
    intervals: [0, 2, 4, 6, 8, 10],
  },
};

export function isMinorQuality(type: string): boolean {
  if (!type) return false;
  if (type === "Menor" || type.startsWith("m(maj7)") || type.startsWith("min(maj7)")) return true;
  if (type.startsWith("maj") || type === "Mayor" || type.startsWith("M")) return false;
  return (
    [
      "m7", "m9", "m11", "m13", "m6", "m(maj7)", "m7b5", "dim7", "m-add9",
      "m11b5", "mb13b5", "m9b5"
    ].includes(type) ||
    type.startsWith("m") ||
    type.includes("min") ||
    type.includes("-") ||
    /menor/i.test(type)
  );
}

export function isDominantQuality(type: string): boolean {
  if (!type) return false;
  return (
    [
      "7", "9", "13", "7sus4", "9sus4", "13sus4", 
      "alt", "7b9", "7#9", "7#11", "7b13", "7#5#9", "7b9b13", "7#9b13", "7b9#11"
    ].includes(type) ||
    (type.startsWith("7") && !type.startsWith("7M") && !type.startsWith("7maj"))
  );
}

export function isExplicitMajorChord(type: string): boolean {
  if (!type) return true;
  const s = type.trim();
  if (s === "Menor" || s.startsWith("m(maj") || s.startsWith("min(maj")) return false;
  if (s.includes("maj")) return true;
  if (s === "Mayor" || s === "M" || s.startsWith("M7") || s.startsWith("M9") || s === "6" || s === "6(9)" || s === "add9") return true;
  if (!s.includes("m") && !s.includes("min") && !s.includes("-") && !isMinorQuality(s)) {
    return true;
  }
  return false;
}

function isTargetMinorQuality(typeOrQuality?: string | null): boolean {
  if (!typeOrQuality) return false;
  const s = typeOrQuality.trim();
  // Minor-major seventh chords: m(maj7), min(maj7), -(maj7)
  if (/^m.*maj/i.test(s) || /min.*maj/i.test(s) || /-.*maj/i.test(s)) return true;
  // Roman numerals: i, ii, iii, iv, v, vi, vii (lower case)
  if (/^(?:i|ii|iii|iv|v|vi|vii)(?:ø|°|m|min|-|\b)/.test(s) && !/^(?:I|II|III|IV|V|VI|VII)/.test(s)) return true;
  // Explicit word "Menor"
  if (/menor/i.test(s)) return true;
  // Explicit major indicators: maj, mayor, M
  if (/maj|mayor/i.test(s) || /\bM\b|^M[0-9]*/.test(s)) return false;
  // Dominant / neutral / augmented without minor modifiers
  if (["6", "6(9)", "add9", "7", "9", "13", "7#11", "alt", "sus4", "7sus4", "aug"].includes(s)) return false;
  // Contains minor markers: min, -, m
  if (/min|-/i.test(s) || /m/i.test(s)) return true;
  return false;
}

function isTargetMajorQuality(typeOrQuality?: string | null): boolean {
  if (!typeOrQuality) return false;
  const s = typeOrQuality.trim();
  if (isTargetMinorQuality(s)) return false;
  if (/maj|mayor/i.test(s) || /\bM\b|^M[0-9]*/.test(s) || s === "Mayor") return true;
  if (["6", "6(9)", "add9", "7", "9", "13", "alt", "7#11", "7sus4"].includes(s)) return true;
  if (/^(?:I|IV|V|bIII|bVI|bVII)/.test(s)) return true;
  return true;
}

/**
 * Diccionario global de asignación de escalas estrictamente según el grado funcional diatónico:
 * - Grado I o i (sin función dominante) -> Jónica (Ionian)
 * - Grado ii -> Dórica (Dorian)
 * - Grado iii -> Frigia (Phrygian)
 * - Grado IV -> Lidia (Lydian)
 * - Grado vi -> Eólica (Aeolian)
 * - Grado viiº o iiº -> Locria (Locrian)
 */
export const DIATONIC_DEGREE_SCALE_MAP: Record<string, ScaleMapping> = {
  I: {
    name: "Jónica",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  i: {
    name: "Eólica",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  ii: {
    name: "Dórica",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  iii: {
    name: "Frigia",
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  bIII: {
    name: "Jónica",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  IV: {
    name: "Lidia",
    intervals: [0, 2, 4, 6, 7, 9, 11],
  },
  iv: {
    name: "Dórica",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  vi: {
    name: "Eólica",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  bVI: {
    name: "Lidia",
    intervals: [0, 2, 4, 6, 7, 9, 11],
  },
  bVII: {
    name: "Mixolidia",
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  "vii°": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  "viiº": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  "viiø": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  vii: {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  "ii°": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  "iiº": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  "iiø": {
    name: "Locria",
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
};

/**
 * Normaliza y extrae el grado armónico funcional a partir de la representación en números romanos.
 */
export function extractDegreeFromRomanNumeral(romanNumeral?: string): string | null {
  if (!romanNumeral) return null;
  const clean = romanNumeral.replace(/\s*\(IM\)/gi, "").replace(/\.+$/, "").trim();
  if (!clean || clean === "-") return null;

  // Grado iiº o viiº (semidisminuido o disminuido): iiø, ii°, iiº, viiø, vii°, viiº
  if (/^ii[ø°º]/i.test(clean)) return "iiº";
  if (/^vii[ø°º]/i.test(clean)) return "viiº";

  // Sustituto tritonal: subV7, subV7/V, etc.
  if (/^subv/i.test(clean)) return "subV7";

  // Grado V o V7 (función dominante: V, V7, V9, V13, V7/..., etc., excluyendo vi, vii, iv)
  if (/^v(?!i|ii)[0-9\/]*/i.test(clean) || clean.toUpperCase() === "V" || clean.toUpperCase().startsWith("V7")) {
    return "V7";
  }

  // Grado vii (séptimo grado)
  if (/^vii(?![iv])/i.test(clean)) return "viiº";

  // Grado vi (sexto grado menor)
  if (/^vi(?![iv])/i.test(clean)) return "vi";

  // Grado bIII (tercer grado relativo mayor en tonalidad menor)
  if (/^biii/i.test(clean)) return "bIII";

  // Grado bVI (sexto grado bemol en tonalidad menor)
  if (/^bvi/i.test(clean)) return "bVI";

  // Grado bVII (séptimo grado bemol / subtónica)
  if (/^bvii/i.test(clean)) return "bVII";

  // Grado IV (cuarto grado mayor) o iv (cuarto grado menor)
  if (/^iv(?![iv])/i.test(clean)) {
    return clean.startsWith("iv") ? "iv" : "IV";
  }

  // Grado iii (tercer grado menor)
  if (/^iii(?![iv])/i.test(clean)) return "iii";

  // Grado ii (segundo grado menor)
  if (/^ii(?![iv])/i.test(clean)) return "ii";

  // Grado I o i (primer grado / tónica sin función dominante)
  if (/^i(?![iv])/i.test(clean)) {
    return clean.startsWith("i") ? "i" : "I";
  }

  return null;
}

let lastAssignedDominantScale: {
  root: RootNote;
  type: string;
  mapping: ScaleMapping;
} | null = null;

export function getSuggestedScale(
  root: RootNote,
  type: ChordTypeOptions,
  keyCenter: string = "C",
  romanNumeral?: string,
  isMinorKey?: boolean,
  targetChord?: { root: RootNote; type: string } | null,
  category?: string,
  precedingChord?: {
    root: RootNote;
    type: string;
    scale?: SuggestedScale | ScaleMapping;
    suggestedScale?: SuggestedScale;
  } | null
): SuggestedScale {
  const isKeyCenterMinor = Boolean(isMinorKey || keyCenter.endsWith("m"));
  const cleanKeyCenter = (keyCenter.endsWith("m") ? keyCenter.slice(0, -1) : keyCenter) as RootNote;
  const effectiveKeyCenter: RootNote = cleanKeyCenter in ROOT_MIDI_OFFSET_MAP ? cleanKeyCenter : "C";
  const isSameTonicAsKey = ROOT_MIDI_OFFSET_MAP[root] === ROOT_MIDI_OFFSET_MAP[effectiveKeyCenter];

  const rawUpper = (romanNumeral || "").toUpperCase().trim();
  const cleanNumeral = (romanNumeral || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  let selectedMapping: ScaleMapping = scaleMappings.major;

  // 1. Acordes especiales no diatónicos explícitos (alterados, disminuidos, aumentados, maj7#11)
  if (type === "alt") {
    selectedMapping = scaleMappings.altered;
  } else if (type === "dim" || type === "dim7" || type === "dim7_9" || type === "dim7_11" || type === "dim7_b13") {
    selectedMapping = scaleMappings.diminished;
  } else if (type === "aug") {
    selectedMapping = scaleMappings.augmented;
  } else if (type === "maj7#11" || type === "maj9#11") {
    selectedMapping = scaleMappings.lydian;
  } else {
    // 2. Sustitutos Tritonales (subV7, subV7/V, etc.): Lidia Dominante
    const isTritoneSub =
      (category &&
        (category === "tritone_substitute" ||
          category.includes("tritone") ||
          category.includes("subv"))) ||
      cleanNumeral.includes("subv") ||
      rawUpper.includes("SUBV") ||
      type === "7#11";

    if (isTritoneSub) {
      selectedMapping = scaleMappings.tritoneSubstitute; // Lidia Dominante: [0, 2, 4, 6, 7, 9, 10]
    } else {
      // 3. Identificación de acordes con función dominante (V7, V9, V13, dominantes secundarios, etc.)
      const isDominantType = [
        "7", "9", "13", "7sus4", "9sus4", "13sus4", "7b9", "7#9", "7b13"
      ].includes(type);
      const isDominantDegree =
        (rawUpper === "V" ||
          rawUpper.startsWith("V7") ||
          rawUpper.startsWith("V.") ||
          rawUpper.startsWith("V/") ||
          rawUpper.startsWith("V ")) &&
        !rawUpper.startsWith("VI") &&
        !rawUpper.startsWith("VII") &&
        !rawUpper.startsWith("IV");

      if (isDominantType || isDominantDegree) {
        // === CHEQUEO INICIAL: HERENCIA DE ESCALA PARA ACORDES CONSECUTIVOS IDÉNTICOS ===
        // Si el acorde actual es EXACTAMENTE IGUAL al acorde inmediatamente anterior (índice - 1) (ej. D7 y D7),
        // el acorde actual DEBE heredar automáticamente la misma escala que se le asignó al acorde anterior,
        // omitiendo cualquier otra evaluación de contexto (look-ahead o look-behind).
        // Esta regla se ejecuta ANTES de las reglas de contexto Mayor (Dórico/Mixolidio) y Menor (Locrio/Frigio Dominante).
        const isIdenticalToPreceding = Boolean(
          precedingChord &&
          precedingChord.root === root &&
          precedingChord.type === type
        );

        if (isIdenticalToPreceding) {
          if (precedingChord?.suggestedScale) {
            const rawName = precedingChord.suggestedScale.name.replace(new RegExp(`^${root}\\s+`), "");
            const foundMapping = Object.values(scaleMappings).find(m => m.name === rawName);
            selectedMapping = foundMapping || {
              name: rawName,
              intervals: precedingChord.suggestedScale.intervals
            };
          } else if (precedingChord?.scale) {
            if ("intervals" in precedingChord.scale && "name" in precedingChord.scale) {
              const rawName = (precedingChord.scale as any).name.replace(new RegExp(`^${root}\\s+`), "");
              const foundMapping = Object.values(scaleMappings).find(m => m.name === rawName);
              selectedMapping = foundMapping || {
                name: rawName,
                intervals: (precedingChord.scale as any).intervals
              };
            }
          } else if (
            lastAssignedDominantScale &&
            lastAssignedDominantScale.root === root &&
            lastAssignedDominantScale.type === type
          ) {
            selectedMapping = lastAssignedDominantScale.mapping;
          } else {
            selectedMapping = scaleMappings.dominantDefault;
          }
        } else {
          // Evaluación Dinámica del contexto armónico para acordes Dominantes (V7, V9, V13, etc.):
          // 1. Prioridad: Evaluación del Contexto ii-V (Look-behind estricto):
          //    - Contexto Mayor (Dórico -> Mixolidio): Si el acorde V7 está precedido por un acorde
          //      con cualidad m7 o m9, asígnale ESTRICTAMENTE la escala Mixolidia al V7.
          //    - Contexto Menor (Locrio -> Frigio Dominante): Si el acorde V7 está precedido por un
          //      acorde con cualidad m7b5 o semidisminuido, asígnale ESTRICTAMENTE la escala Frigia Dominante al V7.
          // 2. Si no hay acorde previo que determine el contexto ii-V (ej. dominante aislado o primer acorde):
          //    Evaluación Dinámica (Look-ahead Global hacia el acorde destino i + 1):
          //    - Si el acorde destino es MENOR (contiene 'm', 'min', '-'): Frigia Dominante.
          //    - Si el acorde destino es MAYOR (contiene 'maj', 'M', o no tiene modificador menor): Mixolidia.
          //    - Si es el último acorde del tema y no hay i + 1: retorna Mixolidia por defecto.

          let comesFromHalfDim = false;
          let comesFromMin7 = false;

          if (precedingChord && precedingChord.type) {
            const pType = precedingChord.type.trim();
            if (
              pType === "m7b5" ||
              pType === "m11b5" ||
              pType === "mb13b5" ||
              pType === "m9b5" ||
              pType === "dim7" ||
              pType.includes("b5") ||
              pType.includes("ø")
            ) {
              comesFromHalfDim = true;
            } else if (
              (pType === "m7" ||
              pType === "m9" ||
              pType === "m11" ||
              pType === "m13" ||
              pType === "Menor" ||
              (pType.startsWith("m") && !pType.startsWith("maj"))) &&
              !isExplicitMajorChord(pType)
            ) {
              comesFromMin7 = true;
            }
          }

          if (comesFromMin7) {
            // Contexto Mayor (Dórico -> Mixolidio): asignación ESTRICTA de Mixolidia
            selectedMapping = scaleMappings.dominantDefault; // Mixolidia: [0, 2, 4, 5, 7, 9, 10]
          } else if (comesFromHalfDim) {
            // Contexto Menor (Locrio -> Frigio Dominante): asignación ESTRICTA de Frigia Dominante
            selectedMapping = scaleMappings.dominantMinorResolution; // Frigia Dominante: [0, 1, 4, 5, 7, 8, 10]
          } else {
            // Look-ahead hacia el destino si no hay precedencia ii / iiø
            let resolvesToMinor = false;
            let resolvesToMajor = false;

            if (targetChord && targetChord.type) {
              const targetTypeOrQuality = targetChord.type.trim();
              if (isTargetMinorQuality(targetTypeOrQuality)) {
                resolvesToMinor = true;
              } else if (isTargetMajorQuality(targetTypeOrQuality)) {
                resolvesToMajor = true;
              }
            }

            if (resolvesToMinor) {
              selectedMapping = scaleMappings.dominantMinorResolution; // Frigia Dominante
            } else if (resolvesToMajor) {
              selectedMapping = scaleMappings.dominantDefault; // Mixolidia
            } else {
              selectedMapping = scaleMappings.dominantDefault; // Mixolidia por defecto
            }
          }
        }

        // Registrar la asignación de este acorde dominante para permitir herencia si se repite a continuación
        lastAssignedDominantScale = {
          root,
          type,
          mapping: selectedMapping
        };
      } else {
        // 4. Mapeo Basado en Grados (Roman Numerals) para acordes diatónicos:
        // Evalúa primero la variable que almacena el grado analizado (ej. I, ii, IV, vi, etc.), NO el nombre literal del acorde.
        const functionalDegree = extractDegreeFromRomanNumeral(romanNumeral);

        let degreeMatched = false;
        if (functionalDegree) {
          switch (functionalDegree) {
            case "I":
              // 1. Sensibilidad a Mayúsculas/Minúsculas & Precedencia de la Cualidad del Acorde:
              // Si el grado analizado es I (mayúscula) o el acorde tiene cualidad mayor (contiene "maj7", "M", o no tiene modificador 'm'),
              // la escala asignada DEBE ser Jónica por defecto, IGNORANDO si la variable global de la canción es isMinorKey = true.
              selectedMapping = scaleMappings.major; // Jónica
              degreeMatched = true;
              break;

            case "i":
              // 3. Restricción Eólica:
              // La escala Eólica debe aplicarse ÚNICA Y EXCLUSIVAMENTE cuando el grado analizado es i (minúscula),
              // vi (minúscula) o la cualidad del acorde es explícitamente menor (m, m7).
              // Un acorde de cualidad Mayor o maj7 JAMÁS puede llevar escala Eólica.
              if (isExplicitMajorChord(type)) {
                selectedMapping = scaleMappings.major; // Jónica por cualidad mayor
              } else {
                selectedMapping = scaleMappings.minorTonic; // Eólica: [0, 2, 3, 5, 7, 8, 10]
              }
              degreeMatched = true;
              break;

            case "ii":
              // Grado ii -> Dórica (Dorian).
              selectedMapping = scaleMappings.minorDefault;
              degreeMatched = true;
              break;

            case "iii":
              // Grado iii -> Frigia (Phrygian).
              selectedMapping = scaleMappings.phrygian;
              degreeMatched = true;
              break;

            case "bIII":
              // Grado bIII -> Jónica (Ionian / relativo mayor).
              selectedMapping = scaleMappings.major;
              degreeMatched = true;
              break;

            case "IV":
              // Grado IV -> Lidia (Lydian). NUNCA Jónica.
              selectedMapping = scaleMappings.lydian;
              degreeMatched = true;
              break;

            case "iv":
              // Grado iv -> Dórica (Dorian).
              selectedMapping = scaleMappings.minorDefault;
              degreeMatched = true;
              break;

            case "vi":
              // Grado vi -> Eólica (Aeolian). NUNCA Dórica.
              if (isExplicitMajorChord(type)) {
                selectedMapping = scaleMappings.major;
              } else {
                selectedMapping = scaleMappings.minorTonic;
              }
              degreeMatched = true;
              break;

            case "bVI":
              // Grado bVI -> Lidia (Lydian).
              selectedMapping = scaleMappings.lydian;
              degreeMatched = true;
              break;

            case "bVII":
              // Grado bVII -> Mixolidia si es dominante, o Jónica si es maj
              selectedMapping = isDominantQuality(type) ? scaleMappings.dominantDefault : scaleMappings.major;
              degreeMatched = true;
              break;

            case "viiº":
            case "iiº":
              // Grado viiº o iiº -> Locria (Locrian).
              selectedMapping = scaleMappings.halfDiminished;
              degreeMatched = true;
              break;
          }
        }

        // 5. Fallback si no hay grado analizado o no coincidió en el switch directo
        if (!degreeMatched) {
          if (type === "m7b5" || type === "m11b5" || type === "mb13b5" || type === "m9b5") {
            selectedMapping = scaleMappings.halfDiminished; // Locria
          } else if (isExplicitMajorChord(type)) {
            const isDegreeIV =
              !isKeyCenterMinor &&
              (ROOT_MIDI_OFFSET_MAP[root] - ROOT_MIDI_OFFSET_MAP[effectiveKeyCenter] + 12) % 12 === 5;
            if (isDegreeIV) {
              selectedMapping = scaleMappings.lydian;
            } else {
              selectedMapping = scaleMappings.major;
            }
          } else if (isMinorQuality(type)) {
            const isTonicInMinor = isKeyCenterMinor && isSameTonicAsKey;
            if (isTonicInMinor) {
              selectedMapping = scaleMappings.minorTonic; // Eólica para primer grado menor
            } else {
              selectedMapping = scaleMappings.minorDefault; // Dórica por defecto
            }
          } else {
            selectedMapping = scaleMappings.major;
          }
        }
      }
    }
  }

  // Restricción Eólica estricta:
  // La escala Eólica debe aplicarse ÚNICA Y EXCLUSIVAMENTE cuando el grado analizado es i (minúscula),
  // vi (minúscula) o la cualidad del acorde es explícitamente menor (m, m7).
  // Un acorde de cualidad Mayor o maj7 JAMÁS puede llevar escala Eólica.
  if (selectedMapping.name === "Eólica") {
    const functionalDegree = extractDegreeFromRomanNumeral(romanNumeral);
    const isAllowedAeolian =
      (functionalDegree === "i" || functionalDegree === "vi" || isMinorQuality(type)) &&
      !isExplicitMajorChord(type) &&
      functionalDegree !== "I";

    if (!isAllowedAeolian) {
      selectedMapping = scaleMappings.major; // Jónica por defecto para cualidad mayor
    }
  }

  const scaleName = `${root} ${selectedMapping.name}`;
  const notes = selectedMapping.intervals.map(interval => transposeRoot(root, interval, effectiveKeyCenter));

  return { name: scaleName, notes, intervals: selectedMapping.intervals };
}

export function parseChord(chordString: string): { root: RootNote; type: ChordTypeOptions; suffix: string } {
  // Trim input
  const cleanChordName = chordString.trim();
  if (cleanChordName.length === 0) {
    return { root: "C", type: "Mayor", suffix: "" };
  }

  let root: RootNote = "C";
  let suffix = "";

  // 1. Extract root note (either 2 characters like C#, Bb, or 1 character like C, D, E)
  if (cleanChordName.length >= 2) {
    const doubleChar = cleanChordName.substring(0, 2) as RootNote;
    if (doubleChar in ROOT_MIDI_OFFSET_MAP) {
      root = doubleChar;
      suffix = cleanChordName.substring(2);
    } else {
      const singleChar = cleanChordName.substring(0, 1) as RootNote;
      if (singleChar in ROOT_MIDI_OFFSET_MAP) {
        root = singleChar;
        suffix = cleanChordName.substring(1);
      }
    }
  } else {
    const singleChar = cleanChordName.substring(0, 1) as RootNote;
    if (singleChar in ROOT_MIDI_OFFSET_MAP) {
      root = singleChar;
    }
  }

  // 2. Map standard Real Book suffixes to our supported ChordTypeOptions
  let type: ChordTypeOptions = "Mayor";
  const baseSuffix =
    suffix.includes("/") && !suffix.startsWith("6/9")
      ? suffix.split("/")[0].trim()
      : suffix;

  // Check from most specific/complex suffixes down to simple ones
  if (
    baseSuffix === "alt" ||
    baseSuffix === "7alt" ||
    baseSuffix === "alt7" ||
    baseSuffix === "7#9#5" ||
    baseSuffix === "7b9#5" ||
    baseSuffix === "7#9b13" ||
    baseSuffix === "7b9#9"
  ) {
    type = "alt";
  } else if (
    baseSuffix === "m7b5" ||
    baseSuffix === "min7b5" ||
    baseSuffix === "mi7b5" ||
    baseSuffix === "m7(b5)" ||
    baseSuffix === "ø" ||
    baseSuffix === "ø7" ||
    baseSuffix === "-7b5"
  ) {
    type = "m7b5";
  } else if (baseSuffix === "m11b5" || baseSuffix === "min11b5" || baseSuffix === "-11b5") {
    type = "m11b5";
  } else if (baseSuffix === "mb13b5" || baseSuffix === "m7b5(b13)" || baseSuffix === "m7b5b13") {
    type = "mb13b5";
  } else if (baseSuffix === "m9b5" || baseSuffix === "min9b5" || baseSuffix === "-9b5") {
    type = "m9b5";
  } else if (baseSuffix === "dim7(b13)" || baseSuffix === "dim7b13") {
    type = "dim7_b13";
  } else if (baseSuffix === "dim7(11)" || baseSuffix === "dim711") {
    type = "dim7_11";
  } else if (baseSuffix === "dim7(9)" || baseSuffix === "dim79") {
    type = "dim7_9";
  } else if (baseSuffix === "dim7" || baseSuffix === "°7" || baseSuffix === "o7") {
    type = "dim7";
  } else if (baseSuffix === "dim" || baseSuffix === "°" || baseSuffix === "o") {
    type = "dim7";
  } else if (baseSuffix === "aug" || baseSuffix === "+" || baseSuffix === "aug5" || baseSuffix === "+5") {
    type = "aug";
  } else if (
    baseSuffix === "maj7#11" ||
    baseSuffix === "maj7(#11)" ||
    baseSuffix === "Maj7#11" ||
    baseSuffix === "Δ#11" ||
    baseSuffix === "Δ(#11)" ||
    baseSuffix === "maj#11" ||
    baseSuffix === "M7#11"
  ) {
    type = "maj7#11";
  } else if (
    baseSuffix === "maj9#11" ||
    baseSuffix === "maj9(#11)" ||
    baseSuffix === "Maj9#11" ||
    baseSuffix === "Δ9#11" ||
    baseSuffix === "Δ9(#11)"
  ) {
    type = "maj9#11";
  } else if (baseSuffix === "maj13" || baseSuffix === "Maj13" || baseSuffix === "Δ13" || baseSuffix === "M13") {
    type = "maj13";
  } else if (baseSuffix === "maj9" || baseSuffix === "Maj9" || baseSuffix === "Δ9" || baseSuffix === "M9") {
    type = "maj9";
  } else if (
    baseSuffix === "maj7" ||
    baseSuffix === "Maj7" ||
    baseSuffix === "Δ" ||
    baseSuffix === "Δ7" ||
    baseSuffix === "M7"
  ) {
    type = "maj7";
  } else if (
    baseSuffix === "m(maj7)" ||
    baseSuffix === "mΔ7" ||
    baseSuffix === "-Δ7" ||
    baseSuffix === "min(maj7)" ||
    baseSuffix === "mM7" ||
    baseSuffix === "m(7M)" ||
    baseSuffix === "minmaj7" ||
    baseSuffix === "mmaj7" ||
    baseSuffix === "mMaj7"
  ) {
    type = "m(maj7)";
  } else if (baseSuffix === "m13" || baseSuffix === "min13" || baseSuffix === "mi13" || baseSuffix === "-13") {
    type = "m13";
  } else if (baseSuffix === "m11" || baseSuffix === "min11" || baseSuffix === "mi11" || baseSuffix === "-11") {
    type = "m11";
  } else if (baseSuffix === "m9" || baseSuffix === "min9" || baseSuffix === "mi9" || baseSuffix === "-9") {
    type = "m9";
  } else if (baseSuffix === "m7" || baseSuffix === "min7" || baseSuffix === "mi7" || baseSuffix === "-7") {
    type = "m7";
  } else if (
    baseSuffix === "m6" ||
    baseSuffix === "min6" ||
    baseSuffix === "mi6" ||
    baseSuffix === "-6" ||
    baseSuffix === "m6/9" ||
    baseSuffix === "m6(9)"
  ) {
    type = "m6";
  } else if (baseSuffix === "m-add9" || baseSuffix === "m(add9)" || baseSuffix === "madd9") {
    type = "m-add9";
  } else if (baseSuffix === "6(9)" || baseSuffix === "69" || baseSuffix === "6/9") {
    type = "6(9)";
  } else if (baseSuffix === "6" || baseSuffix === "maj6" || baseSuffix === "M6") {
    type = "6";
  } else if (baseSuffix === "add9" || baseSuffix === "(add9)") {
    type = "add9";
  } else if (
    baseSuffix === "7#11" ||
    baseSuffix === "7(#11)" ||
    baseSuffix === "9#11" ||
    baseSuffix === "9(#11)" ||
    baseSuffix === "13#11" ||
    baseSuffix === "13(#11)"
  ) {
    type = "7#11";
  } else if (
    baseSuffix === "7b13" ||
    baseSuffix === "7(b13)" ||
    baseSuffix === "7#5" ||
    baseSuffix === "7(#5)" ||
    baseSuffix === "7+5" ||
    baseSuffix === "7+" ||
    baseSuffix === "9#5" ||
    baseSuffix === "7b9b13" ||
    baseSuffix === "7(b9,b13)"
  ) {
    type = "7b13";
  } else if (
    baseSuffix === "7b9" ||
    baseSuffix === "7(b9)" ||
    baseSuffix === "7-9" ||
    baseSuffix === "13b9" ||
    baseSuffix === "13(b9)"
  ) {
    type = "7b9";
  } else if (baseSuffix === "7#9" || baseSuffix === "7(#9)" || baseSuffix === "7+9") {
    type = "7#9";
  } else if (
    baseSuffix === "7b5" ||
    baseSuffix === "7(b5)" ||
    baseSuffix === "9b5" ||
    baseSuffix === "9(b5)"
  ) {
    type = "7#11";
  } else if (baseSuffix === "13sus4" || baseSuffix === "13sus" || baseSuffix === "7sus13") {
    type = "13sus4";
  } else if (baseSuffix === "9sus4" || baseSuffix === "9sus" || baseSuffix === "7sus9") {
    type = "9sus4";
  } else if (
    baseSuffix === "7sus4" ||
    baseSuffix === "7sus" ||
    baseSuffix === "sus4" ||
    baseSuffix === "sus" ||
    baseSuffix === "7sus2"
  ) {
    type = "7sus4";
  } else if (baseSuffix === "13" || baseSuffix === "13dom") {
    type = "13";
  } else if (baseSuffix === "9" || baseSuffix === "9dom") {
    type = "9";
  } else if (baseSuffix === "7" || baseSuffix === "dom7" || baseSuffix === "7dom") {
    type = "7";
  } else if (baseSuffix === "11" || baseSuffix === "11dom") {
    type = "9sus4";
  } else if (baseSuffix === "m" || baseSuffix === "min" || baseSuffix === "mi" || baseSuffix === "-") {
    type = "Menor";
  } else {
    // Default to Mayor if nothing else
    type = "Mayor";
  }

  return { root, type, suffix };
}

/**
 * Transpone un acorde completo (ej. "Am7", "Gmaj7", o "C/E") por un número de semitonos
 * respetando la ortografía armónica de la tonalidad destino.
 */
export function transposeChordString(
  chordString: string,
  semitones: number,
  keyCenter: RootNote | string = "C"
): string {
  if (!chordString || semitones === 0 || chordString.trim() === "%") return chordString;

  // Manejo de acordes con bajo invertido (Slash chords, ej. "C/E", "Gm7/Bb")
  if (chordString.includes("/") && !chordString.includes("6/9")) {
    const slashIndex = chordString.indexOf("/");
    const mainChord = chordString.substring(0, slashIndex);
    const bassNote = chordString.substring(slashIndex + 1);
    const { root: mainRoot, suffix: mainSuffix } = parseChord(mainChord);
    const newMainRoot = transposeRoot(mainRoot, semitones, keyCenter);
    const { root: bassRoot, suffix: bassSuffix } = parseChord(bassNote);
    const newBassRoot = transposeRoot(bassRoot, semitones, keyCenter);
    return `${newMainRoot}${mainSuffix}/${newBassRoot}${bassSuffix}`;
  }

  const { root, suffix } = parseChord(chordString);
  const newRoot = transposeRoot(root, semitones, keyCenter);
  return `${newRoot}${suffix}`;
}

/**
 * Tabla Oficial de Clases de Altura (Pitch Classes 0-11 relativos a la Fundamental R)
 * estilo "Piano a una mano" de iReal Pro (Close-Position Jazz Voicings).
 */
export function getIRealPitchClassIntervals(
  type: ChordTypeOptions | string,
  rawSuffix: string = ""
): number[] {
  const cleanSuffix =
    rawSuffix.includes("/") && !rawSuffix.startsWith("6/9")
      ? rawSuffix.split("/")[0].trim()
      : rawSuffix.trim();

  // 7b5: [0, 4, 6, 10] (1, 3, b5, b7)
  if (
    cleanSuffix === "7b5" ||
    cleanSuffix === "7(b5)" ||
    cleanSuffix === "9b5" ||
    cleanSuffix === "9(b5)"
  ) {
    return [0, 4, 6, 10];
  }

  switch (type) {
    // Acordes de Séptima y Sexta Puros (1 - 3 - 5 - 7 / 6, SIN 9na ni 13na):
    case "maj7":
      return [0, 4, 7, 11];

    case "m7":
      return [0, 3, 7, 10];

    case "7":
      return [0, 4, 7, 10];

    case "m(maj7)":
      return [0, 3, 7, 11];

    case "m7b5":
      return [0, 3, 6, 10];

    case "dim7":
      return [0, 3, 6, 9];

    case "6":
      return [0, 4, 7, 9];

    case "m6":
      return [0, 3, 7, 9];

    case "7sus4":
      return [0, 5, 7, 10];

    // Tríadas puras:
    case "Mayor":
      return [0, 4, 7];

    case "Menor":
      return [0, 3, 7];

    case "dim":
      return [0, 3, 6];

    case "aug":
      return [0, 4, 8];

    // Acordes con Tensiones y Alteraciones Explícitas:
    case "maj9":
      return [4, 7, 11, 2];

    case "maj13":
      return [4, 9, 11, 2];

    case "maj7#11":
    case "maj9#11":
      return [4, 6, 11, 2];

    case "6(9)":
      return [4, 7, 9, 2];

    case "m9":
      return [3, 7, 10, 2];

    case "m11":
      return [3, 5, 10, 2];

    case "m13":
      return [3, 9, 10, 2];

    case "m11b5":
      return [3, 5, 6, 10];

    case "mb13b5":
      return [3, 6, 8, 10];

    case "m9b5":
      return [3, 6, 10, 2];

    case "dim7_9":
      return [3, 6, 9, 2];

    case "dim7_11":
      return [3, 6, 9, 5];

    case "dim7_b13":
      return [3, 6, 9, 8];

    case "9":
      return [4, 7, 10, 2];

    case "13":
      return [4, 9, 10, 2];

    case "7b9":
      // 7b9 (Exacto iReal Pro): [4, 7, 10, 1] (3, 5, b7, b9)
      return [4, 7, 10, 1];

    case "7b13":
    case "alt":
      // 7b13 / 7#5 / 7alt (Exacto iReal Pro): [4, 8, 10, 0] (3, b13, b7, 1)
      return [4, 8, 10, 0];

    case "7#11":
      // 7#11 / 9#11 (Exacto iReal Pro): [10, 4, 6, 9] (b7, 3, #11, 13)
      return [10, 4, 6, 9];

    case "7#9":
      // 7#9: [0, 4, 10, 3] (1, 3, b7, #9)
      return [0, 4, 10, 3];

    case "9sus4":
      return [5, 7, 10, 2];

    case "13sus4":
      return [5, 9, 10, 2];

    case "add9":
      return [0, 2, 4, 7];

    case "m-add9":
      return [0, 2, 3, 7];

    default:
      return [0, 4, 7];
  }
}

export function getJazzVoicingFormulas(
  type: ChordTypeOptions | string,
  rawSuffix: string = ""
): { typeA: number[]; typeB: number[] } {
  const intervals = getIRealPitchClassIntervals(type, rawSuffix);
  return { typeA: intervals, typeB: intervals };
}

export function getChordIntervals(type: ChordTypeOptions, rawSuffix: string = ""): number[] {
  return getIRealPitchClassIntervals(type, rawSuffix);
}

/**
 * Empaquetado Automático en Octava Central estilo iReal Pro (packAroundMiddleC / buildIRealVoicing).
 * Coloca las 4 notas del acorde en posición cerrada compacta centrada alrededor de C4 (MIDI 60.5)
 * dentro del rango estricto E3 (MIDI 52) a G4 (MIDI 67).
 */
export function buildIRealVoicing(
  rootPitchClass: number,
  intervals: number[],
  prevVoicing?: number[] | null,
  isSharpNine: boolean = false
): number[] {
  const pitchClasses = Array.from(
    new Set(intervals.map((i) => ((rootPitchClass + i) % 12 + 12) % 12))
  );
  const targetCount = pitchClasses.length;
  const thirdPc = (rootPitchClass + 4) % 12;
  const sharpNinePc = (rootPitchClass + 3) % 12;

  // Clases de altura que son tensiones puras (b9, 9, #11, b13) y no deben quedar como nota más grave si hay guía disponible
  const tensionIntervals = new Set([1, 2, 6, 8]);
  const tensionPitchClasses = new Set(
    intervals
      .filter((i) => tensionIntervals.has(((i % 12) + 12) % 12))
      .map((i) => ((rootPitchClass + i) % 12 + 12) % 12)
  );

  const candidates: number[][] = [];

  for (let startMidi = 52; startMidi <= 60; startMidi++) {
    const voicing: number[] = [];
    const usedPc = new Set<number>();

    // Buscar las 4 notas del acorde en orden ascendente compacto a partir de startMidi
    for (let step = 0; step < 16 && voicing.length < targetCount; step++) {
      const midi = startMidi + step;
      if (midi > 67) break;
      const pc = midi % 12;
      if (pitchClasses.includes(pc) && !usedPc.has(pc)) {
        // Evitar que para 7#9 la #9 quede debajo de la 3ra mayor
        if (isSharpNine && pc === sharpNinePc && !usedPc.has(thirdPc)) {
          continue;
        }
        voicing.push(midi);
        usedPc.add(pc);
      }
    }

    if (voicing.length === targetCount && voicing[voicing.length - 1] <= 67 && voicing[0] >= 52) {
      // Evitar duplicar candidatos idénticos cuando distintos startMidi convergen al mismo voicing
      const key = voicing.join(",");
      if (!candidates.some((c) => c.join(",") === key)) {
        candidates.push(voicing);
      }
    }
  }

  // Fallback si un 7#9 necesita iniciar en b7 con la 3ra antes de la #9 dentro de 52..67
  if (candidates.length === 0) {
    for (let startMidi = 52; startMidi <= 62; startMidi++) {
      const voicing: number[] = [];
      const usedPc = new Set<number>();
      for (let step = 0; step < 16 && voicing.length < targetCount; step++) {
        const midi = startMidi + step;
        if (midi > 67) break;
        const pc = midi % 12;
        if (pitchClasses.includes(pc) && !usedPc.has(pc)) {
          voicing.push(midi);
          usedPc.add(pc);
        }
      }
      if (voicing.length === targetCount && voicing[voicing.length - 1] <= 67 && voicing[0] >= 52) {
        candidates.push(voicing);
      }
    }
  }

  if (candidates.length === 0) {
    // Último respaldo garantizado dentro de 53..66
    return pitchClasses.map((pc) => {
      let m = 53 + ((pc - (53 % 12) + 12) % 12);
      if (m > 67) m -= 12;
      return m;
    }).sort((a, b) => a - b);
  }

  // Evaluar cada candidato según las reglas acústicas de iReal Pro:
  // 1. Distancia del centro de gravedad a MIDI 60.5 (C4)
  // 2. Evitar choques de segunda menor (1 semitono entre voces adyacentes, ej. F3-Gb3 o E4-F4)
  // 3. Preferir nota guía/acorde (3ra, 7ma, 5ta) en la voz inferior en lugar de una tensión (b13, 9, #11, b9)
  // 4. Suave conducción de voces (Voice Leading) respecto al acorde anterior sin salir de la caja central
  const scoreCandidate = (v: number[]): number => {
    const avg = v.reduce((s, n) => s + n, 0) / v.length;
    let score = Math.abs(avg - 60.5);

    // Penalizar choques de segunda menor (1 semitono) entre voces contiguas (ej. 13na contra b7 o 9na contra b3)
    for (let i = 0; i < v.length - 1; i++) {
      if (v[i + 1] - v[i] === 1) {
        score += 3.5;
      }
    }

    // Penalizar si la nota más grave del voicing es una tensión alterada/extensión (b9, 9, #11, b13)
    if (tensionPitchClasses.has(v[0] % 12)) {
      score += 1.6;
    }

    // Si hay voicing previo, considerar cercanía de conducción de voces manteniendo prioridad en la caja central
    if (prevVoicing && prevVoicing.length === v.length) {
      const voiceMove =
        v.reduce((sum, n, idx) => sum + Math.abs(n - prevVoicing[idx]), 0) / v.length;
      score = score * 0.75 + voiceMove * 0.25;
    }

    return score;
  };

  return candidates.sort((a, b) => scoreCandidate(a) - scoreCandidate(b))[0];
}

/**
 * Construye el Voicing de Jazz "Piano a una mano" estilo iReal Pro
 * en el rango estricto E3 (MIDI 52) a G4 (MIDI 67), centrado en C4 (MIDI 60.5).
 */
export function buildJazzVoicing(
  chordString: string,
  previousVoicing?: number[] | null
): number[] {
  const parsed = parseChord(chordString);
  const rootPitchClass = ROOT_MIDI_OFFSET_MAP[parsed.root] ?? 0;
  const intervals = getIRealPitchClassIntervals(parsed.type, parsed.suffix);
  const isSharpNine = parsed.type === "7#9";

  return buildIRealVoicing(rootPitchClass, intervals, previousVoicing, isSharpNine);
}

export function getDictionaryNotes(
  root: RootNote,
  type: ChordTypeOptions | string,
  mode: "chord" | "scale",
  startOctaveMidi: number = 48
): number[] {
  const rootOffset = ROOT_MIDI_OFFSET_MAP[root] || 0;
  const rootMidi = startOctaveMidi + rootOffset;

  if (mode === "scale") {
    // Try to find the exact scale name in the categories
    for (const category of EXPLORER_CATEGORIES) {
      for (const scale of category.scales) {
        if (scale.name === type) {
          return [...scale.intervals.map((interval) => rootMidi + interval), rootMidi + 12];
        }
      }
    }
    // Fallback: Treat type as a valid chord type option to get scale
    const suggestedScale = getSuggestedScale(root, type as ChordTypeOptions, "C");
    const notes = suggestedScale.intervals?.map((interval) => rootMidi + interval) || [];
    if (notes.length > 0) notes.push(rootMidi + 12);
    return notes;
  } else {
    // Mode chord: construir Voicing de Jazz limpio en el registro central E3 - C5
    const suffix = type === "Mayor" ? "" : type === "Menor" ? "m" : String(type);
    return buildJazzVoicing(`${root}${suffix}`);
  }
}

/**
 * Función maestra de resolución de notas de acordes (Motor de Jazz Piano Voicings de 4 notas).
 * Devuelve el voicing abierto de estudio en el registro central cálido (MIDI 52 E3 a MIDI 72 C5)
 * aplicando conducción de voces suave si se provee previousVoicing.
 */
export function getChordNotes(
  chordString: string,
  _startOctaveMidi: number = 48,
  previousVoicing?: number[] | null
): number[] {
  return buildJazzVoicing(chordString, previousVoicing);
}


