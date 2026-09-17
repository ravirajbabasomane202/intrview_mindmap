import { useEffect, useState } from 'react';

export let katexLoadPromise: Promise<void> | null = null;
export function loadKatex(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).katex) return Promise.resolve();
  if (katexLoadPromise) return katexLoadPromise;
  katexLoadPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return katexLoadPromise;
}

export function useKatexReady() {
  const [ready, setReady] = useState(typeof window !== 'undefined' && !!(window as any).katex);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadKatex().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [ready]);
  return ready;
}

export function renderLatexHtml(content: string, ready: boolean): string | null {
  if (!ready || typeof window === 'undefined' || !(window as any).katex) return null;
  try {
    return (window as any).katex.renderToString(content, { throwOnError: false, displayMode: false });
  } catch {
    return null;
  }
}
