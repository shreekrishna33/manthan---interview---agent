import { z } from "zod";
import { insertMessageSchema, insertConversationSchema, conversations, messages } from "./models/chat.ts";

export const api = {
  chat: {
    listConversations: {
      method: "GET" as const,
      path: "/api/conversations" as const,
      responses: {
        200: z.array(z.custom<typeof conversations.$inferSelect>()),
      },
    },
    getConversation: {
      method: "GET" as const,
      path: "/api/conversations/:id" as const,
      responses: {
        200: z.custom<typeof conversations.$inferSelect & { messages: typeof messages.$inferSelect[] }>(),
        404: z.object({ error: z.string() }),
      },
    },
    createConversation: {
      method: "POST" as const,
      path: "/api/conversations" as const,
      input: z.object({ title: z.string().optional() }),
      responses: {
        201: z.custom<typeof conversations.$inferSelect>(),
      },
    },
    deleteConversation: {
      method: "DELETE" as const,
      path: "/api/conversations/:id" as const,
      responses: {
        204: z.void(),
      },
    },
    sendMessage: {
      method: "POST" as const,
      path: "/api/conversations/:id/messages" as const,
      input: z.object({ content: z.string() }),
      responses: {
        200: z.void(), // SSE stream
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
