import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useConversations, useConversation, useCreateConversation, useDeleteConversation, useChatStream } from "@/hooks/use-chat";
import { useLogout } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlitchButton } from "@/components/GlitchButton";
import { ChatMessage } from "@/components/ChatMessage";
import { Send, Plus, Trash2, Terminal, Menu, X, Cpu, Image as ImageIcon, XCircle, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Chat() {
  const [params, setLocation] = useLocation();
  const { id } = useParams<{ id?: string }>(); // Wouter params are usually strings
  const conversationId = id ? parseInt(id) : null;
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lastInputWasVoice, setLastInputWasVoice] = useState(false);
  // Persistent ref: survives re-renders and query refetches — set true when voice was used
  const voiceReplyPendingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const { data: conversations, isLoading: loadingList } = useConversations();
  const { data: conversation, isLoading: loadingChat, isError: chatError } = useConversation(conversationId);
  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();
  const logoutMutation = useLogout();

  // Custom hook handles streaming logic
  const { sendMessage, streamingContent, isStreaming, error } = useChatStream(conversationId || 0);

  // Unlock speech synthesis (browser requires user gesture before TTS)
  const unlockSpeechSynthesis = useCallback(() => {
    try {
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    } catch (_) {}
  }, []);

  // Auto-submit voice transcript (used by manual mic)
  const submitVoiceTranscript = useCallback(async (transcript: string) => {
    if (!conversationId || isStreaming || !transcript.trim()) return;
    unlockSpeechSynthesis();
    setLastInputWasVoice(true);
    voiceReplyPendingRef.current = true; // Mark that TTS auto-play is expected
    await sendMessage(transcript);
  }, [conversationId, isStreaming, sendMessage, unlockSpeechSynthesis]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingContent]);

  // Handle unauthorized or missing chat access
  useEffect(() => {
    if (chatError) {
      toast({
        title: "ACCESS DENIED",
        description: "That interview session does not exist or belongs to another agent.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [chatError, setLocation, toast]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast({
        title: "SYSTEM ERROR",
        description: "Connection severed. The mainframe is unresponsive.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleCreateChat = async () => {
    try {
      const newChat = await createMutation.mutateAsync({ title: "Interviewer Node" });
      setLocation(`/chat/${newChat.id}`);
      setSidebarOpen(false);
    } catch (e) {
      // handled by mutation error
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    if (confirm("Close assessment? Data will be lost.")) {
      await deleteMutation.mutateAsync(chatId);
      if (conversationId === chatId) {
        setLocation("/");
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "FILE_TOO_LARGE", description: "File limit is 5MB.", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !selectedImage) return;

    const content = input;
    const image = selectedImage || undefined;
    const wasVoice = lastInputWasVoice;

    setInput("");
    setSelectedImage(null);
    setLastInputWasVoice(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Unlock speech synthesis API on user gesture before async stream starts
    if (wasVoice) {
      unlockSpeechSynthesis();
      voiceReplyPendingRef.current = true;
    }

    await sendMessage(content || "What's in this image?", image);
  };

  const startVoiceInput = useCallback(() => {
    // If already recording, stop it
    if (isRecording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not Supported", description: "Voice input is not supported in this browser. Please use Chrome.", variant: "destructive" });
      return;
    }

    try {
      unlockSpeechSynthesis(); // Unlock TTS on user gesture

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true; // Show live feedback
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      let finalTranscript = "";

      recognition.onstart = () => {
        setIsRecording(true);
        toast({ title: "🎙️ Listening", description: "Speak now — I'm listening!", variant: "default" });
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += t + " ";
          } else {
            interim = t;
          }
        }
        // Show live interim in the input box
        setInput((finalTranscript + interim).trim());
      };

      recognition.onerror = (event: any) => {
        console.error("Recognition Error:", event.error);
        setIsRecording(false);
        recognitionRef.current = null;

        if (event.error === "not-allowed" || event.error === "permission-denied") {
          toast({ title: "Mic Blocked", description: "Please allow microphone access in your browser settings.", variant: "destructive" });
        } else if (event.error === "no-speech") {
          toast({ title: "No Speech", description: "Didn't catch that. Try again!", variant: "default" });
        } else if (event.error !== "aborted") {
          toast({ title: "Mic Error", description: `Error: ${event.error}`, variant: "destructive" });
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        recognitionRef.current = null;

        const spokenText = finalTranscript.trim();
        if (spokenText) {
          // Auto-submit the voice message
          setInput("");
          setLastInputWasVoice(true);
          submitVoiceTranscript(spokenText);
        } else {
          setInput("");
        }
      };

      recognition.start();
    } catch (err) {
      console.error("Critical Start Error:", err);
      setIsRecording(false);
      recognitionRef.current = null;
      toast({ title: "Mic Error", description: "Could not start microphone. Please try again.", variant: "destructive" });
    }
  }, [isRecording, unlockSpeechSynthesis, toast, submitVoiceTranscript]);

  // Combine DB messages with streaming content
  const messages = conversation?.messages || [];

  // Create a placeholder message for the streaming content if active
  if (isStreaming && streamingContent) {
    // handled inside ChatMessage rendering now or via displayMessages
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageSelect}
      />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full h-16 border-b border-border bg-background/90 backdrop-blur z-50 flex items-center px-4 justify-between">
        <h1 className="font-display font-bold text-xl tracking-tighter text-primary">AI Interview Coach</h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 border border-border rounded-lg">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:relative z-40 w-80 h-full bg-muted/10 border-r border-border flex flex-col transition-transform duration-300 md:translate-x-0 pt-16 md:pt-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-border">
          <GlitchButton
            onClick={handleCreateChat}
            className="w-full flex items-center justify-center gap-2"
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? "Starting..." : "New Practice"}
          </GlitchButton>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-custom p-4 space-y-2">
          {loadingList ? (
            <div className="text-xs text-muted-foreground animate-pulse font-mono text-center mt-10">
              Loading your chats...
            </div>
          ) : conversations?.length === 0 ? (
            <div className="text-center mt-10 opacity-50">
              <Terminal className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs">No chats yet!</p>
            </div>
          ) : (
            conversations?.map((chat: any) => (
              <div
                key={chat.id}
                onClick={() => {
                  setLocation(`/chat/${chat.id}`);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "group relative p-4 rounded-xl border transition-all cursor-pointer hover:shadow-sm",
                  conversationId === chat.id
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/50"
                )}
              >
                <div className="pr-8 truncate font-medium text-sm">{chat.title || `INTERVIEW #${chat.id}`}</div>
                <div className="text-xs mt-1 text-muted-foreground">
                  {new Date(chat.createdAt).toLocaleString()}
                </div>

                <button
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 hover:text-destructive transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border flex flex-col gap-2 bg-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <div className="text-xs text-center text-muted-foreground py-1">
            Status: Ready to help!
          </div>
          <button 
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors py-2 border border-destructive/20 hover:border-destructive/50 w-full rounded-lg bg-destructive/5 hover:bg-destructive/10"
          >
            {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full pt-16 md:pt-0 relative z-0">
        {!conversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-8 relative">
              <Cpu className="w-16 h-16 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 tracking-tight">
              Welcome!
            </h1>
            <p className="text-muted-foreground max-w-md text-base mb-8">
              I'm excited to help you practice and succeed. Let's get started!
            </p>
            <GlitchButton onClick={handleCreateChat} className="shadow-lg">
              Begin Practice
            </GlitchButton>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto scrollbar-custom p-4 md:p-8" ref={scrollRef}>
              {loadingChat ? (
                <div className="flex items-center justify-center h-full">
                  <div className="font-mono text-primary animate-pulse">Loading messages...</div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  {messages.map((msg: any, i: number) => {
                    const isAI = msg.role === "model" || msg.role === "assistant";
                    // Find the index of the last AI message for autoPlay
                    const lastAiIndex = messages.reduce((last: number, m: any, idx: number) =>
                      (m.role === "model" || m.role === "assistant") ? idx : last, -1
                    );
                    // Auto-play the last AI message if the user's last input was voice
                    const shouldAutoPlay = lastInputWasVoice && isAI && i === lastAiIndex;
                    return (
                      <ChatMessage
                        key={i}
                        role={msg.role as any}
                        content={msg.content}
                        autoPlay={shouldAutoPlay}
                        createdAt={msg.createdAt}
                      />
                    );
                  })}
                  {/* Streaming message */}
                  {isStreaming && streamingContent && (
                    <ChatMessage
                      role="assistant"
                      content={streamingContent}
                      isStreaming={true}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-border bg-background/80 backdrop-blur">
              <div className="max-w-4xl mx-auto flex flex-wrap gap-2 mb-4">
                <GlitchButton
                  variant="ghost"
                  onClick={() => sendMessage("/mode interviewer")}
                  disabled={isStreaming}
                  className="text-[10px] py-1.5 px-3 border border-border hover:border-primary/50 hover:bg-primary/5"
                  title="Switch to AI Interviewer Mode"
                >
                  <Cpu className="w-3 h-3 mr-1 inline" />
                  👔 Interviewer
                </GlitchButton>
                <GlitchButton
                  variant="ghost"
                  onClick={() => sendMessage("/mode attender")}
                  disabled={isStreaming}
                  className="text-[10px] py-1.5 px-3 border border-border hover:border-primary/50 hover:bg-primary/5"
                  title="Switch to AI Attender Mode"
                >
                  <Terminal className="w-3 h-3 mr-1 inline" />
                  📚 Attender
                </GlitchButton>
                <div className="flex-1" />
                <div className="text-xs font-medium text-muted-foreground flex items-center">
                  Modes: [V1.2_BETA]
                </div>
              </div>
              <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-4">
                {selectedImage && (
                  <div className="relative w-24 h-24 border-2 border-primary group rounded-sm overflow-hidden animate-in zoom-in">
                    <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-1 right-1 text-white hover:text-destructive bg-black/50 rounded-full"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <div className="flex gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 border rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    title="Upload support documents"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={startVoiceInput}
                    className={cn(
                      "relative p-3.5 border rounded-xl transition-all flex items-center justify-center min-w-[52px]",
                      isRecording
                        ? "border-red-500 bg-red-500/10 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/50"
                    )}
                    title={isRecording ? "Tap to stop" : "Start voice input (or say 'Manthan')"}
                    disabled={isStreaming}
                  >
                    {isRecording ? (
                      <span className="flex items-end gap-[2px] h-5">
                        {[2, 4, 3, 5, 3, 4, 2].map((h, i) => (
                          <span
                            key={i}
                            className="w-[2px] bg-red-500 rounded-full animate-bounce"
                            style={{
                              height: `${h * 4}px`,
                              animationDelay: `${i * 70}ms`,
                              animationDuration: "0.55s",
                            }}
                          />
                        ))}
                      </span>
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => {
                      if (!isRecording) {
                        setInput(e.target.value);
                        setLastInputWasVoice(false);
                      }
                    }}
                    placeholder={isRecording ? "🎙️ Listening... speak now" : "Type your response or click 🎙️ to speak..."}
                    className={cn(
                      "flex-1 bg-background border rounded-xl p-4 text-sm focus:outline-none focus:ring-2 transition-all shadow-sm",
                      isRecording
                        ? "border-red-400/60 focus:ring-red-400/40 text-muted-foreground italic"
                        : "focus:ring-primary/50"
                    )}
                    disabled={isStreaming}
                    readOnly={isRecording}
                  />
                  <GlitchButton
                    type="submit"
                    disabled={(!input.trim() && !selectedImage) || isStreaming}
                    className="px-8"
                  >
                    <Send className="w-5 h-5" />
                  </GlitchButton>
                </div>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
