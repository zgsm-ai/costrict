/**
 * Copy text
 * @param text
 */
export function copyText(text: string) {
  const target = document.body;
  const input: HTMLInputElement = document.createElement('input');
  input.setAttribute('readonly', 'readonly');
  input.value = text;
  target.appendChild(input);
  input.select();
  if (document.execCommand('copy'))
    document.execCommand('copy');
  target.removeChild(input);
}