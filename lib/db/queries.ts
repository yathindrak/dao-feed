import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { chat, message, vote, type DBMessage, type Chat, user } from './schema';
// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUserById(userId: string) {
  const [existingUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return existingUser;
}

async function ensureUserExists(userId: string, address: string) {
  try {
    const existingUser = await getUserById(userId);

    if (!existingUser) {
      await db.insert(user).values({
        id: userId,
        email: `${userId}@privy.user`, // Placeholder for now, might need to get this from user in the future
        address,
      });
    }
  } catch (error) {
    console.error('Failed to ensure user exists in database', error);
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  address,
}: {
  id: string;
  userId: string;
  title: string;
  address: string;
}) {
  try {
    await ensureUserExists(userId, address);
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
    });
  } catch (error) {
    console.error('Failed to save chat in database', error);
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  // startingAfter,
  // endingBefore,
}: {
  id: string;
  limit: number;
  // startingAfter: string | null;
  // endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    // if (startingAfter) {
    //   const [selectedChat] = await db
    //     .select()
    //     .from(chat)
    //     .where(eq(chat.id, startingAfter))
    //     .limit(1);

    //   if (!selectedChat) {
    //     throw new Error(`Chat with id ${startingAfter} not found`);
    //   }

    //   filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    // } else if (endingBefore) {
    //   const [selectedChat] = await db
    //     .select()
    //     .from(chat)
    //     .where(eq(chat.id, endingBefore))
    //     .limit(1);

    //   if (!selectedChat) {
    //     throw new Error(`Chat with id ${endingBefore} not found`);
    //   }

    //   filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    // } else {
    filteredChats = await query();
    // }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to get chats by user from database', error);
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database', error);
    throw error;
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    // Ensure each message has valid parts and handle potential duplicates
    const validMessages = messages.map((message) => ({
      ...message,
      parts: message.parts || [], // Ensure parts is never null
      createdAt: message.createdAt || new Date(),
    }));

    return await db.insert(message).values(validMessages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    console.error(
      'Failed to get message count by user id for the last 24 hours from database',
    );
    throw error;
  }
}
