import React, { useState, useRef } from "react";
import { UploadCloud, Upload, X } from "lucide-react";
import { Song, SongMeasure, RootNote } from "../types";

interface MusicXMLImporterProps {
  onImport: (song: Song) => void;
  compact?: boolean;
  className?: string;
}

export default function MusicXMLImporter({ onImport, compact, className }: MusicXMLImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        parseMusicXML(text);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".xml") || file.name.endsWith(".musicxml")) {
        processFile(file);
      } else {
        alert("Por favor, sube un archivo .xml o .musicxml válido.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  const mapXMLKindToChordType = (kind: string, textAttr: string | null): string => {
    if (kind.includes('half-diminished')) return 'm7b5';
    if (kind.includes('diminished')) return 'dim7';
    if (kind.includes('minor-seventh')) return 'm7';
    if (kind.includes('dominant')) return '7';
    if (kind.includes('augmented')) return 'aug';

    if (textAttr) {
        // Try mapping directly based on text attribute if it matches our standard
        const t = textAttr.replace('min', 'm').replace('maj', 'maj').replace('-', 'm');
        // We'll just rely loosely on it or map the standardized kind
    }

    const mapping: Record<string, string> = {
      "major": "Mayor",
      "minor": "Menor",
      "major-seventh": "maj7",
      "dominant-ninth": "9",
      "major-ninth": "maj9",
      "minor-ninth": "m9",
      "minor-major": "m(maj7)",
      "major-sixth": "6",
      "minor-sixth": "m6",
      "dominant-13th": "13",
      "minor-13th": "m13",
      "major-13th": "maj13",
      "dominant-11th": "11",
      "augmented-seventh": "7#5", // Fallback
      "suspended-fourth": "7sus4", // Approx
    };

    return mapping[kind] || "Mayor";
  };

  const parseMusicXML = (xmlText: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // Title
      const workTitleNode = xmlDoc.querySelector("work-title");
      const movementTitleNode = xmlDoc.querySelector("movement-title");
      let title = "Desconocido";
      if (workTitleNode && workTitleNode.textContent) title = workTitleNode.textContent;
      else if (movementTitleNode && movementTitleNode.textContent) title = movementTitleNode.textContent;

      // Key
      const modeNode = xmlDoc.querySelector("key > mode");
      let isMinor = false;
      if (modeNode && modeNode.textContent?.toLowerCase() === "minor") {
        isMinor = true;
      }
      const fifthsNode = xmlDoc.querySelector("key > fifths");
      let fifths = 0;
      if (fifthsNode && fifthsNode.textContent) {
        fifths = parseInt(fifthsNode.textContent, 10);
      }

      // Root/Key
      let defaultKey: string = "C";
      
      if (isMinor) {
        if (fifths === -1) defaultKey = "Dm";
        else if (fifths === 0) defaultKey = "Am";
        else if (fifths === 1) defaultKey = "Em";
        else if (fifths === 2) defaultKey = "Bm";
        else if (fifths === 3) defaultKey = "F#m";
        else if (fifths === 4) defaultKey = "C#m";
        else if (fifths === 5) defaultKey = "G#m";
        else if (fifths === 6) defaultKey = "D#m";
        else if (fifths === 7) defaultKey = "A#m";
        else if (fifths === -2) defaultKey = "Gm";
        else if (fifths === -3) defaultKey = "Cm";
        else if (fifths === -4) defaultKey = "Fm";
        else if (fifths === -5) defaultKey = "Bbm";
        else if (fifths === -6) defaultKey = "Ebm";
        else if (fifths === -7) defaultKey = "Abm";
        else defaultKey = "Am";
      } else {
        if (fifths === 0) defaultKey = "C";
        else if (fifths === 1) defaultKey = "G";
        else if (fifths === 2) defaultKey = "D";
        else if (fifths === 3) defaultKey = "A";
        else if (fifths === 4) defaultKey = "E";
        else if (fifths === 5) defaultKey = "B";
        else if (fifths === 6) defaultKey = "F#";
        else if (fifths === 7) defaultKey = "C#";
        else if (fifths === -1) defaultKey = "F";
        else if (fifths === -2) defaultKey = "Bb";
        else if (fifths === -3) defaultKey = "Eb";
        else if (fifths === -4) defaultKey = "Ab";
        else if (fifths === -5) defaultKey = "Db";
        else if (fifths === -6) defaultKey = "Gb";
        else if (fifths === -7) defaultKey = "Cb";
        else defaultKey = "C";
      }

      // Attributes for divisions
      const divisionsNode = xmlDoc.querySelector("attributes > divisions");
      let divisions = 1;
      if (divisionsNode && divisionsNode.textContent) {
        divisions = parseInt(divisionsNode.textContent, 10);
      }

      const importedMelody: any[] = [];
      const measuresMap = new Map<number, string[]>();

      let firstRoot: string | null = null;
      let maxMeasureCount = 0;

      const allParts = xmlDoc.querySelectorAll("part");

      allParts.forEach((part) => {
        let globalBeatCounter = 0;
        let repeatStartIndex = 0;
        let repeatBeatIndex = 0;
        let divisions = 1;

        const firstDivisions = part.querySelector("attributes > divisions");
        if (firstDivisions && firstDivisions.textContent) {
           divisions = parseInt(firstDivisions.textContent, 10);
        }

        const measureNodes = part.querySelectorAll("measure");
        let measureIndex = 0;

        measureNodes.forEach((measureNode) => {
          // Forward Repeat detection
          const repeatForward = measureNode.querySelector("barline repeat[direction='forward']");
          if (repeatForward) {
            repeatStartIndex = measureIndex;
            repeatBeatIndex = globalBeatCounter;
          }

          const harmonyNodes = measureNode.querySelectorAll("harmony");
          const chordsInMeasure: string[] = [];

          harmonyNodes.forEach((harmony) => {
            const rootStepEntry = harmony.querySelector("root > root-step");
            const rootAlterEntry = harmony.querySelector("root > root-alter");
            if (rootStepEntry && rootStepEntry.textContent) {
               let rootNoteStr = rootStepEntry.textContent;
               if (rootAlterEntry && rootAlterEntry.textContent === "-1") rootNoteStr += "b";
               if (rootAlterEntry && rootAlterEntry.textContent === "1") rootNoteStr += "#";
               
               if (!firstRoot) firstRoot = rootNoteStr;
               const kindNode = harmony.querySelector("kind");
               let chordType = "Mayor";
               if (kindNode) {
                  const kindContent = kindNode.textContent || "major";
                  const textAttr = kindNode.getAttribute("text");
                  chordType = mapXMLKindToChordType(kindContent, textAttr);
               }
               
               let finalSuffix = chordType === "Mayor" ? "" : chordType === "Menor" ? "m" : chordType;
               const degreeNodes = harmony.querySelectorAll("degree");
               degreeNodes.forEach(degreeNode => {
                  const degreeValue = degreeNode.querySelector("degree-value")?.textContent;
                  const degreeAlter = degreeNode.querySelector("degree-alter")?.textContent;
                  if (degreeValue === "5") {
                     if (degreeAlter === "-1") {
                        finalSuffix += "b5";
                     } else if (degreeAlter === "1") {
                        finalSuffix += "#5";
                     }
                  }
               });
               chordsInMeasure.push(`${rootNoteStr}${finalSuffix}`);
            }
          });

          if (chordsInMeasure.length > 0) {
            if (!measuresMap.has(measureIndex)) {
              measuresMap.set(measureIndex, chordsInMeasure);
            }
          }

          // Parse melody notes for this measure
          let measureBeatOffset = 0;
          const timeElements = measureNode.querySelectorAll("note, backup, forward");
          const localDivisionsNode = measureNode.querySelector("attributes > divisions");
          if (localDivisionsNode && localDivisionsNode.textContent) {
             divisions = parseInt(localDivisionsNode.textContent, 10);
          }

          timeElements.forEach(el => {
              if (el.tagName.toLowerCase() === "backup") {
                 const d = el.querySelector("duration");
                 if (d && d.textContent) measureBeatOffset -= parseInt(d.textContent, 10) / divisions;
                 return;
              }
              if (el.tagName.toLowerCase() === "forward") {
                 const d = el.querySelector("duration");
                 if (d && d.textContent) measureBeatOffset += parseInt(d.textContent, 10) / divisions;
                 return;
              }
              const noteNode = el;
              const isChord = noteNode.querySelector("chord") !== null;
              const isGrace = noteNode.querySelector("grace") !== null;
              
              const durationNode = noteNode.querySelector("duration");
              let durationDivs = 0;
              if (durationNode && durationNode.textContent && !isGrace) {
                  durationDivs = parseInt(durationNode.textContent, 10);
              }
              
              const durationBeats = divisions > 0 ? durationDivs / divisions : 0;
              
              let currentOffset = measureBeatOffset;
              if (isChord) {
                  currentOffset -= durationBeats; // plays at the same time as the previous note
              }
              
              const pitchNode = noteNode.querySelector("pitch");
              if (pitchNode && !isGrace) {
                  const step = pitchNode.querySelector("step")?.textContent;
                  const alter = pitchNode.querySelector("alter")?.textContent;
                  const octave = pitchNode.querySelector("octave")?.textContent;
                  
                  if (step && octave) {
                      let midi = 0;
                      const stepToOffset = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
                      midi = 12 * (parseInt(octave, 10) + 1) + (stepToOffset[step.toUpperCase()] || 0);
                      if (alter) {
                          midi += parseInt(alter, 10);
                      }
                      const freq = 440 * Math.pow(2, (midi - 69) / 12);
                      
                      importedMelody.push({
                          freq,
                          startBeat: globalBeatCounter + currentOffset,
                          durationBeats
                      });
                  }
              }
              
              if (!isChord && !isGrace) {
                  measureBeatOffset += durationBeats;
              }
          });

          globalBeatCounter += 4;
          measureIndex++;

          // Backward Repeat detection
          const repeatBackward = measureNode.querySelector("barline repeat[direction='backward']");
          if (repeatBackward) {
             const repeatDurationMeasures = measureIndex - repeatStartIndex;
             for (let i = 0; i < repeatDurationMeasures; i++) {
                const srcIdx = repeatStartIndex + i;
                const dstIdx = measureIndex + i;
                if (measuresMap.has(srcIdx)) {
                   measuresMap.set(dstIdx, [...measuresMap.get(srcIdx)]);
                }
             }
             
             // We must also duplicate the melody for the repeated section
             const repeatEndBeat = globalBeatCounter;
             const repeatDuration = repeatEndBeat - repeatBeatIndex;
             
             const notesToRepeat = importedMelody.filter(n => n.startBeat >= repeatBeatIndex && n.startBeat < repeatEndBeat);
             notesToRepeat.forEach(n => {
                importedMelody.push({
                   freq: n.freq,
                   startBeat: n.startBeat + repeatDuration,
                   durationBeats: n.durationBeats
                });
             });
             
             globalBeatCounter += repeatDuration;
             measureIndex += repeatDurationMeasures;
          }
        });
        
        if (measureIndex > maxMeasureCount) {
          maxMeasureCount = measureIndex;
        }
      });

      const measuresData: SongMeasure[] = [];
      let lastKnownChord = ["Cmaj7"];
      for (let i = 0; i < maxMeasureCount; i++) {
         const chords = measuresMap.get(i) || [];
         if (chords.length === 0) {
            measuresData.push({ id: (i + 1).toString(), chords: [...lastKnownChord] });
         } else {
            measuresData.push({ id: (i + 1).toString(), chords: chords });
            lastKnownChord = [...chords];
         }
      }

      const newSong: Song = {
        id: title.toLowerCase().replace(/[\s\/]+/g, '-'),
        title: title,
        defaultKey: defaultKey as RootNote,
        style: "Importado",
        tempo: 120,
        measures: measuresData.length > 0 ? measuresData : [{ id: "1", chords: ["Cmaj7"] }]
      };

      console.log("IMPORTED SONG: ", newSong);
      onImport(newSong);
      alert(`Partitura "${title}" importada y parseada con éxito.`);
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      alert("Error parseando archivo MusicXML.");
    }
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="h-9 px-2.5 sm:px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 rounded-lg text-xs font-sans font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Subir MusicXML (.xml, .musicxml)"
        >
          <Upload size={14} className="text-sky-400 shrink-0" />
          <span className="hidden sm:inline">MusicXML</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={className || "flex-1 flex justify-center items-center gap-2 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 font-bold rounded-lg text-xs border border-[#EA580B] text-[#EA580B] hover:text-orange-300 transition-colors cursor-pointer"}
          title="Subir archivo MusicXML (.xml, .musicxml)"
        >
          <UploadCloud size={16} className="text-[#EA580B] shrink-0" />
          <span>Subir MusicXML</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-lg relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Importar Canción</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Sube un partitura en formato MusicXML (.xml) generado desde Finale, Sibelius, MuseScore, etc.
            </p>
            
            <div
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging ? "border-[#EA580B] bg-[#EA580B]/10" : "border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800"}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={48} className={`mb-4 ${isDragging ? "text-[#EA580B]" : "text-zinc-600"}`} />
              <p className="text-center text-sm font-medium text-zinc-300">
                Arrastra tu archivo MusicXML aquí o haz clic para explorar
              </p>
              <p className="text-xs text-zinc-500 mt-2">
                Formatos soportados: .xml, .musicxml
              </p>
              <input
                type="file"
                ref={fileInputRef}
                accept=".xml,.musicxml"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
