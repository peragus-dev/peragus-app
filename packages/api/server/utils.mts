import { ServerResponse } from 'node:http';
// @ts-ignore - ignore import errors during build time
import { StreamToIterable } from '@peragus/shared'; // @ts-ignore

/**
 * Pipe a `ReadableStream` through a Node `ServerResponse` object.
 */
export async function streamJsonResponse(
  stream: ReadableStream,
  response: ServerResponse,
  options?: {
    headers?: Record<string, string>;
    status?: number;
  },
) {
  options ??= {};

  response.writeHead(options.status || 200, {
    ...options.headers,
    'Content-Type': 'text/plain',
    'Transfer-Encoding': 'chunked',
  });

  for await (const chunk of StreamToIterable(stream)) {
    response.write(chunk);
  }

  response.end();
}
