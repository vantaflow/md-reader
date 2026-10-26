// Entrée navigateur de JSZip (export EPUB) : bundlée par esbuild, elle expose la
// classe au global ; la construction de l'archive vit dans lib/epub.js.
import JSZip from 'jszip';

window.JSZip = JSZip;
