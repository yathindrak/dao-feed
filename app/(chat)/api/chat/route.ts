import {
  appendClientMessage,
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { aiProvider } from '@/lib/ai/providers';
import { cookies } from 'next/headers';
import { PrivyClient } from '@privy-io/server-auth';
import { type NextRequest, NextResponse } from 'next/server';
import { initializeAgent } from '@/lib/ai/agentkit';
import { baseSepolia } from 'viem/chains';

export const maxDuration = 60;
const maxMessagesPerDay = 100;

export async function POST(req: NextRequest) {
  try {
    const headers = req.headers;
    const userAddress = headers.get('x-privy-address');

    const cookieStore = await cookies();
    const userToken = cookieStore.get('privy-token');
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!userToken || !appId || !appSecret) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });
    }

    const privy = new PrivyClient(appId, appSecret);
    const userClaims = await privy.verifyAuthToken(userToken.value);

    const userId = userClaims.userId;

    const body = await req.json();

    const message = body.message;

    // Ensure message has content
    if (!message.content && (!message.parts || message.parts.length === 0)) {
      return new Response('Message content is required', { status: 400 });
    }

    const messageCount = await getMessageCountByUserId({
      id: userId,
      differenceInHours: 24,
    });
    console.log('messageCount', messageCount);

    if (messageCount > maxMessagesPerDay) {
      return new Response(
        'You have exceeded your maximum number of messages for the day! Please try again later.',
        {
          status: 429,
        },
      );
    }

    // First ensure the chat exists
    const chat = await getChatById({ id: body.id });
    console.log('chat', chat);
    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });
      console.log('title', title);

      if (!title) {
        return new Response('Failed to generate chat title', { status: 500 });
      }

      // Create the chat first
      await saveChat({
        id: body.id,
        userId: userId,
        title,
        address: userAddress ?? '',
      });
    } else {
      if (chat.userId !== userId) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const previousMessages = await getMessagesByChatId({ id: body.id });
    console.log({
      previousMessages2: previousMessages.map((m) =>
        m?.parts ? JSON.stringify(m.parts) : 'no parts',
      ),
    });
    console.log({
      message2: message.message,
    });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message: message,
    });
    console.log({
      messages3: messages.map((m) =>
        m?.parts ? JSON.stringify(m.parts) : 'no parts',
      ),
    });

    await saveMessages({
      messages: [
        {
          chatId: body.id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          createdAt: new Date(),
        },
      ],
    });

    const { tools } = await initializeAgent(userAddress ?? undefined);

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: aiProvider.languageModel('chat-model'),
          system: systemPrompt(),
          messages: messages,
          maxSteps: 5,
          experimental_activeTools: [
            'getWeather',
            'SnapshotActionProvider_get_created_proposals',
            'SnapshotActionProvider_get_new_unaddressed_proposals',
            'SnapshotActionProvider_get_addressed_proposals',
          ] as any,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            ...tools,
          },
          onFinish: async ({ response }) => {
            console.log({
              responseMessages: JSON.stringify(response.messages),
            });
            try {
              const assistantId = getTrailingMessageId({
                messages: response.messages.filter(
                  (message) => message.role === 'assistant',
                ),
              });

              if (!assistantId) {
                throw new Error('No assistant message found!');
              }

              const [, assistantMessage] = appendResponseMessages({
                messages: [message],
                responseMessages: response.messages,
              });

              await saveMessages({
                messages: [
                  {
                    id: assistantId,
                    chatId: body.id,
                    role: assistantMessage.role,
                    parts: assistantMessage.parts,
                    createdAt: new Date(),
                  },
                ],
              });
            } catch (_) {
              console.error('Failed to save chat');
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (e) => {
        console.error('Failed to stream text', e);
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });
    }
    return new NextResponse(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const cookieStore = await cookies();
  const userToken = cookieStore.get('privy-token');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!userToken || !appId || !appSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const privy = new PrivyClient(appId, appSecret);
    const userClaims = await privy.verifyAuthToken(userToken.value);
    const user = { userId: userClaims.userId };

    const chat = await getChatById({ id });

    if (chat.userId !== user.userId) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
