import { renderToStream } from "@react-pdf/renderer";
import type React from "react";

/**
 * Renders a React-PDF element on the server and returns the full PDF as a Node Buffer.
 * Used by the merged-package generator and any other server-side PDF flow.
 *
 * Must run on the Node.js runtime — `@react-pdf/renderer.renderToStream` returns a
 * Node Readable, not a Web stream.
 */
export async function renderReactPdfToBuffer(
  element: React.ReactElement,
): Promise<Buffer> {
  const stream = await renderToStream(
    element as Parameters<typeof renderToStream>[0],
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
