export function readAddParam(href) {
  return new URL(href).searchParams.get('add');
}

export function stripAddParam(href) {
  const url = new URL(href);
  url.searchParams.delete('add');
  return url.toString();
}

export function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
