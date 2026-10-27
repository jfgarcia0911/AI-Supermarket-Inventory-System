"use client";

import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Shop barcodes: EAN/UPC on products, ITF and Code 128 on cases.
const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "code_128",
] as const;

/** The same code is reported again only after this pause. */
const REPEAT_AFTER_MS = 2500;

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The camera is blocked. Allow it in the browser's settings for this site, or type the code.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Type the code instead.";
  }
  if (name === "NotReadableError") {
    return "Another app is using the camera. Close it and try again.";
  }
  return "The camera could not be started. Type the code instead.";
}

/**
 * Reads barcodes with the phone or laptop camera. The barcode engine
 * (zxing-wasm) is loaded from this site only when the camera opens, and works
 * on iPhones too, where browsers have no built-in barcode reader.
 */
export function CameraScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectRef = useRef(onDetect);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">(
    "starting",
  );
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("No camera API", "NotFoundError");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();

        const { BarcodeDetector, prepareZXingModule } =
          await import("barcode-detector/ponyfill");
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? `/scanner/${path}` : prefix + path,
          },
        });
        const detector = new BarcodeDetector({ formats: [...FORMATS] });
        if (stopped) return;
        setStatus("scanning");

        let lastCode = "";
        let lastAt = 0;
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const [found] = await detector.detect(video);
              const code = found?.rawValue.trim();
              const now = Date.now();
              if (
                code &&
                (code !== lastCode || now - lastAt > REPEAT_AFTER_MS)
              ) {
                lastCode = code;
                lastAt = now;
                navigator.vibrate?.(60);
                onDetectRef.current(code);
              }
            }
          } catch {
            // A frame that cannot be read is skipped.
          }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      } catch (error) {
        if (stopped) return;
        setProblem(cameraProblem(error));
        setStatus("error");
      }
    };
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] w-full object-cover"
          aria-label="Camera view"
        />
        {/* A guide for where to hold the barcode. */}
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-md border-2 border-white/80" />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Spinner /> Starting the camera…
          </div>
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="absolute top-2 right-2"
          onClick={onClose}
          aria-label="Close the camera"
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {status === "error"
          ? problem
          : "Hold the barcode inside the box. It is read automatically."}
      </p>
    </div>
  );
}
