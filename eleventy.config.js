module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  // GitHub Pages: custom domain file, no Jekyll, and a classic favicon at the root
  eleventyConfig.addPassthroughCopy({ 'src/CNAME': 'CNAME', 'src/.nojekyll': '.nojekyll', 'src/assets/img/favicon.ico': 'favicon.ico' });
  eleventyConfig.addPassthroughCopy({
    'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2':
      'assets/fonts/inter-latin-wght-normal.woff2',
  });
  eleventyConfig.addWatchTarget('src/assets/');

  // Tools in one category: {{ tools | inCategory(cat.slug) }}
  eleventyConfig.addFilter('inCategory', (tools, slug) => tools.filter((t) => t.category === slug));
  eleventyConfig.addFilter('bySlug', (list, slug) => list.find((x) => x.slug === slug));
  eleventyConfig.addFilter('where', (list, key, value) => list.filter((x) => x[key] === value));
  eleventyConfig.addFilter('year', () => new Date().getFullYear());
  const BUILD_ID = Date.now().toString(36);
  eleventyConfig.addFilter('buildId', () => BUILD_ID);
  // Display spelling of a format code: WEBP -> WebP
  const LABELS = { WEBP: 'WebP' };
  eleventyConfig.addFilter('fmt', (code) => LABELS[code] || code);
  eleventyConfig.addFilter('toolName', (t) =>
    t.name || `${LABELS[t.from] || t.from} to ${LABELS[t.to] || t.to}`);

  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  };
};
