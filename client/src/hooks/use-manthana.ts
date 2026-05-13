import { useEffect, useRef, useState, useCallback } from "react";

export type WakeState = "inactive" | "idle" | "waking";

interface UseManthanOptions {
  onWake: () => void;
  enabled?: boolean;
}

export function useManthan({ onWake, enabled = true }: UseManthanOptions) {
  const [wakeState, setWakeState] = useState<WakeState>("inactive");
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const loopRef = useRef<(() => void) | null>(null);
  const restartTimerRef = useRef<any>(null);

  const scheduleRestart = useCallback((delay = 500) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (activeRef.current && !pausedRef.current && loopRef.current) {
        loopRef.current();
      }
    }, delay);
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      console.log("Stopping Manthan wake recognition...");
      try { 
        recognitionRef.current.onend = null; 
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort(); 
      } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  const pauseWake = useCallback(() => {
    console.log("Manthan: Pausing wake detection");
    pausedRef.current = true;
    stopRecognition();
  }, [stopRecognition]);

  const resumeWake = useCallback(() => {
    console.log("Manthan: Resuming wake detection");
    pausedRef.current = false;
    scheduleRestart(500);
  }, [scheduleRestart]);

  const handleWake = useCallback(() => {
    console.log("Manthan: Wake word detected! Triggering manual mic...");
    stopRecognition();
    setWakeState("waking");
    onWake();
  }, [onWake, stopRecognition]);

  const startWakeLoop = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return;
    
    // @ts-ignore
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    setWakeState("idle"); // Clear the "waking" indicator
    stopRecognition();
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    let woken = false;

    rec.onresult = (e: any) => {
      if (woken) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase();
        console.log("Manthan Wake Loop Hearing:", t); 
        if (
          t.includes("manthan") ||
          t.includes("hey manthan") ||
          t.includes("mantan") ||
          t.includes("mathan") ||
          t.includes("monthan") ||
          t.includes("mountain") || 
          t.includes("mancun") ||
          t.includes("manton")
        ) {
          woken = true;
          handleWake();
          return;
        }
      }
    };

    rec.onend = () => {
      if (!woken) scheduleRestart(200);
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        activeRef.current = false;
        setWakeState("inactive");
        return;
      }
      if (!woken) scheduleRestart(800);
    };

    try { 
      rec.start(); 
    } catch (err) {
      scheduleRestart(1000);
    }
  }, [handleWake, stopRecognition, scheduleRestart]);

  useEffect(() => {
    loopRef.current = startWakeLoop;
  }, [startWakeLoop]);

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      stopRecognition();
      setWakeState("inactive");
      return;
    }

    // @ts-ignore
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setWakeState("inactive"); return; }

    activeRef.current = true;
    pausedRef.current = false;
    setWakeState("idle");
    startWakeLoop();

    return () => {
      activeRef.current = false;
      stopRecognition();
    };
  }, [enabled, startWakeLoop, stopRecognition]);

  return { wakeState, pauseWake, resumeWake };
}

