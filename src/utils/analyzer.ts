import { RootNote, ChordTypeOptions } from "../types";
import { parseChord, SuggestedScale, getSuggestedScale, isMinorQuality, isDominantQuality, isExplicitMajorChord } from "./music";
import { ROOT_MIDI_OFFSET_MAP } from "../data/chords";

export interface ChordInputContext {
  chordString: string;
  keyContext: RootNote;
  isMinorKey: boolean;
}

export type AnalysisCategory =
  | "diatonic"
  | "secondary_dominant"
  | "tritone_substitute"
  | "modal_interchange"
  | "tonal_shift"
  | "related_ii"
  | "none";

export interface AnalyzedChord {
  chordString: string;
  root: RootNote;
  type: ChordTypeOptions;
  keyContext: RootNote;
  isMinorKey: boolean;
  romanNumeral: string;
  category: AnalysisCategory;
  color?: string;
  suggestedScale?: SuggestedScale;
}

function getInterval(root1: RootNote, root2: RootNote): number {
  let v1 = ROOT_MIDI_OFFSET_MAP[root1];
  let v2 = ROOT_MIDI_OFFSET_MAP[root2];
  let diff = (v2 - v1) % 12;
  if (diff < 0) diff += 12;
  return diff;
}

function getRomanNumeral(
  keyRoot: RootNote,
  chordRoot: RootNote,
  type: string,
  isMinorKey: boolean,
  category: AnalysisCategory,
): string {
  const diff = getInterval(keyRoot, chordRoot);
  const degreeMapMajor: Record<number, string> = {
    0: "I",
    1: "bII",
    2: "II",
    3: "bIII",
    4: "III",
    5: "IV",
    6: "#IV",
    7: "V",
    8: "bVI",
    9: "VI",
    10: "bVII",
    11: "VII",
  };

  let baseDegree = degreeMapMajor[diff] || "?";

  const isMin = isMinorQuality(type);
  const isDom = isDominantQuality(type);
  const isHalfDim = type === "m7b5";
  const isDim = type === "dim7";

  let numeral = isMin ? baseDegree.toLowerCase() : baseDegree;
  if (isHalfDim) numeral = baseDegree.toLowerCase() + "ø";
  else if (isDim) numeral = baseDegree.toLowerCase() + "°";
  else if (isDom && diff === 7) numeral = baseDegree;
  else if (isDom && diff !== 7) numeral = baseDegree + "7";
  else if (isDom) numeral = baseDegree;

  if (category === "modal_interchange") {
    // Salvaguarda: NUNCA asignar (IM) a los grados diatónicos de la tonalidad menor
    if (isMinorKey && [0, 2, 3, 5, 7, 8, 10].includes(diff)) {
      // Diatónico en menor: no agregar (IM)
    } else {
      numeral += " (IM)";
    }
  }

  return numeral;
}

function classifyDiatonic(
  chordRoot: RootNote,
  chordType: string,
  keyContext: RootNote,
  isMinorKey: boolean,
): boolean {
  const diff = getInterval(keyContext, chordRoot);
  const isMin = isMinorQuality(chordType);
  const isDom = isDominantQuality(chordType);
  const isHalfDim = chordType === "m7b5";
  const isDim = chordType === "dim7";
  const isMaj = !isMin && !isDom && !isHalfDim && !isDim;

  if (!isMinorKey) {
    return (
      (diff === 0 && isMaj) ||
      (diff === 2 && isMin && !isHalfDim) ||
      (diff === 4 && isMin && !isHalfDim) ||
      (diff === 5 && isMaj) ||
      (diff === 7 && isDom) ||
      (diff === 9 && isMin && !isHalfDim) ||
      (diff === 11 && isHalfDim)
    );
  } else {
    // Escala menor natural (Eólica) diatónica:
    // i = im7 o im
    // iiº = iiø (m7b5) o ii° (dim)
    // bIII = bIIImaj7 o bIII
    // iv = ivm7 o ivm
    // v / V7 = vm7 o V7 armónico
    // bVI = bVImaj7 o bVI
    // bVII = bVII7 o bVIImaj7 o bVII, o viio (dim)
    return (
      (diff === 0 && isMin) ||
      (diff === 2 && (isHalfDim || isDim)) ||
      (diff === 3 && isMaj) ||
      (diff === 5 && isMin) ||
      (diff === 7 && (isDom || isMin)) ||
      (diff === 8 && isMaj) ||
      (diff === 10 && (isDom || isMaj)) ||
      (diff === 11 && isDim)
    );
  }
}

