export function applySearchIndexingPolicy(allowIndexing: boolean) {
  let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    document.head.appendChild(robotsMeta);
  }
  robotsMeta.content = allowIndexing
    ? "index, follow"
    : "noindex, nofollow, noarchive";
}
