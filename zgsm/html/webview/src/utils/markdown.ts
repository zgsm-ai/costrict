import { useHighlightBlock } from '@/hooks/useHighlightBlock';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

const mdi = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code: string, language: string) {
        const validLang = !!(language && hljs.getLanguage(language));
        if (validLang) {
            const lang = language ?? '';
            return useHighlightBlock(hljs.highlight(lang, code, true).value, lang);
        }
        return useHighlightBlock(hljs.highlightAuto(code).value, '');
    }
});

mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md', errorColor: ' #cc0000' });

export { mdi };
