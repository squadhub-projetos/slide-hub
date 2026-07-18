/** Extrai arquivos de um evento de colagem (tipagem estrutural — funciona
 * com o ClipboardEvent nativo e com o sintético do React). */
export function filesFromClipboard(event: { clipboardData: DataTransfer }): File[] {
  return [...event.clipboardData.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}
