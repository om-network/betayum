import { z } from 'zod';

const controlQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  perPage: z.coerce
    .number()
    .pipe(z.union([z.literal(20), z.literal(50), z.literal(100)]))
    .catch(20),
  name: z.string().trim().max(200).catch(''),
  sortDesc: z.enum(['true', 'false']).catch('false'),
});

export function parseControlQuery(query: Record<string, unknown>) {
  return controlQuery.parse(query);
}
