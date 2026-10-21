import test from 'node:test';
import assert from 'node:assert/strict';
import { analisarHTML } from '../src/services/webmotor/parser.js';

test('extrai título, resolve links relativos e lê campos de formulário', () => {
  const html = `
    <html><head><title>Site de teste</title></head>
    <body>
      <a href="/video">Abrir vídeo</a>
      <form action="/processar" method="post">
        <input name="url" value="teste">
        <button type="submit">Processar</button>
      </form>
    </body></html>`;

  const resultado = analisarHTML(html, 'https://exemplo.com/pagina');
  assert.equal(resultado.titulo, 'Site de teste');
  assert.deepEqual(resultado.links[0], {
    texto: 'Abrir vídeo',
    url: 'https://exemplo.com/video',
  });
  assert.equal(resultado.formularios[0].action, 'https://exemplo.com/processar');
  assert.equal(resultado.formularios[0].method, 'POST');
  assert.equal(resultado.formularios[0].campos[0].name, 'url');
});

test('rejeita URL base inválida', () => {
  assert.throws(() => analisarHTML('<p>teste</p>', 'não-é-url'), /urlBase/);
});
