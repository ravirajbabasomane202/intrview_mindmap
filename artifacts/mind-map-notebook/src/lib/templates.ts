import { uid } from './uid';
import { Page } from '../types/canvas';

export function templateObjects(template: string): Page {
  const page: Page = {
    id: uid('page'),
    title: 'Default Page',
    objects: [],
    strokes: [],
    connections: [],
  };

  if (template === 'Mind map') {
    page.objects = [
      { id: uid('shape'), type: 'shape', x: -150, y: -60, width: 300, height: 100, rotation: 0, zIndex: 1, content: 'Central idea', color: '#1f5e60', fill: '#d9ebe3' },
      { id: uid('text'), type: 'text', x: -370, y: 120, width: 220, height: 90, rotation: -2, zIndex: 2, content: 'First branch', color: '#334155', fill: '#f7dfbd' },
      { id: uid('text'), type: 'text', x: 150, y: 120, width: 220, height: 90, rotation: 2, zIndex: 2, content: 'Second branch', color: '#334155', fill: '#d8e4ee' },
    ];
  } else if (template === 'Math study') {
    page.objects = [
      { id: uid('formula'), type: 'formula', x: -180, y: -90, width: 360, height: 90, rotation: 0, zIndex: 1, content: 'a² + b² = c²', color: '#334155', fill: '#d8e4ee' },
      { id: uid('text'), type: 'text', x: -180, y: 75, width: 360, height: 100, rotation: -1, zIndex: 2, content: 'What do I know?\nWhat do I need to prove?', color: '#334155', fill: '#f7dfbd' },
    ];
  }

  return page;
}
