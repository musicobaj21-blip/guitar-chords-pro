import { useInstrument } from "../contexts/InstrumentContext";
import { useState, useMemo } from "react";
import { GuitarVoicing, RootNote, ChordTypeOptions } from "../types";
import {
  getGuitarChordFrequencies,
  ROOT_DISPLAY_NAME_MAP,
  getGuitarChordVoicings,
} from "../data/chords";
import { computeGuitarErgonomicGrip } from "./ChordDictionary";
import { dictionaryAudio } from "../utils/dictionaryAudio";
import { Volume2, Music, GitCommit, Hand } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { transposeRoot } from "../utils/music";

type FretboardLabelMode = "note" | "interval" | "finger";

interface ChordFretboardProps {
  root: RootNote;
  type: ChordTypeOptions | string;
  voicing?: GuitarVoicing;
  title?: string;
  subtitle?: string;
  isPro?: boolean;
  positions?: (number | null | string | undefined)[];
  fingersOverride?: (number | null | undefined)[];
  barres?: { fret: number; stringFrom: number; stringTo: number }[];
  forceBaseFret?: number;
  triadShape?: {
    string: number;
    fret: number;
    label: string;
    finger?: number;
  }[];
  showFretNumbers?: boolean;
  showIntervalLabels?: boolean;
  showFingerings?: boolean;
  isArpeggio?: boolean;
  activeSequenceIndex?: number | null;
  onPlay?: () => void;
  playLabel?: string;
  isExpanded?: boolean;
}

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function getNoteNameForStringFret(
  stringIndex: number,
  fret: number | null | string | undefined,
  rootKey?: RootNote,
  translateFn?: (n: string) => string,
  chordType?: string
): string {
  if (fret == null || fret === "x" || fret === "X" || fret === -1) return "-";
  const numFret = typeof fret === "string" ? parseInt(fret) : fret;
  if (isNaN(numFret) || numFret === -1) return "-";

  const tuningNotes = [40, 45, 50, 55, 59, 64];
  const midi = tuningNotes[stringIndex] + numFret;

  if (rootKey) {
    const rootOffsetMap: Record<string, number> = {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11,
      Cb: 11,
      "E#": 5,
      "B#": 0,
    };
    const rOff = rootOffsetMap[rootKey as string] ?? 0;
    const semis = (midi - rOff + 120) % 12;

    // Si es un acorde con #11 y el intervalo es de 6 semitonos (tritono), deletrear con sostenido (ej. Fa# en C7#11)
    if (
      semis === 6 &&
      chordType &&
      String(chordType).includes("#11") &&
      !["Db", "Eb", "Ab", "Bb", "Gb"].includes(String(rootKey))
    ) {
      const sharpName = SHARP_NOTES[midi % 12];
      return translateFn ? translateFn(sharpName) : sharpName;
    }

    const name = transposeRoot(rootKey, semis, rootKey);
    return translateFn ? translateFn(name) : name;
  }

  const scale = [
    "C",
    "C#",
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
  const raw = scale[midi % 12];
  return translateFn ? translateFn(raw) : raw;
}

function getRomanNumeralValue(numeral: string | number): number {
  if (typeof numeral === "number") return numeral;
  const numMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
    XIII: 13,
    XIV: 14,
    XV: 15,
  };
  return numMap[numeral] || parseInt(numeral, 10) || 1;
}

