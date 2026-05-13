import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { GlitchButton } from "@/components/GlitchButton";
import { Cpu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    try {
      if (isLogin) {
        await loginMutation.mutateAsync({ username, password });
      } else {
        await registerMutation.mutateAsync({ username, password });
      }
    } catch (err: any) {
      toast({
        title: "Authentication Failed",
        description: err.message || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative flex h-screen bg-background items-center justify-center p-4">
      {/* Theme toggle fixed top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full p-8 bg-card border rounded-2xl shadow-sm z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center relative">
            <Cpu className="w-8 h-8 text-primary" />
          </div>
        </div>

        <h1 className="text-center text-2xl font-display font-semibold mb-2">
          {isLogin ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-8">
          Please sign in to access the AI Interview Coach.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-background border border-input rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-input rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>

          <GlitchButton
            type="submit"
            className="w-full mt-2"
            disabled={loginMutation.isPending || registerMutation.isPending}
          >
            {isLogin ? "Sign In" : "Register"}
          </GlitchButton>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up." : "Already have an account? Sign in."}
          </button>
        </div>
      </div>
    </div>
  );
}
