import { defineConfig } from 'vite';

const policy = [
  "default-src 'none'", "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' blob: data:",
  "connect-src 'self' blob:", "media-src 'self' blob:",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

export default defineConfig({
  base: '/doro-world/',
  build: { sourcemap: false },
  plugins: [{
    name: 'production-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' }];
    },
  }],
});
