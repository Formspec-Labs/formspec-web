export type FormIdResolver = (formUrl: string, version?: string) => string;

export function defaultFormIdResolver(formUrl: string, _version?: string): string {
  const path = pathFor(formUrl);
  const runtimeMatch = /\/runtime\/forms\/([^/?#]+)$/.exec(path);
  if (runtimeMatch?.[1]) {
    return decodeURIComponent(runtimeMatch[1]);
  }
  const lastSegment = path.split('/').filter(Boolean).at(-1);
  if (lastSegment) {
    return decodeURIComponent(lastSegment);
  }
  return encodeURIComponent(formUrl);
}

function pathFor(formUrl: string): string {
  try {
    return new URL(formUrl, 'https://formspec.local').pathname;
  } catch {
    return formUrl;
  }
}
