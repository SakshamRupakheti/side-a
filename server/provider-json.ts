// Directory and oEmbed payloads are small. Enforce the limit on decoded bytes,
// including chunked responses whose Content-Length is missing or compressed.
export async function providerJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response");
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256 * 1024) throw new Error("Provider response too large");
      json += decoder.decode(value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    await reader.cancel();
  }
}
