export function consumeBackgroundStream({
  onError,
  stream,
}: {
  onError: (error: unknown) => void;
  stream: ReadableStream<string>;
}): Promise<void> {
  return stream.pipeTo(new WritableStream()).catch(onError);
}
