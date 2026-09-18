/** This adapter belongs to the local demo host, never to the shipped component. */
async function read(path, signal) {
  const response = await fetch(`/local-repository/${path}`, { signal });
  if (response.status === 404) {
    throw new Error(
      'This page has no local repository search connection. Open the test1 demo at http://localhost:4599/.',
    );
  }
  if (!response.ok) {
    const message = await response.json().catch(() => null);
    throw new Error(message?.error ?? `Local repository request failed (${response.status}).`);
  }
  return response.json();
}
export const localChildSource = {
  search(query, { signal, cursor }) {
    // The picker accepts names as plain text, not the REST endpoint's query syntax.
    // Match every entered word by prefix, including the final unfinished word.
    const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (query.trim() && !words.length) return Promise.resolve({ results: [] });
    query = words.map((word) => `${word}*`).join(' AND ');
    return read(`search?${new URLSearchParams({ q: query, offset: cursor ?? '0' })}`, signal);
  },
  load(result, { signal }) {
    return read(`artifact?${new URLSearchParams({ id: result.id, type: result.type })}`, signal);
  },
};