export default function ChordFretboard({
  root,
  type,
  voicing,
  title,
  subtitle,
  isPro = false,
  positions,
  fingersOverride,
  barres,
  forceBaseFret,
  triadShape,
  showFretNumbers = true,
  showIntervalLabels = false,
  showFingerings = true,
  isArpeggio = false,
  onPlay,
  playLabel,
  isExpanded = false,
}: ChordFretboardProps) {
  useInstrument();
  const { t, translateNote, language } = useLanguage();
  const isEs = language === "es";

  const [labelMode, setLabelMode] = useState<FretboardLabelMode>(
    showIntervalLabels ? "interval" : "note"
  );

  let currentVoicing: GuitarVoicing | undefined;
  if (triadShape) {
    const frets = [-1, -1, -1, -1, -1, -1];
    triadShape.forEach((tr) => {
      frets[6 - tr.string] = tr.fret;
    });
    currentVoicing = {
      frets,
      fingers: [0, 0, 0, 0, 0, 0],
      baseFret: forceBaseFret ?? Math.min(...triadShape.map((tr) => tr.fret)),
    } as GuitarVoicing;
  } else {
    currentVoicing = positions
      ? ({
          frets: positions.map((f) =>
            f == null || f === "x" || f === "X" ? -1 : Number(f)
          ),
          fingers: fingersOverride?.map((f) => f ?? 0) ?? [0, 0, 0, 0, 0, 0],
          baseFret: forceBaseFret ?? 1,
          barres: barres
            ? barres.map((b) => ({
                fret: b.fret,
                fromString: b.stringFrom,
                toString: b.stringTo,
              }))
            : [],
        } as GuitarVoicing)
      : voicing || getGuitarChordVoicings(root, type as any, isPro)?.[0];
  }

  if (!currentVoicing) return null;

  const rawFrets = triadShape
    ? currentVoicing.frets
    : positions ?? currentVoicing.frets;
  const frets = (rawFrets ?? []).map((f) =>
    f == null || f === "x" || f === "X" ? -1 : Number(f)
  );

  const ergonomicGrip = useMemo(
    () => computeGuitarErgonomicGrip(frets),
    [frets]
  );

  const resolvedFingers = useMemo(() => {
    if (
      fingersOverride &&
      fingersOverride.filter((f) => f && f > 0).length >= 2
    ) {
      return fingersOverride.map((f) => (f && f > 0 ? Number(f) : 0));
    }
    return ergonomicGrip.fingers;
  }, [fingersOverride, ergonomicGrip]);

  const resolvedBarres = useMemo(() => {
    if (currentVoicing?.barres && currentVoicing.barres.length > 0) {
      return currentVoicing.barres;
    }
    return ergonomicGrip.barres;
  }, [currentVoicing?.barres, ergonomicGrip]);

  const validFrets = frets.filter(
    (f) => typeof f === "number" && !isNaN(f) && f > 0
  );
  const calculatedBaseFret =
    validFrets.length > 0 ? Math.min(...validFrets) : 1;
  const resolvedForceBaseFret =
    forceBaseFret != null ? getRomanNumeralValue(forceBaseFret) : undefined;
  const numericBaseFret =
    resolvedForceBaseFret ??
    (currentVoicing.baseFret
      ? getRomanNumeralValue(currentVoicing.baseFret)
      : calculatedBaseFret);

  const rootOffsetMap: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
    Cb: 11,
    "E#": 5,
    "B#": 0,
  };
  const rootOffset = rootOffsetMap[root as string] ?? 0;

  const getNoteForPosition = (stringIdx: number, fretNum: number): string => {
    return getNoteNameForStringFret(
      stringIdx,
      fretNum,
      root,
      translateNote,
      String(type)
    );
  };

  const getIntervalForPosition = (
    stringIdx: number,
    fretNum: number
  ): string => {
    const tuningNotes = [40, 45, 50, 55, 59, 64];
    const midi = tuningNotes[stringIdx] + fretNum;
    const semis = (midi - rootOffset + 120) % 12;
    if (semis === 6 && String(type).includes("#11")) return "#11";
    const intervalNames: Record<number, string> = {
      0: "F",
      1: "b9",
      2: "9",
      3: String(type).includes("#9") ? "#9" : "b3",
      4: "3",
      5: "11",
      6: "b5",
      7: "5",
      8: String(type).includes("b13") ? "b13" : "#5",
      9: String(type).includes("13") ? "13" : "6",
      10: "b7",
      11: "7",
    };
    return intervalNames[semis] || "F";
  };

  const getDotDisplayText = (stringIdx: number, fretNum: number): string => {
    if (labelMode === "finger") {
      const f = resolvedFingers[stringIdx];
      return f > 0 ? String(f) : getNoteForPosition(stringIdx, fretNum);
    }
    if (labelMode === "interval") {
      return getIntervalForPosition(stringIdx, fretNum);
    }
    return getNoteForPosition(stringIdx, fretNum);
  };

  const handlePlayChord = async () => {
    dictionaryAudio.getContext();
    if (triadShape) {
      const tuningNotes = [40, 45, 50, 55, 59, 64];
      const freqs = triadShape.map(
        (n) =>
          440 * Math.pow(2, (tuningNotes[6 - n.string] + n.fret - 69) / 12)
      );
      dictionaryAudio.playChord(freqs, "guitar");
    } else {
      const freqs = getGuitarChordFrequencies(frets);
      dictionaryAudio.playChord(freqs, "guitar");
    }
  };

  const handlePlayString = async (stringIndex: number) => {
    dictionaryAudio.getContext();
    const fret = frets[stringIndex];
    if (fret === undefined || fret === -1) return;
    const tuningNotes = [40, 45, 50, 55, 59, 64];
    const midi = tuningNotes[stringIndex] + fret;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    if (typeof (dictionaryAudio as any).playNote === "function") {
      (dictionaryAudio as any).playNote(freq, "guitar");
    } else if (typeof (dictionaryAudio as any).playSingleNote === "function") {
      (dictionaryAudio as any).playSingleNote(freq, "guitar");
    }
  };

  const stringXCoords = [52, 95, 138, 181, 224, 268];
  const fretYCoords = [70, 134, 198, 262, 326, 390];
  const numFrets = 5;

  return (
    <div className="flex flex-col items-center bg-neutral-900 p-3 sm:p-3.5 rounded-xl border border-neutral-800 shadow-none w-full h-auto overflow-visible">
      <div className="flex flex-col gap-2 mb-2.5 w-full overflow-visible">
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="min-w-0 flex-1">
            <h3
              id="chord-fretboard-title"
              className={`${
                isExpanded ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
              } font-bold text-neutral-100 tracking-tight flex items-baseline flex-wrap gap-1.5 w-full`}
            >
              <span>{translateNote(ROOT_DISPLAY_NAME_MAP[root] || root)}</span>
              <span
                className={`${
                  isExpanded ? "text-lg sm:text-xl" : "text-base sm:text-lg"
                } text-orange-400 font-mono font-bold`}
              >
                {title ? title : type}
              </span>
            </h3>
          </div>

          <div className="flex items-center bg-[#161720] p-1 rounded-xl border border-[#252736] shrink-0">
            <button
              type="button"
              onClick={() => setLabelMode("note")}
              title={isEs ? "Mostrar Notas" : "Show Notes"}
              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer ${
                labelMode === "note"
                  ? "bg-[#f25100] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Music size={11} />
              <span>{isEs ? "NOTAS" : "NOTES"}</span>
            </button>
            <button
              type="button"
              onClick={() => setLabelMode("interval")}
              title={isEs ? "Mostrar Intervalos (F, 3, 5, 7)" : "Show Intervals"}
              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer ${
                labelMode === "interval"
                  ? "bg-[#f25100] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <GitCommit size={11} />
              <span>{isEs ? "INT." : "INT."}</span>
            </button>
            <button
              type="button"
              onClick={() => setLabelMode("finger")}
              title={
                isEs
                  ? "Mostrar Dedos de la mano izquierda (1, 2, 3, 4)"
                  : "Show Left-Hand Fingers (1, 2, 3, 4)"
              }
              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer ${
                labelMode === "finger"
                  ? "bg-[#f25100] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Hand size={11} />
              <span>{isEs ? "DEDOS" : "FINGERS"}</span>
            </button>
          </div>
        </div>

        {subtitle && (
          <p className="text-xs text-neutral-400 font-mono tracking-wider w-full truncate">
            {subtitle}
          </p>
        )}

        <button
          id="play-chord-btn"
          onClick={onPlay || handlePlayChord}
          className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white transition-all py-2 px-3.5 rounded-lg text-xs font-semibold tracking-wider uppercase shadow-md shadow-orange-500/10 cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>
            {playLabel ||
              (positions ? t("academy.playNotes") : t("chords.playChord"))}
          </span>
        </button>
      </div>

      {/* SVG Guitar Diagram */}
      <div
        className={`relative w-full flex justify-center items-center py-2 bg-neutral-950/70 rounded-xl border border-neutral-800/80 ${
          isExpanded
            ? "min-h-[250px] sm:min-h-[270px]"
            : "min-h-[205px] sm:min-h-[220px]"
        }`}
      >
        <svg
          id="fretboard-svg"
          width="100%"
          height="100%"
          viewBox="0 0 320 460"
          className={`select-none w-full h-auto ${
            isExpanded
              ? "max-w-[270px] sm:max-w-[295px]"
              : "max-w-[225px] sm:max-w-[245px]"
          }`}
        >
          {/* Base Fret indicator */}
          {showFretNumbers && numericBaseFret > 1 && (
            <text
              x="40"
              y="76"
              textAnchor="end"
              className="fill-orange-500 text-lg font-sans font-bold"
            >
              {numericBaseFret}
            </text>
          )}

          {/* Draw Frets */}
          {fretYCoords.map((y, index) => {
            const isNut = index === 0 && numericBaseFret === 1;
            return (
              <line
                key={`fret-${index}`}
                x1={stringXCoords[0]}
                y1={y}
                x2={stringXCoords[stringXCoords.length - 1]}
                y2={y}
                stroke={isNut ? "#EA580B" : "#404040"}
                strokeWidth={isNut ? 4 : 1.5}
              />
            );
          })}

          {/* Draw Strings */}
          {stringXCoords.map((x, index) => {
            const strokeWidth = 2.5 - index * 0.35;
            return (
              <line
                key={`string-${index}`}
                x1={x}
                y1={fretYCoords[0]}
                x2={x}
                y2={fretYCoords[fretYCoords.length - 1]}
                stroke="#525252"
                strokeWidth={strokeWidth}
              />
            );
          })}

          {/* String interaction zones */}
          {stringXCoords.map((x, index) => {
            const isPlayed = frets[index] !== undefined && frets[index] !== -1;
            return (
              <rect
                key={`string-hitbox-${index}`}
                x={x - 12}
                y={fretYCoords[0] - 25}
                width="24"
                height="330"
                fill="transparent"
                className={
                  isPlayed
                    ? "cursor-pointer hover:fill-orange-500/10 transition"
                    : "cursor-not-allowed"
                }
                onClick={() => handlePlayString(index)}
              >
                <title>
                  {isPlayed
                    ? `Tocar cuerda ${6 - index} (${getNoteNameForStringFret(
                        index,
                        frets[index],
                        root,
                        translateNote,
                        String(type)
                      )})`
                    : "Cuerda silenciada (X)"}
                </title>
              </rect>
            );
          })}

          {/* Draw Open (O) / Muted (X) labels */}
          {frets.map((fret, stringIdx) => {
            const isMuted = currentVoicing.mutes
              ? currentVoicing.mutes[stringIdx]
              : fret === -1;
            const x = stringXCoords[stringIdx];
            const y = 55;

            if (isMuted) {
              return (
                <g key={`mute-${stringIdx}`}>
                  <text
                    x={x}
                    y={y}
                    fill="#a3a3a3"
                    fontSize="13"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    className="cursor-default"
                  >
                    X
                  </text>
                </g>
              );
            } else if (fret === 0) {
              return (
                <g key={`open-${stringIdx}`}>
                  <text
                    x={x}
                    y={y}
                    fill="#a3a3a3"
                    fontSize="13"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    className="cursor-default"
                  >
                    O
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Draw Barres */}
          {!triadShape &&
            !isArpeggio &&
            resolvedBarres.map((barre, i) => {
              const fret = barre.fret || 0;
              if (fret <= 0) return null;

              const visualFretIndex = fret - numericBaseFret;
              if (visualFretIndex < 0 || visualFretIndex >= numFrets)
                return null;

              const fromIdx = 6 - barre.fromString;
              const toIdx = 6 - barre.toString;

              const minIdx = Math.min(fromIdx, toIdx);
              const maxIdx = Math.max(fromIdx, toIdx);

              const xStart = stringXCoords[minIdx];
              const xEnd = stringXCoords[maxIdx];
              const y =
                fretYCoords[visualFretIndex] +
                (fretYCoords[visualFretIndex + 1] -
                  fretYCoords[visualFretIndex]) /
                  2;

              return (
                <g key={`barre-${i}`}>
                  <rect
                    x={xStart - 11}
                    y={y - 9}
                    width={xEnd - xStart + 22}
                    height="18"
                    rx="9"
                    className="fill-[#f25100]/45 stroke-[#f25100] stroke-[1.5]"
                  />
                </g>
              );
            })}

          {/* Draw Finger / Note / Interval Dots */}
          {triadShape
            ? triadShape.map((tr, idx) => {
                const stringIdx = 6 - tr.string;
                const fret = tr.fret;

                const visualFretIndex = fret - numericBaseFret;
                if (visualFretIndex < 0 || visualFretIndex >= numFrets)
                  return null;

                const x = stringXCoords[stringIdx];
                const y =
                  fretYCoords[visualFretIndex] +
                  (fretYCoords[visualFretIndex + 1] -
                    fretYCoords[visualFretIndex]) /
                    2;

                const labelStr =
                  labelMode === "finger"
                    ? String(tr.finger || resolvedFingers[stringIdx] || 1)
                    : labelMode === "interval"
                    ? getIntervalForPosition(stringIdx, fret)
                    : tr.label === "Bajo"
                    ? tr.label
                    : translateNote(tr.label) ||
                      getNoteForPosition(stringIdx, fret);

                return (
                  <g
                    key={`dot-iso-${idx}`}
                    className="cursor-pointer transition-opacity duration-200"
                    onClick={() => handlePlayString(stringIdx)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r="13"
                      className="fill-orange-500"
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#ffffff"
                      fontSize={labelStr.length >= 3 ? "9" : "11"}
                      fontWeight="900"
                      fontFamily="sans-serif"
                      textAnchor="middle"
                      dominantBaseline="central"
                      alignmentBaseline="central"
                    >
                      {labelStr}
                    </text>
                  </g>
                );
              })
            : frets.map((fret, stringIdx) => {
                if (fret === undefined || fret <= 0) return null;

                const visualFretIndex = fret - numericBaseFret;
                if (visualFretIndex < 0 || visualFretIndex >= numFrets)
                  return null;

                const x = stringXCoords[stringIdx];
                const y =
                  fretYCoords[visualFretIndex] +
                  (fretYCoords[visualFretIndex + 1] -
                    fretYCoords[visualFretIndex]) /
                    2;

                const labelStr = getDotDisplayText(stringIdx, fret);
                const isRootNote =
                  getIntervalForPosition(stringIdx, fret) === "F";

                return (
                  <g
                    key={`dot-${stringIdx}`}
                    className="cursor-pointer transition-opacity duration-200"
                    onClick={() => handlePlayString(stringIdx)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r="12"
                      className={
                        isRootNote
                          ? "fill-[#f25100] stroke-[#ff9d66] stroke-[1.5]"
                          : "fill-orange-500"
                      }
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#ffffff"
                      fontSize={
                        labelMode === "finger"
                          ? "12"
                          : labelStr.length >= 3
                          ? "8.5"
                          : "10"
                      }
                      fontWeight="900"
                      fontFamily="sans-serif"
                      textAnchor="middle"
                      dominantBaseline="central"
                      alignmentBaseline="central"
                    >
                      {labelStr}
                    </text>
                  </g>
                );
              })}

          {/* Fila Inferior 1: Notas al pie de cada cuerda */}
          {frets.map((fret, stringIdx) => {
            const x = stringXCoords[stringIdx];
            const y = fretYCoords[fretYCoords.length - 1] + 22;

            const noteStr = getNoteNameForStringFret(
              stringIdx,
              fret,
              root,
              translateNote,
              String(type)
            );
            const color =
              fret === -1 || fret === undefined ? "#404040" : "#d4d4d8";

            return (
              <text
                key={`bottom-note-${stringIdx}`}
                x={x}
                y={y}
                fill={color}
                fontSize="11"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {noteStr}
              </text>
            );
          })}

          {/* Fila Inferior 2: Dedos de la mano izquierda (D1, D2, D3, D4) al pie del mástil */}
          {showFingerings &&
            frets.map((fret, stringIdx) => {
              const x = stringXCoords[stringIdx];
              const y = fretYCoords[fretYCoords.length - 1] + 42;
              const fingerNum = resolvedFingers[stringIdx];

              const fingerText =
                fret === 0
                  ? "0"
                  : fret > 0 && fingerNum > 0
                  ? `${isEs ? "D" : "F"}${fingerNum}`
                  : "";

              if (!fingerText) return null;

              return (
                <text
                  key={`bottom-finger-${stringIdx}`}
                  x={x}
                  y={y}
                  fill={fret === 0 ? "#71717a" : "#f25100"}
                  fontSize="11"
                  fontWeight="900"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {fingerText}
                </text>
              );
            })}
        </svg>

        <div className="absolute right-3 top-2.5 flex flex-col items-end gap-0.5 text-[9px] font-mono text-neutral-500">
          <div>{t("common.stringsInfo")}</div>
          <div className="flex gap-1 items-center text-neutral-400">
            <Volume2 size={10} />
            <span>{t("common.clickToHear")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}