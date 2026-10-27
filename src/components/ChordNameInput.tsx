import React, { useState, useEffect, useRef } from "react";
import { getMasterChordSuggestions, ChordSuggestion } from "../utils/chordSuggestions";

interface ChordNameInputProps {
  chordName: string;
  isEditMode: boolean;
  isPlaying: boolean;
  isFocused: boolean;
  sequenceGroupingClass: string;
  globalKey?: string;
  onSave: (newChord: string) => void;
  onClick: () => void;
}

export default function ChordNameInput({
  chordName,
  isEditMode,
  isPlaying,
  isFocused,
  sequenceGroupingClass,
  globalKey = "C",
  onSave,
  onClick,
}: ChordNameInputProps) {
  const [draft, setDraft] = useState(chordName || "");
  const [isEditing, setIsEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<ChordSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setDraft(chordName || "");
  }, [chordName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      setIsOpen(true);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isOpen && !isEditing) return;
    const items = getMasterChordSuggestions(draft, globalKey);
    setSuggestions(items);
  }, [draft, isOpen, isEditing, globalKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        (isEditing || isOpen) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsEditing(false);
        setIsOpen(false);
        if (draft.trim() !== (chordName || "")) {
          onSave(draft);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, isOpen, draft, chordName, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsEditing(false);
      setIsOpen(false);
      if (draft.trim() !== (chordName || "")) {
        onSave(draft);
      }
    }
  };

  const handleSelectSuggestion = (suggestionChord: string) => {
    setDraft(suggestionChord);
    setIsEditing(false);
    setIsOpen(false);
    onSave(suggestionChord);
  };

  if (isEditing || (isEditMode && !chordName)) {
    return (
      <div ref={containerRef} className="relative overflow-visible z-50 w-full">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setIsOpen(true);
            setIsEditing(true); // Ensure editing is marked if they type
          }}
          onFocus={() => {
             setIsOpen(true);
             setIsEditing(true);
          }}
          onClick={() => {
             setIsOpen(true);
             setIsEditing(true);
          }}
          onKeyDown={handleKeyDown}
          className="bg-transparent text-center font-bold text-white outline-none border-b border-zinc-500 focus:border-[#EA580B] w-full py-1 text-[11px] sm:text-xs font-mono relative z-[51]"
          placeholder="Ej: Cmaj7"
        />
        {isOpen && suggestions.length > 0 && (
          <ul className="absolute top-[110%] left-1/2 -translate-x-1/2 min-w-[200px] max-w-[260px] z-[99999] bg-neutral-900 border border-neutral-700 rounded-md shadow-none max-h-56 overflow-y-auto divide-y divide-neutral-800 custom-scrollbar text-left">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.chord}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectSuggestion(suggestion.chord);
                }}
                className="hover:bg-[#EA580B] hover:text-white px-2.5 py-1.5 cursor-pointer text-left font-mono transition-colors text-neutral-200 flex items-center justify-between gap-2 group"
              >
                <span className="text-xs font-bold font-mono tracking-wide group-hover:text-white text-neutral-100">
                  {suggestion.chord}
                </span>
                {suggestion.label && (
                  <span className="text-[10px] text-neutral-400 group-hover:text-black/90 font-sans truncate">
                    {suggestion.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        onClick();
        if (isEditMode) {
          setIsEditing(true);
        }
      }}
      className={`w-full py-1 rounded-none border-none text-center font-mono font-bold transition duration-150 cursor-pointer measure-chord-name print:text-black print:bg-transparent print:ring-0 print:scale-100 print:shadow-none print:font-bold ${
        isPlaying
          ? "bg-[#EA580B] text-white z-10 shadow-none font-bold"
          : isFocused
          ? "bg-neutral-800 text-neutral-100 z-10 shadow-none font-bold text-base sm:text-lg"
          : "bg-transparent text-neutral-100 hover:text-white text-base sm:text-lg min-h-[26px]"
      }`}
    >
      {chordName === '%' ? (
        <span className="block text-sm sm:text-base font-bold font-mono select-none leading-none tracking-wide text-center text-neutral-100">
          %
        </span>
      ) : (
        <span className="block truncate tracking-wide text-neutral-100 font-bold">{chordName || "..."}</span>
      )}
    </button>
  );
}
