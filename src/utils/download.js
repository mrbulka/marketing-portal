/**
 * Trigger a browser download by navigating to the URL.
 * Relies on the server providing proper Content-Disposition headers.
 * Opens in a new tab to avoid leaving the current page.
 */
export function triggerBrowserDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  // No "download" attribute so that Content-Disposition filename from server is respected.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
