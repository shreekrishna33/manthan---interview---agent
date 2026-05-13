import { Volume2, Square } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";

interface VoiceAssistantProps {
    text: string;
    autoPlay?: boolean;
}

// Get the best available English voice
function getBestVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v =>
        (v.name.includes("Google") && v.lang.startsWith("en")) ||
        v.name.includes("Samantha") ||
        v.name.includes("Microsoft Zira") ||
        v.name.includes("English")
    ) || voices.find(v => v.lang.startsWith("en")) || null;
}

export function VoiceAssistant({ text, autoPlay }: VoiceAssistantProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const hasAutoPlayed = useRef(false);
    const pokeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Increment whenever autoPlay fires so the effect re-runs reliably
    const [autoPlayKey, setAutoPlayKey] = useState(0);

    const isCanceledRef = useRef(false);

    // Reset auto-play guard when text changes (new message came in)
    useEffect(() => {
        hasAutoPlayed.current = false;
        if (autoPlay) setAutoPlayKey(k => k + 1);
    }, [text, autoPlay]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pokeIntervalRef.current) clearInterval(pokeIntervalRef.current);
            isCanceledRef.current = true;
            window.speechSynthesis.cancel();
        };
    }, []);

    // Poll to sync isPlaying state with actual synthesis state
    useEffect(() => {
        const id = setInterval(() => {
            if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
                setIsPlaying(false);
            }
        }, 400);
        return () => clearInterval(id);
    }, []);

    const playVoice = (textToRead: string) => {
        try {
            isCanceledRef.current = false;
            window.speechSynthesis.cancel();
            if (pokeIntervalRef.current) clearInterval(pokeIntervalRef.current);

            // Strip markdown and reasoning tags
            const cleanText = textToRead
                .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "")
                .replace(/[#*`_~>]/g, "")
                .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // remove markdown links
                .trim();

            if (!cleanText) return;

            // Split into sentence-sized chunks for better Chrome support
            const chunks = cleanText.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [cleanText];

            // Voices may not be loaded yet — use a small delay if empty
            const startSpeaking = () => {
                const preferredVoice = getBestVoice();
                let currentIndex = 0;

                const speakNext = () => {
                    if (isCanceledRef.current || currentIndex >= chunks.length) {
                        setIsPlaying(false);
                        if (pokeIntervalRef.current) clearInterval(pokeIntervalRef.current);
                        return;
                    }

                    const utterance = new SpeechSynthesisUtterance(chunks[currentIndex].trim());
                    if (preferredVoice) utterance.voice = preferredVoice;
                    utterance.pitch = 1.05;
                    utterance.rate = 1.0;
                    utterance.volume = 1.0;

                    utterance.onend = () => {
                        currentIndex++;
                        speakNext();
                    };

                    utterance.onerror = (e) => {
                        console.error("TTS chunk error:", e);
                        currentIndex++;
                        speakNext();
                    };

                    window.speechSynthesis.speak(utterance);
                };

                setIsPlaying(true);
                speakNext();

                // Chrome bug: synthesis can hang — poke it periodically
                pokeIntervalRef.current = setInterval(() => {
                    if (!window.speechSynthesis.speaking) {
                        clearInterval(pokeIntervalRef.current!);
                    } else {
                        window.speechSynthesis.pause();
                        window.speechSynthesis.resume();
                    }
                }, 5000);
            };

            if (window.speechSynthesis.getVoices().length === 0) {
                window.speechSynthesis.onvoiceschanged = () => {
                    window.speechSynthesis.onvoiceschanged = null;
                    if (!isCanceledRef.current) startSpeaking();
                };
            } else {
                startSpeaking();
            }
        } catch (err) {
            console.error("playVoice failed:", err);
            setIsPlaying(false);
        }
    };

    // Auto-play when the flag is set — driven by autoPlayKey so it fires every new voice reply
    useEffect(() => {
        if (autoPlay && !hasAutoPlayed.current && text) {
            hasAutoPlayed.current = true;
            // Small delay ensures the synthesis API is unblocked after the user gesture
            setTimeout(() => {
                if (!isCanceledRef.current) playVoice(text);
            }, 600);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPlayKey]);

    const toggleSpeech = () => {
        if (isPlaying) {
            isCanceledRef.current = true;
            window.speechSynthesis.cancel();
            if (pokeIntervalRef.current) clearInterval(pokeIntervalRef.current);
            setIsPlaying(false);
            return;
        }
        playVoice(text);
    };

    return (
        <Button
            variant={isPlaying ? "default" : "outline"}
            size="sm"
            onClick={toggleSpeech}
            className="gap-2 transition-all ml-2"
            title={isPlaying ? "Stop reading" : "Read aloud"}
        >
            {isPlaying ? (
                <>
                    <span className="flex items-end gap-0.5 h-4">
                        {[1, 3, 2, 4, 2, 3, 1].map((h, i) => (
                            <span
                                key={i}
                                className="w-0.5 bg-current rounded-full animate-bounce"
                                style={{
                                    height: `${h * 3}px`,
                                    animationDelay: `${i * 80}ms`,
                                    animationDuration: "0.7s",
                                }}
                            />
                        ))}
                    </span>
                    <span>Stop</span>
                </>
            ) : (
                <>
                    <Volume2 className="h-4 w-4" />
                    <span>Read Aloud</span>
                </>
            )}
        </Button>
    );
}
