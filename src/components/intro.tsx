import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SESSION = "honesty.intro.played";

export function introAlreadyPlayed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(SESSION) === "1";
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    window.sessionStorage.setItem(SESSION, "1");
  } catch {
    /* private mode */
  }
}

export function Intro({ onDone }: { onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    markPlayed();
    onDone();
  }

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = window.setTimeout(finish, 900);
      return () => window.clearTimeout(id);
    }

    const el = video.current;
    if (!el) return;

    const play = async () => {
      el.muted = true;
      try {
        await el.play();
      } catch {
        /* poster holds. Everett still has Enter the desk. */
      }
    };
    void play();

    const onCanPlay = () => {
      if (el.paused) void play();
    };
    el.addEventListener("canplay", onCanPlay);
    return () => el.removeEventListener("canplay", onCanPlay);
  }, []);

  async function unmute() {
    const el = video.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    try {
      await el.play();
    } catch {
      /* keep muted */
      el.muted = true;
      setMuted(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Honesty above all else"
    >
      <video
        ref={video}
        className="absolute inset-0 size-full object-contain bg-bg"
        src="/family/honesty-above-all.mp4"
        poster="/family/family.jpg"
        playsInline
        muted
        preload="auto"
        onEnded={finish}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-bg to-transparent" />
      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 px-5 pb-safe py-5">
        <p className="font-display text-lg italic text-fg">Honesty above all else.</p>
        <div className="flex flex-wrap gap-2">
          {muted ? (
            <Button variant="secondary" onClick={() => void unmute()}>
              Sound
            </Button>
          ) : null}
          <Button variant="primary" onClick={finish}>
            Enter the desk
          </Button>
        </div>
      </div>
    </div>
  );
}
