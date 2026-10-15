"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from "react";

interface SignaturePadProps {
  /** Called with a PNG data URL after each stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
  disabled?: boolean;
}

interface Point {
  x: number;
  y: number;
}

export const SignaturePad = ({ onChange, height = 180, disabled = false }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const toPoint = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const begin = useCallback((p: Point) => {
    if (disabled) return;
    drawingRef.current = true;
    lastPointRef.current = p;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Dot for single taps.
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
  }, [disabled]);

  const move = useCallback((p: Point) => {
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastPointRef.current;
    if (!drawingRef.current || !ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  }, []);

  const end = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    setIsEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setIsEmpty(true);
    onChange(null);
  };

  // Touch pointers are handled by the touch handlers below to avoid double-drawing.
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    begin(toPoint(e.clientX, e.clientY));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") return;
    move(toPoint(e.clientX, e.clientY));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") return;
    end();
  };

  const onTouchStart = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    if (t) begin(toPoint(t.clientX, t.clientY));
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    if (t) move(toPoint(t.clientX, t.clientY));
  };

  return (
    <div className="w-full">
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair rounded-lg"
          aria-label="Signature drawing area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={end}
          onTouchCancel={end}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Sign here
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={disabled || isEmpty}
        className="mt-2 text-sm font-medium text-gray-600 underline disabled:cursor-not-allowed disabled:opacity-40"
      >
        Clear Signature
      </button>
    </div>
  );
};
