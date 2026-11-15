// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // the live address: used for canonical links, og:url / og:image and the sitemap
  site: 'https://www.notfiguredyet.com',
  trailingSlash: 'ignore',
  server: { port: 4321 },
});
