import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/Chat";

import { useUser } from "@/hooks/use-auth";
import AuthPage from "@/pages/Auth";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

function Router() {
  const { data: user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  // Initialize theme on mount (applies dark/light class to <html>)
  useTheme();
  return (
    <TooltipProvider>
      <Toaster />
      <Router />
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
