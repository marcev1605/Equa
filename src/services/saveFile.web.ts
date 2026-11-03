/** Web: descarga el archivo directamente en el navegador. */
export async function saveFile(name: string, bytes: Uint8Array, mime: string): Promise<'shared' | 'downloaded'> {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([bytes as any], { type: mime }));
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
