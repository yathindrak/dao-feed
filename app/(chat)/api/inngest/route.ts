import { serve } from 'inngest/next';
import { inngest, functions } from '@/lib/inngest';

export const maxDuration = 600;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: Object.values(functions),
});
