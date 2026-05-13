import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertConversation, type Conversation, type Message } from "@shared/schema";
import { useState } from "react";

export function useConversations() {
  return useQuery({
    queryKey: [api.chat.listConversations.path],
    queryFn: async () => {
      const res = await fetch(api.chat.listConversations.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return api.chat.listConversations.responses[200].parse(await res.json());
    },
  });
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: [api.chat.getConversation.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.chat.getConversation.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return api.chat.getConversation.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title?: string }) => {
      const res = await fetch(api.chat.createConversation.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return api.chat.createConversation.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chat.listConversations.path] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.chat.deleteConversation.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chat.listConversations.path] });
    },
  });
}

// Custom hook for SSE streaming
export function useChatStream(conversationId: number) {
  const queryClient = useQueryClient();
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (content: string, image?: string) => {
    setIsStreaming(true);
    setStreamingContent("");
    setError(null);

    try {
      // Optimistic update: Add user message immediately
      queryClient.setQueryData(
        [api.chat.getConversation.path, conversationId],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            messages: [
              ...old.messages,
              { role: "user", content, createdAt: new Date() },
            ],
          };
        }
      );

      const url = buildUrl(api.chat.sendMessage.path, { id: conversationId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, image }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to send message");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setStreamingContent((prev) => prev + data.content);
            }
            if (data.done) {
              setIsStreaming(false);
              // Invalidate to fetch the full finalized message from DB
              queryClient.invalidateQueries({
                queryKey: [api.chat.getConversation.path, conversationId],
              });
            }
            if (data.error) {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to stream response");
      setIsStreaming(false);
    }
  };

  return { sendMessage, streamingContent, isStreaming, error };
}
