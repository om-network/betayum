import { describe, expect, it, vi } from 'vitest';
import { consumeBackgroundStream } from './background-stream';

describe(consumeBackgroundStream.name, () => {
  it('consumes the server stream independently of a UI reader', async () => {
    const produced: string[] = [];
    const stream = new ReadableStream<string>({
      start(controller) {
        produced.push('assistant-result');
        controller.enqueue('assistant-result');
        controller.close();
      },
    });
    const onError = vi.fn();

    await consumeBackgroundStream({ onError, stream });

    expect(produced).toEqual(['assistant-result']);
    expect(onError).not.toHaveBeenCalled();
  });
});
