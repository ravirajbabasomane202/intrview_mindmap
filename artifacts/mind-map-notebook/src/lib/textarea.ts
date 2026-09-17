export function wrapTextareaSelection(textarea: HTMLTextAreaElement, before: string, after: string = before) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end) || 'text';
  const nextValue = value.slice(0, start) + before + selected + after + value.slice(end);
  return { nextValue, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
}

export function prefixTextareaLine(textarea: HTMLTextAreaElement, prefix: string) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  return { nextValue, selectionStart: start + prefix.length, selectionEnd: textarea.selectionEnd + prefix.length };
}

// --- KaTeX (LaTeX rendering), loaded lazily from CDN so no build changes are needed ---

