// Entrée navigateur du mode Document : bundlée par esbuild (document-bundle.js,
// ignoré par git). Toute la logique vit dans ./document/ (testable sans DOM).
import { creerEditeurDocument } from './document/editeur.js';
import { analyserMarkdown, serialiserMarkdown } from './document/markdown.js';

window.mdrDocument = { creerEditeurDocument, analyserMarkdown, serialiserMarkdown };
