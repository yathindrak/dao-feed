import { z } from 'zod';

export const GetProposalsSchema = z
  .object({
    userId: z
      .string()
      .optional()
      .describe(
        "The ID of the user. If not provided, the system will attempt to use the authenticated user's address.",
      ),
    from: z
      .string()
      .optional()
      .describe(
        'The start date of the time range (e.g., YYYY-MM-DD). Defaults to the beginning of the current week if omitted.',
      ),
    to: z
      .string()
      .optional()
      .describe(
        'The end date of the time range (e.g., YYYY-MM-DD). Defaults to the current date if omitted.',
      ),
  })
  .describe(
    'Input schema for getting proposals. All parameters are optional and have sensible defaults.',
  );
