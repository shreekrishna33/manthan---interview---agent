import { db } from "../../db";
import { conversations, messages } from "../../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number, userId?: number): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId?: number): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, userId?: number): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number, userId?: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number, userId?: number) {
    let query = db.select().from(conversations).where(eq(conversations.id, id));
    if (userId) {
      query = db.select().from(conversations).where(sql`${conversations.id} = ${id} AND ${conversations.userId} = ${userId}`);
    }
    const [conversation] = await query;
    return conversation;
  },

  async getAllConversations(userId?: number) {
    let query = db.select().from(conversations);
    if (userId) {
      query = db.select().from(conversations).where(eq(conversations.userId, userId));
    }
    return query.orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, userId?: number) {
    const [conversation] = await db.insert(conversations).values({ title, userId: userId || null }).returning();
    return conversation;
  },

  async deleteConversation(id: number, userId?: number) {
    // Only allow deletion if the conversation belongs to the user
    const conversation = await this.getConversation(id, userId);
    if (!conversation) return;

    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};

