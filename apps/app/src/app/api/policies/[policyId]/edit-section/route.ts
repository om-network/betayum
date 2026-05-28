import { requireApiOrganizationPermission } from '@/lib/permissions.server';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const maxDuration = 30;

const editSectionSchema = z.object({
  sectionText: z.string().min(1),
  feedback: z.string().min(1),
});

/**
 * Standalone API for editing a specific section of a policy suggestion.
 * This is NOT part of the main chat — it's a focused, single-turn call
 * that takes a section's current proposed text + user feedback and returns
 * only the updated section text.
 */
export async function POST(req: Request) {
  try {
    const permission = await requireApiOrganizationPermission(req, 'policy', 'update');
    if (permission instanceof NextResponse) {
      return permission;
    }

    const parsed = editSectionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing sectionText or feedback' }, { status: 400 });
    }
    const { sectionText, feedback } = parsed.data;

    const result = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: `You are a GRC policy editor. You will receive text from a policy and feedback on how to change it. Return ONLY the updated text. Rules:
- Do not include explanations, preamble, or commentary — just the updated text.
- If the input is a plain sentence or paragraph, return a plain sentence or paragraph. Do NOT add markdown formatting (no ##, no **, no -) unless the input already uses it.
- If the input includes markdown headings (##) or bullet lists (- ), preserve that structure.
- Match the tone and style of the input.`,
      prompt: `Text to edit:\n${sectionText}\n\nInstruction: ${feedback}`,
    });

    return NextResponse.json({ updatedText: result.text.trim() });
  } catch (error) {
    console.error('Edit section error:', error);
    return NextResponse.json({ error: 'Failed to edit section' }, { status: 500 });
  }
}