function classifyModalInterchange(
  chordRoot: RootNote,
  chordType: string,
  keyContext: RootNote,
  isMinorKey: boolean,
): boolean {
  const diff = getInterval(keyContext, chordRoot);
  const isMin = isMinorQuality(chordType);
  const isDom = isDominantQuality(chordType);
  const isHalfDim = chordType === "m7b5";
  const isMaj = !isMin && !isDom && !isHalfDim && !(chordType === "dim7");

  if (!isMinorKey) {
    return (
      (diff === 0 && (isMin || isHalfDim)) ||
      (diff === 2 && isHalfDim) ||
      (diff === 3 && isMaj) ||
      (diff === 5 && isMin) ||
      (diff === 7 && isMin) ||
      (diff === 8 && isMaj) ||
      (diff === 10 && (isDom || isMaj))
    );
  } else {
    return (
      (diff === 0 && isMaj) ||
      (diff === 5 && (isMaj || isDom)) ||
      (diff === 9 && isMin)
    );
  }
}

function getBaseDegree(
  keyRoot: RootNote,
  chordRoot: RootNote,
  isMinorKey: boolean,
): string {
  const diff = getInterval(keyRoot, chordRoot);
  const degreeMapMajor: Record<number, string> = {
    0: "I",
    1: "bII",
    2: "II",
    3: "bIII",
    4: "III",
    5: "IV",
    6: "#IV",
    7: "V",
    8: "bVI",
    9: "VI",
    10: "bVII",
    11: "VII",
  };
  let baseDegree = degreeMapMajor[diff] || "?";
  return baseDegree;
}

