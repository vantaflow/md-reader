// Entrée navigateur de l'import (docx et HTML vers Markdown) : bundlée par
// esbuild, elle expose mammoth, turndown et son plugin GFM ; la logique de
// conversion vit dans lib/import.js.
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

window.mdrImportLibs = { mammoth, TurndownService, gfm };
