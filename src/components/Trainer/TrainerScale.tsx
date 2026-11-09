import { useEffect, useRef, useState, type ReactNode } from "react";

const DESIGN_W = 1400; // width the Trainer was designed at
const DESIGN_H = 900;  // height the Trainer was designed at

export default function TrainerScale({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
      setScale(Math.min(s, 1)); // never upscale; remove min() to allow growing
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden" }}>
      <div
        ref={ref}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
