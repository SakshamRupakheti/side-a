// Provider IDs, never arbitrary URL fragments, are allowed in constructed covers.
export function youtubeCover(provider: string, id: string) {
  return provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    : "";
}
