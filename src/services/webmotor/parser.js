import * as cheerio from 'cheerio';

/**
 * Analisa HTML estático e devolve informações úteis para inspeção de páginas.
 * Não executa JavaScript nem realiza downloads.
 */
export function analisarHTML(html, urlBase) {
  if (typeof html !== 'string') {
    throw new TypeError('html precisa ser uma string');
  }

  let base;
  try {
    base = new URL(urlBase);
  } catch {
    throw new TypeError('urlBase precisa ser uma URL válida');
  }

  const $ = cheerio.load(html);
  const titulo = $('title').first().text().trim();

  const links = $('a[href]')
    .map((_, elemento) => {
      const href = $(elemento).attr('href');
      try {
        return {
          texto: $(elemento).text().trim(),
          url: new URL(href, base).href,
        };
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);

  const formularios = $('form')
    .map((_, elemento) => ({
      action: new URL(
        $(elemento).attr('action') || base.href,
        base
      ).href,
      method: ($(elemento).attr('method') || 'GET').toUpperCase(),
      campos: $(elemento)
        .find('input, select, textarea, button')
        .map((_, campo) => ({
          tag: campo.tagName,
          name: $(campo).attr('name') || '',
          type: $(campo).attr('type') || '',
          value: $(campo).attr('value') || '',
        }))
        .get(),
    }))
    .get();

  return { titulo, links, formularios };
}
