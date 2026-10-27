import { useState, useEffect } from "react";
import ChordDictionary from "./components/ChordDictionary";
import LanguageSwitch from "./components/LanguageSwitch";
import { getAudioContext } from "./utils/audio";
import { useLanguage } from "./contexts/LanguageContext";
import { Sparkles, Volume2, VolumeX } from "lucide-react";
import { initBrowserShield, AppErrorBoundary } from "./utils/browserShield";

initBrowserShield();

export default function App() {
  const { language } = useLanguage();
  const [audioEnabled, setAudioEnabled] = useState(false);

  const initAudio = async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      setAudioEnabled(ctx.state === "running");
    } catch (e) {
      console.warn("Could not start Audio Context:", e);
    }
  };

  useEffect(() => {
    const handleGesture = () => {
      initAudio();
    };

    window.addEventListener("click", handleGesture);
    window.addEventListener("keydown", handleGesture);

    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, []);

  const isEs = language === "es";

  return (
    <AppErrorBoundary>
      <div
        id="main-app"
        className="min-h-screen bg-[#090a0d] text-neutral-200 font-sans antialiased selection:bg-[#f25100] selection:text-white flex flex-col"
      >
        {/* Header Corporativo Rumie Guitar Chords Pro (Logo Grande estilo Studio Pro) */}
        <header className="w-full bg-[#090a0d] border-b border-[#1c1e28] px-5 sm:px-7 py-3.5 flex items-center justify-between select-none shrink-0 print:hidden">
          {/* Izquierda: Logo Oficial Rumie Agrandado */}
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#f25100] flex items-center justify-center shadow-[0_0_20px_rgba(242,81,0,0.4)] shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-baseline gap-2 leading-none">
                <span>Rumie Guitar Chords</span>
                <span className="font-light text-zinc-400">Pro</span>
              </h1>
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-zinc-400 mt-1.5 leading-none">
                {isEs
                  ? "APRENDE, COMPRENDE Y CREA MÚSICA"
                  : "LEARN, UNDERSTAND AND CREATE MUSIC"}
              </p>
            </div>
          </div>

          {/* Derecha: Consola minimalista de iconos (Audio + Idioma) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={initAudio}
              title={
                audioEnabled
                  ? isEs
                    ? "Motor de audio activo"
                    : "Audio engine active"
                  : isEs
                  ? "Activar audio de guitarra"
                  : "Enable guitar audio"
              }
              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                audioEnabled
                  ? "bg-[#14151c] border-[#232634] text-[#f25100]"
                  : "bg-[#f25100]/15 border-[#f25100]/40 text-[#f25100] animate-pulse"
              }`}
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            <LanguageSwitch />
          </div>
        </header>

        {/* Workspace Directo de Guitar Chords */}
        <main className="flex-1 w-full max-w-[1750px] mx-auto px-4 sm:px-6 py-3">
          <ChordDictionary />
        </main>
      </div>
    </AppErrorBoundary>
  );
}