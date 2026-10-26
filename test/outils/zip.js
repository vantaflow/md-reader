// Petit outil de lecture d'archive zip, sans dépendre d'un `unzip` système
// (absent sous Windows). Lancé en Node par les tests :
//   zip.js lister <fichier>           → un nom d'entrée par ligne
//   zip.js lire <fichier> <entrée>    → le contenu brut de l'entrée sur stdout
//   zip.js verifier <fichier>         → code 0 si toutes les entrées se décompressent
const fs = require('fs');
const JSZip = require('jszip');

(async () => {
  const [action, fichier, entree] = process.argv.slice(2);
  const zip = await JSZip.loadAsync(fs.readFileSync(fichier));
  if (action === 'lister') {
    process.stdout.write(Object.keys(zip.files).filter(n => !zip.files[n].dir).join('\n') + '\n');
  } else if (action === 'lire') {
    const f = zip.file(entree);
    if (!f) throw new Error('entrée absente : ' + entree);
    process.stdout.write(await f.async('nodebuffer'));
  } else if (action === 'verifier') {
    for (const n of Object.keys(zip.files)) if (!zip.files[n].dir) await zip.files[n].async('nodebuffer');
  } else {
    throw new Error('action inconnue : ' + action);
  }
})().catch(e => { process.stderr.write(String(e && e.message || e) + '\n'); process.exit(1); });
