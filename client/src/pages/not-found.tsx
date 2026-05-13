import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden">
      <div className="scanlines" />
      
      <div className="relative z-10 text-center space-y-8 p-8 border-2 border-destructive bg-black/50 backdrop-blur max-w-lg">
        <div className="flex justify-center">
          <AlertTriangle className="h-24 w-24 text-destructive animate-pulse" />
        </div>
        
        <h1 className="text-6xl font-display font-black text-destructive glitch-text" data-text="404">
          404
        </h1>
        
        <p className="text-xl font-mono text-white/70">
          CRITICAL ERROR: SEGMENT NOT FOUND
          <br/>
          <span className="text-sm opacity-50">The requested data sector has been corrupted or does not exist.</span>
        </p>

        <Link href="/" className="inline-block mt-8">
          <button className="px-8 py-3 bg-destructive text-destructive-foreground font-bold font-mono uppercase hover:bg-destructive/90 transition-colors border-2 border-white/20">
            RETURN_TO_ROOT
          </button>
        </Link>
      </div>
    </div>
  );
}
