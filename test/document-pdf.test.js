// Options PDF liées à la mise en page du mode Document : pied de page et numéros.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pdfOptions } = require('../pdf.js');

test('pied de page : numéros par défaut, texte facultatif échappé', () => {
  const base = pdfOptions({ headerFooter: true });
  assert.match(base.footerTemplate, /pageNumber/);
  const avec = pdfOptions({ headerFooter: true, footerText: 'Société <X> & Cie', pageNumbers: true });
  assert.match(avec.footerTemplate, /Société &lt;X> &amp; Cie — <span class="pageNumber">/);
  const sans = pdfOptions({ headerFooter: true, footerText: 'Seul', pageNumbers: false });
  assert.doesNotMatch(sans.footerTemplate, /pageNumber/);
  assert.match(sans.footerTemplate, />Seul</);
  assert.equal(pdfOptions({}).displayHeaderFooter, false);
});