export function analyzeChord(
  chord: any,
  index: number,
  allChords: any[],
  keyContextStr: string
): { romanNumeral: string; category: string; color: string; isMinorKey?: boolean; keyContext?: RootNote; suggestedScale?: SuggestedScale } {
  const rawChord = typeof chord === 'string' ? chord : (chord?.chordName || chord?.name || '');
  if (!rawChord || rawChord.trim() === "") {
    return { romanNumeral: "-", category: "none", color: "border-zinc-700" };
  }

  // 0. Look-behind Inheritance para repetición de compás (%)
  // Busca automáticamente el último acorde válido en los compases/posiciones anteriores (soporta cadenas ej: Cmaj7 -> % -> %)
  if (rawChord.trim() === "%") {
    if (allChords && allChords.length > 0) {
      for (let prevIdx = index - 1; prevIdx >= 0; prevIdx--) {
        const prev = allChords[prevIdx];
        const prevStr = typeof prev === 'string' ? prev : (prev?.chordName || prev?.name || '');
        if (prevStr && prevStr.trim() !== "" && prevStr.trim() !== "%") {
          return analyzeChord(prevStr, prevIdx, allChords, keyContextStr);
        }
      }
    }
    return analyzeChord("C", index, allChords, keyContextStr);
  }

  let isGlobalMinor = keyContextStr.endsWith("m") || /m|-|min/i.test(keyContextStr);
  const globalKey = keyContextStr.replace(/m|-|min/gi, "").trim() as RootNote;
  
  const { root, type } = parseChord(rawChord);

  // Detección Dinámica de Tonalidad Menor:
  // Si los metadatos de la canción indican una tonalidad menor (ej. "Cm"),
  // o si el primer/último acorde de la estructura es un grado menor (m, m7),
  // el sistema debe establecer una variable global isMinorKey = true.
  if (!isGlobalMinor && allChords && allChords.length > 0) {
    const validChords = allChords.filter(s => {
      const str = typeof s === 'string' ? s : (s?.chordName || s?.name || '');
      return str && str.trim() !== "" && str !== "%";
    });
    if (validChords.length > 0) {
      const getStr = (c: any) => typeof c === 'string' ? c : (c?.chordName || c?.name || '');
      const firstP = parseChord(getStr(validChords[0]));
      const lastP = parseChord(getStr(validChords[validChords.length - 1]));
      const tonicKey = (globalKey in ROOT_MIDI_OFFSET_MAP ? globalKey : "C") as RootNote;
      if (
        (isMinorQuality(firstP.type) && ROOT_MIDI_OFFSET_MAP[firstP.root] === ROOT_MIDI_OFFSET_MAP[tonicKey]) ||
        (isMinorQuality(lastP.type) && ROOT_MIDI_OFFSET_MAP[lastP.root] === ROOT_MIDI_OFFSET_MAP[tonicKey])
      ) {
        isGlobalMinor = true;
      }
    }
  }
  
  const getRaw = (idx: number) => {
    if (idx < 0 || idx >= allChords.length) return null;
    const c = allChords[idx];
    const str = typeof c === 'string' ? c : (c?.chordName || c?.name || '');
    return str.trim() !== "" ? str : null;
  };

  const safeParse = (str: string | null) => str ? parseChord(str) : null;
  const prevChordStr = getRaw(index - 1);
  const prevParsed = safeParse(prevChordStr);

  // 0. Lookbehind Inheritance for consecutive identical chords
  if (index > 0 && prevParsed && prevParsed.root === root && prevParsed.type === type) {
    return analyzeChord(prevChordStr, index - 1, allChords, keyContextStr);
  }

  // Helper flags
  const isMinQuality = isMinorQuality(type) || type === "m7b5" || type === "dim7";
  const isDomQuality = isDominantQuality(type);
  const isMajQuality = type === "Mayor" || type.startsWith("maj");

  let category: AnalysisCategory = "diatonic";
  let numeral = "";

  const currParsed = { root, type };

  const getSlashTarget = (targetRoot: RootNote): string | null => {
    const diff = getInterval(globalKey, targetRoot);
    if (!isGlobalMinor) {
      switch (diff) {
        case 2: return "ii";
        case 4: return "iii";
        case 5: return "IV";
        case 7: return "V";
        case 9: return "vi";
        default: return null;
      }
    } else {
      switch (diff) {
        case 2: return "ii°";
        case 5: return "iv";
        case 7: return "V"; 
        case 8: return "bVI";
        default: return null;
      }
    }
  };

  const skipDuplicatesForwards = (startIdx: number) => {
    let currParsed = safeParse(getRaw(startIdx));
    for (let i = startIdx + 1; i < allChords.length; i++) {
       const str = getRaw(i);
       const p = safeParse(str);
       if (p && (p.root !== currParsed?.root || p.type !== currParsed?.type)) return { parsed: p, idx: i };
    }
    return null;
  };

  const skipDuplicatesBackwards = (startIdx: number) => {
    let currParsed = safeParse(getRaw(startIdx));
    for (let i = startIdx - 1; i >= 0; i--) {
       const str = getRaw(i);
       const p = safeParse(str);
       if (p && (p.root !== currParsed?.root || p.type !== currParsed?.type)) return { parsed: p, idx: i };
    }
    return null;
  };

  const p1 = skipDuplicatesForwards(index);
  const m1 = skipDuplicatesBackwards(index);

  // Helper to check enharmonic equivalence
  const isSamePitch = (r1: RootNote, r2: RootNote) => ROOT_MIDI_OFFSET_MAP[r1] === ROOT_MIDI_OFFSET_MAP[r2];

  // === RULE 0.1: BLOQUE CADENCIAL DINÁMICO ii - V (Override de Dominante Precedido por su ii) ===
  // Si el sistema detecta un acorde m7 (etiquetado como ii, iv, etc.) seguido inmediatamente por un acorde dominante (7, 9, 13)
  // cuya raíz se encuentre a un intervalo exacto de Cuarta Justa ascendente (ej. de Abm7 a Db7), se confirma un bloque cadencial.
  // Bajo esta condición, el acorde dominante DEBE ser etiquetado visualmente con la función de V7,
  // eliminando cualquier etiqueta de sobre-análisis como V7/IV, V7/iii o V7/V.
  if (!numeral && isDomQuality && m1?.parsed) {
    const isM1Min = isMinorQuality(m1.parsed.type) || m1.parsed.type === "m7b5" || m1.parsed.type === "dim7" || m1.parsed.type.includes("b5") || m1.parsed.type.includes("ø");
    if (isM1Min && getInterval(m1.parsed.root, root) === 5) {
      numeral = "V7";
      const resolutionRootOffset = (ROOT_MIDI_OFFSET_MAP[root] + 5) % 12;
      const globalKeyOffset = ROOT_MIDI_OFFSET_MAP[globalKey as RootNote];
      const relativeOffset = isGlobalMinor ? (globalKeyOffset + 3) % 12 : (globalKeyOffset + 9) % 12;
      const isNaturalResolution = resolutionRootOffset === globalKeyOffset || resolutionRootOffset === relativeOffset;
      category = isNaturalResolution ? "diatonic" : "secondary_dominant";
    }
  }

  // === RULE 0.2 / RULE 2: RESOLUCIÓN DE DOMINANTE A CUARTA JUSTA ASCENDENTE (V7 -> I o V7/X) ===
  // Si un acorde dominante resuelve a un acorde cuya raíz está una cuarta justa ascendente:
  // - Si resuelve a la tónica global o relativa: V7 (Diatónico)
  // - Si resuelve a otro grado (ej. D7 a Gm7 en F): V7/X (Dominante Secundario, ej. V7/ii)
  if (!numeral && isDomQuality && p1?.parsed) {
    const intervalToNext = getInterval(root, p1.parsed.root);
    if (intervalToNext === 5) {
      const targetOffset = ROOT_MIDI_OFFSET_MAP[p1.parsed.root];
      const globalKeyOffset = ROOT_MIDI_OFFSET_MAP[globalKey as RootNote];
      const relativeOffset = isGlobalMinor ? (globalKeyOffset + 3) % 12 : (globalKeyOffset + 9) % 12;
      const isNaturalResolution = targetOffset === globalKeyOffset || targetOffset === relativeOffset;

      if (isNaturalResolution) {
        numeral = "V7";
        category = "diatonic";
      } else {
        category = "secondary_dominant";
        const target = getSlashTarget(p1.parsed.root);
        numeral = target ? `V7/${target}` : "V7";
      }
    }
  }

  // === RULE 0.5: BACKDOOR DOMINANT (bVII7) AISLADO ===
  // Solo califica como bVII7 si NO forma parte de un bloque cadencial ii - V (no precedido por m7 a intervalo 5)
  // y si NO resuelve una cuarta justa ascendente hacia un acorde mayor (que es V7 -> I)
  if (!numeral && isDomQuality && getInterval(globalKey, root) === 10) {
    const isPrecededByIi = m1?.parsed && (isMinorQuality(m1.parsed.type) || m1.parsed.type === "m7b5" || m1.parsed.type === "dim7") && getInterval(m1.parsed.root, root) === 5;
    const resolvesToFourth = p1?.parsed && getInterval(root, p1.parsed.root) === 5;
    if (!resolvesToFourth && !isPrecededByIi) {
      category = isGlobalMinor ? "diatonic" : "modal_interchange";
      numeral = "bVII7";
    }
  }

  // === RULE 0: TRITONE SUB ===
  if (isDomQuality && p1?.parsed && getInterval(root, p1.parsed.root) === 11) {
    category = "tritone_substitute";
    const target = getSlashTarget(p1.parsed.root);
    numeral = target ? `subV7/${target}` : "subV7";
  }
  
  // === RULE 1: ABSOLUTE ii-V PAIRS ===
  if (!numeral && isMinQuality && p1?.parsed && isDominantQuality(p1.parsed.type) && getInterval(root, p1.parsed.root) === 5) {
    if (isSamePitch(root, globalKey)) {
      numeral = isGlobalMinor ? "i" : "I";
      category = "diatonic";
    } else {
      const isHalfDim = type === "m7b5" || type === "dim7" || type.includes("b5") || type.includes("ø") || type.includes("°");
      numeral = isHalfDim ? "iiº" : "ii";
      const resolutionRootOffset = (ROOT_MIDI_OFFSET_MAP[p1.parsed.root] + 5) % 12;
      const globalKeyOffset = ROOT_MIDI_OFFSET_MAP[globalKey as RootNote];
      const relativeOffset = isGlobalMinor ? (globalKeyOffset + 3) % 12 : (globalKeyOffset + 9) % 12;
      const isNaturalResolution = resolutionRootOffset === globalKeyOffset || resolutionRootOffset === relativeOffset;
      category = isNaturalResolution ? "diatonic" : "secondary_dominant";
    }
  }

  // === RULE 2.5: MODULACION Imaj7 (Pasajera o Backdoor) ===
  if (!numeral && isMajQuality && m1?.parsed && isDominantQuality(m1.parsed.type)) {
     const intervalFromV = getInterval(m1.parsed.root, root);
     if (intervalFromV === 5 || intervalFromV === 2) {
       numeral = "I";
       category = isSamePitch(root, globalKey) ? "diatonic" : "secondary_dominant";
     }
  }

  // RESOLUTION CHORDS OF A V7
  if (!numeral && m1?.parsed && isDominantQuality(m1.parsed.type) && getInterval(m1.parsed.root, root) === 5) {
    const isGlobalTonicTarget = isSamePitch(root, globalKey);
    const isDiatonic = classifyDiatonic(root, type, globalKey, isGlobalMinor);
    
    let isExpectedResolution = false;
    let formsFullIiV = false;
    const m2 = skipDuplicatesBackwards(m1.idx);

    if (m2?.parsed) {
       const isM2Min7 = m2.parsed.type === "m7" || m2.parsed.type === "Menor" || m2.parsed.type.startsWith("m9");
       const isM2Min7b5 = m2.parsed.type === "m7b5" || m2.parsed.type === "dim7";
       if ((isM2Min7 || isM2Min7b5) && getInterval(m2.parsed.root, m1.parsed.root) === 5) {
          formsFullIiV = true;
          if (isM2Min7 && isMajQuality) isExpectedResolution = true;
          if (isM2Min7b5 && isMinQuality) isExpectedResolution = true;
       }
    }

    if (formsFullIiV && isExpectedResolution) {
        if (isMajQuality) {
            numeral = "I";
            category = isGlobalTonicTarget ? "diatonic" : "secondary_dominant";
        } else if (isMinQuality && type !== "m7b5" && type !== "dim7") {
            numeral = "i";
            category = isGlobalTonicTarget ? "diatonic" : "secondary_dominant";
        }
    } else {
        if (isDiatonic && !isGlobalTonicTarget) {
            category = "diatonic";
            numeral = getRomanNumeral(globalKey, root, type, isGlobalMinor, "diatonic");
        } else {
            if (isMajQuality) {
                numeral = "I";
                category = isGlobalTonicTarget ? "diatonic" : "secondary_dominant";
            } else if (isMinQuality && type !== "m7b5" && type !== "dim7") {
                numeral = "i";
                category = isGlobalTonicTarget ? "diatonic" : "secondary_dominant";
            }
        }
    }
  }

  // === RULE 3: SLASH FOR SOLITARY DOMINANTS ===
  if (!numeral && isDomQuality) {
    const resolutionRootOffset = (ROOT_MIDI_OFFSET_MAP[root] + 5) % 12;
    const globalKeyOffset = ROOT_MIDI_OFFSET_MAP[globalKey as RootNote];
    const relativeOffset = isGlobalMinor ? (globalKeyOffset + 3) % 12 : (globalKeyOffset + 9) % 12;
    const isNaturalResolution = resolutionRootOffset === globalKeyOffset || resolutionRootOffset === relativeOffset;
    
    if (isNaturalResolution) {
       category = "diatonic";
       numeral = "V7";
    } else {
       const resolutionRoot = Object.keys(ROOT_MIDI_OFFSET_MAP).find(k => ROOT_MIDI_OFFSET_MAP[k as RootNote] === resolutionRootOffset) as RootNote;
       category = "secondary_dominant";
       const target = getSlashTarget(resolutionRoot);
       numeral = target ? `V7/${target}` : "V7";
    }
  }

  // === RULE 4: DIATONIC / MODAL FALLBACK ===
  if (!numeral) {
     const isDegreeIV = getInterval(globalKey, root) === 5;
     const isMajorQuality = !isDominantQuality(type) && isExplicitMajorChord(type);

     if (isDegreeIV && isMajorQuality) {
        category = "diatonic";
        numeral = "IV";
     } else {
        const isDiatonic = classifyDiatonic(root, type, globalKey, isGlobalMinor);
        const isModal = classifyModalInterchange(root, type, globalKey, isGlobalMinor);
        if (isDiatonic) {
           category = "diatonic";
           numeral = getRomanNumeral(globalKey, root, type, isGlobalMinor, category);
        } else if (isModal) {
           category = "modal_interchange";
           numeral = getRomanNumeral(globalKey, root, type, isGlobalMinor, category);
        } else {
           category = "tonal_shift";
           numeral = getRomanNumeral(globalKey, root, type, isGlobalMinor, category);
        }
     }
  }

  // Salvaguarda Estricta: Grado IV Diatónico
  // Cualquier acorde analizado como grado IV (con cualidad mayor, maj7) DEBE ser clasificado ESTRICTAMENTE como Diatónico
  if ((numeral.startsWith("IV") || getInterval(globalKey, root) === 5) && !isDominantQuality(type) && isExplicitMajorChord(type)) {
     category = "diatonic";
     numeral = "IV";
  }

  // 5. Apply colors strictly based on harmonic function
  let color = "border-slate-700";
  
  switch (category) {
    case 'diatonic':
      color = "border-[#EA580B]";
      break;
    case 'secondary_dominant':
      color = "border-yellow-500";
      break;
    case 'tritone_substitute':
      color = "border-green-500";
      break;
    case 'modal_interchange':
      color = "border-blue-500";
      break;
    case 'tonal_shift':
      color = "border-purple-500";
      break;
    default:
      color = "border-slate-700";
  }

  const suggestedScale = getSuggestedScale(root, type, globalKey, numeral, isGlobalMinor, p1?.parsed, category, m1?.parsed);

  return { romanNumeral: numeral, category, color, isMinorKey: isGlobalMinor, keyContext: globalKey, suggestedScale };
}

