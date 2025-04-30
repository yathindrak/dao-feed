import { customProvider } from 'ai';
import { google } from '@ai-sdk/google';

export const aiProvider = customProvider({
  languageModels: {
    'chat-model': google('gemini-2.0-flash'),
    'title-model': google('gemini-2.0-flash'),
  },
});
