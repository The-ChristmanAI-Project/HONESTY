import { useEffect, useState } from "react";

const VIDEO_SRC = "/family/honesty-above-all.mp4";
const STILL_SRC = "/family/family.jpg";

export function FamilySplash() {
  const [phase, setPhase] = useState<"video" | "still" | "done">("video");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setPhase("still");
  }, []);

  if (phase === "done") return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-bg">
      {phase === "video" ? (
        <video
          className="h-full w-full object-contain"
          src={VIDEO_SRC}
          poster={STILL_SRC}
          autoPlay
          muted
          playsInline
          onEnded={() => setPhase("still")}
          onError={() => setPhase("still")}
        />
      ) : (
        <button
          type="button"
          className="flex h-full w-full items-center justify-center"
          onClick={() => setPhase("done")}
          aria-label="Enter the desk"
        >
          <img src={STILL_SRC} alt="Honesty above all else. The family." className="h-full w-full object-contain" />
        </button>
      )}
    </div>
  );
}