export function analyzeSongHarmony(
  contexts: ChordInputContext[],
): AnalyzedChord[] {
  if (contexts.length === 0) return [];
  
  const allChords = contexts.map((c) => {
    const raw = c.chordString as any;
    return typeof raw === 'string' ? raw : (raw?.chordName || raw?.name || raw?.text || '');
  });

  // Detección Dinámica de Tonalidad Menor:
  // Si los metadatos indican una tonalidad menor (ej. "Cm", o isMinorKey=true),
  // o si el primer/último acorde de la estructura es un grado menor (m, m7) correspondiente a la tónica,
  // el sistema establece isMinorKey = true para la estructura.
  const validChords = allChords.filter(s => s && s !== "%" && s.trim() !== "");
  const rawKey = contexts[0]?.keyContext || "C";
  const cleanSongKey = rawKey.replace(/m|-|min/gi, "").trim() as RootNote;
  const songTonicKey = (cleanSongKey in ROOT_MIDI_OFFSET_MAP ? cleanSongKey : "C") as RootNote;
  let autoDetectedMinor = Boolean(contexts[0]?.isMinorKey || /m|-|min/i.test(rawKey));

  if (!autoDetectedMinor && validChords.length > 0) {
    const firstParsed = parseChord(validChords[0]);
    const lastParsed = parseChord(validChords[validChords.length - 1]);

    const isFirstMinorTonic = isMinorQuality(firstParsed.type) && ROOT_MIDI_OFFSET_MAP[firstParsed.root] === ROOT_MIDI_OFFSET_MAP[songTonicKey];
    const isLastMinorTonic = isMinorQuality(lastParsed.type) && ROOT_MIDI_OFFSET_MAP[lastParsed.root] === ROOT_MIDI_OFFSET_MAP[songTonicKey];

    if (isFirstMinorTonic || isLastMinorTonic) {
      autoDetectedMinor = true;
    }
  }

  const results: AnalyzedChord[] = [];

  for (let i = 0; i < contexts.length; i++) {
    const c = contexts[i];
    const rawChordStr = (allChords[i] || '').trim();
    const isSimile = rawChordStr === "%";

    const rawContextKey = c.keyContext || "C";
    const cleanKey = rawContextKey.replace(/m|-|min/gi, "").trim() as RootNote;
    const isContextExplicitMinor = Boolean(c.isMinorKey || /m|-|min/i.test(rawContextKey));
    const effectiveIsMinor = isContextExplicitMinor || (autoDetectedMinor && ROOT_MIDI_OFFSET_MAP[cleanKey] === ROOT_MIDI_OFFSET_MAP[songTonicKey]);
    const keyContextStr = cleanKey + (effectiveIsMinor ? "m" : "");

    if (isSimile) {
      // Look-behind inheritance para repetición de compás (%):
      // Busca automáticamente el último acorde analizado válido en compases previos (soporta herencia en cadena: Cmaj7 -> % -> %)
      let inheritedAnalysis: AnalyzedChord | null = null;
      for (let k = i - 1; k >= 0; k--) {
        if (results[k] && results[k].root && results[k].type) {
          inheritedAnalysis = results[k];
          break;
        }
      }

      if (inheritedAnalysis) {
        results.push({
          chordString: "%",
          root: inheritedAnalysis.root,
          type: inheritedAnalysis.type,
          keyContext: inheritedAnalysis.keyContext,
          isMinorKey: inheritedAnalysis.isMinorKey,
          romanNumeral: inheritedAnalysis.romanNumeral,
          category: inheritedAnalysis.category,
          color: inheritedAnalysis.color,
          suggestedScale: inheritedAnalysis.suggestedScale,
        });
        continue;
      }
    }

    const { root, type } = parseChord(rawChordStr);
    const analysis = analyzeChord(rawChordStr, i, allChords, keyContextStr);

    results.push({
      chordString: rawChordStr,
      root,
      type,
      keyContext: cleanKey,
      isMinorKey: effectiveIsMinor,
      romanNumeral: analysis.romanNumeral || "-",
      category: analysis.category as AnalysisCategory,
      color: analysis.color,
      suggestedScale: analysis.suggestedScale
    });
  }

  // =========================================================================
  // MOTOR GLOBAL DE DETECCIÓN DE CADENCIAS (Prioridad ALTA: Bloques ii - V - I y ii - V)
  // Basado puramente en intervalos relativos (Cuartas Justas ascendentes / Quintas descendentes)
  // =========================================================================
  const isHalfDimOrDim = (t: string) => {
    return t === "m7b5" || t === "dim7" || t.includes("b5") || t.includes("ø") || t.includes("°");
  };

  interface ChordEvent {
    indices: number[];
    root: RootNote;
    type: string;
  }

  const events: ChordEvent[] = [];
  results.forEach((r, idx) => {
    if (!r.chordString || r.chordString.trim() === "") return;
    const lastEvent = events[events.length - 1];
    if (lastEvent && lastEvent.root === r.root && lastEvent.type === r.type) {
      lastEvent.indices.push(idx);
    } else {
      events.push({
        indices: [idx],
        root: r.root,
        type: r.type,
      });
    }
  });

  const isMajorIi = (e: ChordEvent) => isMinorQuality(e.type) && !isHalfDimOrDim(e.type);
  const isMinorIi = (e: ChordEvent) => isHalfDimOrDim(e.type);
  const isV = (e: ChordEvent) => isDominantQuality(e.type);
  const isMajorI = (e: ChordEvent) => isExplicitMajorChord(e.type) && !isDominantQuality(e.type);
  const isMinorI = (e: ChordEvent) => isMinorQuality(e.type) && !isHalfDimOrDim(e.type);

  const is3Major = (i: number) => {
    if (i + 2 >= events.length) return false;
    const a = events[i], b = events[i + 1], c = events[i + 2];
    return isMajorIi(a) && isV(b) && isMajorI(c) && getInterval(a.root, b.root) === 5 && getInterval(b.root, c.root) === 5;
  };

  const is3Minor = (i: number) => {
    if (i + 2 >= events.length) return false;
    const a = events[i], b = events[i + 1], c = events[i + 2];
    return isMinorIi(a) && isV(b) && isMinorI(c) && getInterval(a.root, b.root) === 5 && getInterval(b.root, c.root) === 5;
  };

  const is2Major = (i: number) => {
    if (i + 1 >= events.length) return false;
    const a = events[i], b = events[i + 1];
    return isMajorIi(a) && isV(b) && getInterval(a.root, b.root) === 5;
  };

  const is2Minor = (i: number) => {
    if (i + 1 >= events.length) return false;
    const a = events[i], b = events[i + 1];
    return isMinorIi(a) && isV(b) && getInterval(a.root, b.root) === 5;
  };

  const applyLabel = (ev: ChordEvent, numeral: string) => {
    ev.indices.forEach((idx) => {
      results[idx].romanNumeral = numeral;
    });
  };

  let evIdx = 0;
  while (evIdx < events.length) {
    if (is3Major(evIdx)) {
      applyLabel(events[evIdx], "ii");
      applyLabel(events[evIdx + 1], "V7");
      applyLabel(events[evIdx + 2], "I");
      evIdx += 2;
    } else if (is3Minor(evIdx)) {
      if (is3Major(evIdx + 2)) {
        applyLabel(events[evIdx], "iiº");
        applyLabel(events[evIdx + 1], "V7");
        evIdx += 2;
      } else {
        applyLabel(events[evIdx], "iiº");
        applyLabel(events[evIdx + 1], "V7");
        applyLabel(events[evIdx + 2], "i");
        evIdx += 2;
      }
    } else if (is2Major(evIdx)) {
      applyLabel(events[evIdx], "ii");
      applyLabel(events[evIdx + 1], "V7");
      evIdx += 2;
    } else if (is2Minor(evIdx)) {
      applyLabel(events[evIdx], "iiº");
      applyLabel(events[evIdx + 1], "V7");
      evIdx += 2;
    } else {
      evIdx++;
    }
  }

  // Second pass: Retro-búsqueda para agrupar Turnarounds completos (vi - ii - V - I)
  for (let i = 1; i < results.length; i++) {
     const curr = results[i];
     if (curr.romanNumeral === "ii" || curr.romanNumeral === "iiø" || curr.romanNumeral === "iiº") {
        // Find previous distinct chord backwards
        let prevIdx = i - 1;
        while (prevIdx >= 0 && results[prevIdx].root === curr.root && results[prevIdx].type === curr.type) {
           prevIdx--;
        }
        if (prevIdx >= 0) {
           const prev = results[prevIdx];
           // Si el acorde anterior es m7/menor Y su raíz está a una 4ta Justa descendente (intervalo 5 hacia ii)
           if (isMinorQuality(prev.type) && getInterval(prev.root, curr.root) === 5 && (!prev.isMinorKey || ROOT_MIDI_OFFSET_MAP[prev.root] !== ROOT_MIDI_OFFSET_MAP[prev.keyContext as RootNote])) {
               prev.romanNumeral = prev.type === "m7b5" || prev.type === "dim7" ? "viø" : "vi";
               const isDiatonic = classifyDiatonic(prev.root, prev.type, prev.keyContext, prev.isMinorKey);
               prev.category = isDiatonic ? "diatonic" : "secondary_dominant";
               prev.color = isDiatonic ? "border-[#EA580B]" : "border-yellow-500";
               prev.suggestedScale = getSuggestedScale(
                 prev.root,
                 prev.type,
                 prev.keyContext,
                 prev.romanNumeral,
                 prev.isMinorKey
               );
           }
        }
     }
  }

  // Final Look-behind Sync Pass: Asegurar que cualquier '%' herede cualquier actualización
  // posterior de cadencias o turnarounds realizada sobre el acorde del cual hereda (soporta herencia en cadena)
  for (let i = 1; i < results.length; i++) {
    if (results[i].chordString === "%") {
      const prev = results[i - 1];
      if (prev) {
        results[i].root = prev.root;
        results[i].type = prev.type;
        results[i].keyContext = prev.keyContext;
        results[i].isMinorKey = prev.isMinorKey;
        results[i].romanNumeral = prev.romanNumeral;
        results[i].category = prev.category;
        results[i].color = prev.color;
        results[i].suggestedScale = prev.suggestedScale;
      }
    }
  }

  return results;
}

