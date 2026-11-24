"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy", done: doneLabel = "Copied", className = "copy" }: { text: string; label?: string; done?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? doneLabel : label}
    </button>
  );
}
