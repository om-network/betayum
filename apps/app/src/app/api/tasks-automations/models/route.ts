import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    models: [
      {
        id: 'first-party-automation-builder',
        name: 'First-party automation builder',
      },
    ],
  });
}