export const getHarmonicFunctionClasses = (harmonicFunction: string | undefined | null) => {
  const func = harmonicFunction?.toLowerCase().trim();

  switch (func) {
    case 'diatonic':
    case 'diatónico':
    case 'tonic':
    case 'subdominant':
    case 'dominant':
      // Naranja (Diatónico) #EA580B
      return {
        border: 'border-[#EA580B]',
        text: 'text-[#EA580B]',
        bg: 'border border-[#EA580B] bg-neutral-900 hover:bg-neutral-800'
      };
      
    case 'secondary_dominant':
    case 'secondary-dominant':
    case 'dominante-secundario':
    case 'secondary':
      // Amarillo (Dominante Secundario)
      return {
        border: 'border-yellow-500/50',
        text: 'text-yellow-500',
        bg: 'bg-yellow-500/10 ring-1 ring-yellow-500/40 hover:bg-yellow-500/20'
      };
      
    case 'tritone_substitute':
    case 'tritone-sub':
    case 'sustituto-tritonal':
    case 'subv':
      // Verde (Sustituto Tritonal)
      return {
        border: 'border-green-500/50',
        text: 'text-green-500',
        bg: 'bg-green-500/10 ring-1 ring-green-500/40 hover:bg-green-500/20'
      };
      
    case 'modal_interchange':
    case 'intercambio-modal':
    case 'im':
      // Azul/Morado (Intercambio Modal)
      return {
        border: 'border-blue-500/50',
        text: 'text-blue-500',
        bg: 'bg-blue-500/10 ring-1 ring-blue-500/40 hover:bg-blue-500/20'
      };

    case 'tonal_shift':
      return {
        border: 'border-purple-500/50',
        text: 'text-purple-500',
        bg: 'bg-purple-500/10 ring-1 ring-purple-500/40 hover:bg-purple-500/20'
      };
      
    default:
      // Gris por defecto
      return {
        border: 'border-zinc-700',
        text: 'text-zinc-500',
        bg: 'hover:bg-zinc-850'
      };
  }
};
