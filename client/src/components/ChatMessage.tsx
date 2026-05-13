import { cn } from "@/lib/utils";
import { Bot, User, Brain, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from "react";
import { VoiceAssistant } from "./VoiceAssistant";

interface ChatMessageProps {
  role: "user" | "model" | "assistant"; // model/assistant are AI
  content: string;
  isStreaming?: boolean;
  autoPlay?: boolean;
  createdAt?: string | Date;
}

export function ChatMessage({ role, content, isStreaming, autoPlay, createdAt }: ChatMessageProps) {
  const isAI = role === "model" || role === "assistant";
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse out <reasoning> tags
  const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  const reasoning = reasoningMatch ? reasoningMatch[1] : null;
  const displayContent = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/, "").trim();

  // If streaming and we only have reasoning so far, show a pulsing indicator
  const isEmpty = !displayContent && isStreaming;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "flex w-full gap-4 p-5 mb-4 border rounded-2xl transition-all duration-300 shadow-sm",
      isAI
        ? "bg-card border-border text-card-foreground ml-0 mr-auto max-w-[90%]"
        : "bg-primary text-primary-foreground border-primary/80 ml-auto max-w-[85%]"
    )}>
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border",
        isAI ? "border-primary/30 bg-primary/10 text-primary" : "border-white/30 bg-white/20 text-white"
      )}>
        {isAI ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
      </div>

      <div className="flex-1 overflow-hidden min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn("text-xs font-semibold uppercase tracking-wider", isAI ? "text-primary" : "text-white/90")}>
            {isAI ? "AI Coach" : "You"}
          </span>
          <span className={cn("text-xs mr-auto", isAI ? "text-muted-foreground" : "text-white/70")}>
            {createdAt ? new Date(createdAt).toLocaleString() : new Date().toLocaleString()}
          </span>
        </div>

        {reasoning && (
          <div className="mb-4">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-2"
            >
              <Brain className="w-3 h-3" />
              {showThinking ? "Hide AI Thoughts" : "View AI Thoughts"}
            </button>

            {showThinking && (
              <div className="bg-muted/30 border border-border rounded-lg p-3 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-2 shadow-sm">
                <p className="mb-1 text-[10px] opacity-50 uppercase font-semibold">Coach's Inner Monologue</p>
                {reasoning}
              </div>
            )}
          </div>
        )}

        {isEmpty ? (
          <div className="flex items-center gap-1 h-6">
            <span className="w-2 h-2 bg-primary animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-2 h-2 bg-primary animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-2 h-2 bg-primary animate-bounce"></span>
          </div>
        ) : (
          <div className={cn("prose prose-p:text-sm max-w-none", isAI ? "prose-slate dark:prose-invert" : "prose-invert")}>
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="relative group">
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(String(children))}
                          className="p-1 hover:bg-muted/50 rounded"
                        >
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        {...props}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code className="bg-muted px-1 py-0.5 rounded text-primary font-mono text-sm" {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />}

            {/* Voice button below the message */}
            {isAI && !isStreaming && displayContent && (
              <div className="mt-4 pt-3 border-t border-border flex justify-end">
                <VoiceAssistant text={displayContent} autoPlay={autoPlay} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
