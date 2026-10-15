"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGlobalState, DevUser } from "@/context/GlobalContext";
import { getInterpreters } from "@/app/actions/getInterpreters";
import type { SelectInterpreter } from "@/db/schema";

export function DevSwitcher() {
  const { currentUser, setCurrentUser } = useGlobalState();
  const router = useRouter();

  const [dbInterpreters, setDbInterpreters] = useState<SelectInterpreter[]>([]);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const startPos = useRef({ x: 0, y: 0 });

  const loadInterpreters = useCallback(async () => {
    try {
      const list = await getInterpreters();
      setDbInterpreters(list);
    } catch (err) {
      console.error("DevSwitcher failed to load interpreters from database:", err);
    }
  }, []);

  useEffect(() => {
    loadInterpreters();
    window.addEventListener("focus", loadInterpreters);
    return () => window.removeEventListener("focus", loadInterpreters);
  }, [loadInterpreters]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore if user is clicking on a select element
    if ((e.target as HTMLElement).tagName.toLowerCase() === "select") {
      return;
    }

    setIsDragging(true);
    startPos.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    setOffset({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    let newUser: DevUser;

    if (value === "staff-1") {
      newUser = {
        id: "staff-1",
        role: "agency",
        name: "Avery North",
        email: "north.staff@fictional.test",
        agency_id: "agency-1",
      };
    } else {
      const foundInterpreter = dbInterpreters.find((i) => i.id === value);
      if (foundInterpreter) {
        newUser = {
          id: foundInterpreter.id,
          role: "interpreter",
          name: foundInterpreter.name,
          email: foundInterpreter.email,
        };
      } else {
        newUser = {
          id: value,
          role: "interpreter",
          email: currentUser.email,
        };
      }
    }

    setCurrentUser(newUser);

    // Enforce role-based UI by redirecting to their respective dashboard
    if (newUser.role === "agency") {
      router.push("/dashboard");
    } else if (newUser.role === "interpreter") {
      router.push("/interpreter-home");
    }
  };

  const isCurrentInDb = dbInterpreters.some((i) => i.id === currentUser.id);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        touchAction: isDragging ? "none" : "auto",
      }}
      className={`fixed bottom-4 left-4 z-[9999] bg-white border-2 border-orange-500 rounded-xl p-3 shadow-2xl flex flex-col gap-2 min-w-[240px] max-w-[320px] ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <div className="flex flex-col gap-0.5 border-b border-gray-100 pb-2">
        <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider flex items-center justify-between">
          <span>Dev Toggle</span>
          <span className="text-[9px] font-normal text-gray-400">Live DB</span>
        </div>
        <div className="text-xs text-gray-500 font-medium">
          Role: <span className="text-gray-800 font-semibold capitalize">{currentUser.role}</span>
        </div>
        {currentUser.name && (
          <div className="text-xs text-gray-500 font-medium truncate">
            Name: <span className="text-gray-800">{currentUser.name}</span>
          </div>
        )}
        {currentUser.email && (
          <div className="text-xs text-gray-500 font-medium truncate">
            Email: <span className="text-gray-800">{currentUser.email}</span>
          </div>
        )}
        <div className="text-xs text-gray-500 font-medium truncate">
          ID: <span className="text-gray-700 font-mono text-[10px]">{currentUser.id}</span>
        </div>
      </div>

      <select
        value={currentUser.id}
        onChange={handleSwitch}
        onFocus={loadInterpreters}
        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-orange-400 w-full cursor-pointer text-gray-800 font-medium"
      >
        <optgroup label="Agency">
          <option value="staff-1">Agency Staff (Avery North)</option>
        </optgroup>

        {dbInterpreters.length > 0 && (
          <optgroup label="Interpreters (PostgreSQL)">
            {dbInterpreters.map((interpreter) => (
              <option key={interpreter.id} value={interpreter.id}>
                {interpreter.name} ({interpreter.email})
              </option>
            ))}
          </optgroup>
        )}

        {/* Fallback for legacy ID when not in DB */}
        {!isCurrentInDb && currentUser.id !== "staff-1" && (
          <optgroup label="Current Selection">
            <option value={currentUser.id}>
              {currentUser.name || currentUser.id} ({currentUser.email || "No email"})
            </option>
          </optgroup>
        )}
      </select>
    </div>
  );
}
