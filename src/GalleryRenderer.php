<?php

declare(strict_types=1);

namespace Flex\Galleries;

final class GalleryRenderer
{
    public function __construct(private GalleryStore $store) {}

    public function content(string $html): string
    {
        if (!str_contains($html, '[gallery ')) {
            return $html;
        }
        $document = new \DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        try {
            $document->loadHTML('<?xml encoding="UTF-8"><div id="flex-content-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
            $xpath = new \DOMXPath($document);
            $nodes = $xpath->query('//text()[not(ancestor::script or ancestor::style or ancestor::pre or ancestor::code)]');
            $rendered = false;
            foreach (iterator_to_array($nodes ?: []) as $node) {
                $text = $node->nodeValue ?? '';
                if (!preg_match_all('/\[gallery\s+id="([1-9][0-9]*)"(?:\s+design="(grid|masonry|slider)")?\s*\]/', $text, $matches, PREG_OFFSET_CAPTURE)) {
                    continue;
                }
                $fragment = $document->createDocumentFragment();
                $cursor = 0;
                foreach ($matches[0] as $index => [$token, $offset]) {
                    $fragment->appendChild($document->createTextNode(substr($text, $cursor, $offset - $cursor)));
                    $markup = $this->render((int) $matches[1][$index][0], $matches[2][$index][0] ?? '');
                    if ($markup !== '') {
                        $rendered = true;
                        $temporary = new \DOMDocument('1.0', 'UTF-8');
                        $temporary->loadHTML('<?xml encoding="UTF-8"><div id="gallery-markup">' . $markup . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
                        $wrapper = $temporary->getElementById('gallery-markup');
                        if ($wrapper) {
                            foreach (iterator_to_array($wrapper->childNodes) as $child) {
                                $fragment->appendChild($document->importNode($child, true));
                            }
                        }
                    }
                    $cursor = $offset + strlen($token);
                }
                $fragment->appendChild($document->createTextNode(substr($text, $cursor)));
                $parent = $node->parentNode;
                // Quill wraps shortcode-only lines in paragraphs. Replace the paragraph to keep valid HTML.
                if ($parent instanceof \DOMElement && $parent->tagName === 'p' && $parent->childNodes->length === 1 && trim($text) === $matches[0][0][0]) {
                    $parent->parentNode?->replaceChild($fragment, $parent);
                } else {
                    $parent?->replaceChild($fragment, $node);
                }
            }
            $root = $document->getElementById('flex-content-root');
            $result = '';
            if ($root) {
                foreach ($root->childNodes as $child) {
                    $result .= $document->saveHTML($child);
                }
            }
            if ($rendered) {
                $result = '<link rel="stylesheet" href="/extensions/flex/galleries/assets/assets/galleries.css"><script type="module" src="/extensions/flex/galleries/assets/assets/galleries.js"></script>' . $result;
            }
            return $result;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    public function render(int $id, string $override = ''): string
    {
        try {
            $gallery = $this->store->get($id, true);
        } catch (GalleryException) {
            return '';
        }
        $items = array_values(array_filter($gallery['items'], static fn(array $item): bool => is_array($item['media']) && str_starts_with($item['media']['mime'], 'image/')));
        if ($items === []) {
            return '';
        }
        $settings = $gallery['settings'];
        $design = in_array($override, ['grid', 'masonry', 'slider'], true) ? $override : $gallery['design'];
        $settings = array_replace($settings, $settings['design_settings'][$design] ?? []);
        $html = '<section class="flex-gallery flex-gallery--' . $design . '" data-flex-gallery data-width="' . ($settings['width'] ?? 'section') . '" data-lightbox="' . ($settings['lightbox'] ? '1' : '0') . '" data-zoom="' . (($settings['zoom'] ?? true) ? '1' : '0') . '" data-zoom-max="' . (int) ($settings['zoom_max'] ?? 3) . '" aria-label="' . $this->escape($gallery['name']) . '" style="--gallery-columns:' . $settings['columns'] . ';--gallery-gap:' . $settings['gap'] . 'px;--gallery-radius:' . $settings['radius'] . 'px;--gallery-slider-height:' . (int) ($settings['slider_height'] ?? 600) . 'px">';
        $html .= '<div class="flex-gallery-track" data-ratio="' . $settings['ratio'] . '" data-fit="' . ($settings['fit'] ?? 'contain') . '" data-height="' . ($settings['height'] ?? 'frame') . '">';
        foreach ($items as $position => $item) {
            $media = $item['media'];
            $alt = $item['alt'] !== '' ? $item['alt'] : $media['alt'];
            $html .= '<figure class="flex-gallery-item">';
            $tag = $item['link'] !== '' ? 'a' : ($settings['lightbox'] ? 'button' : 'div');
            $attributes = $tag === 'a' ? ' href="' . $this->escape($item['link']) . '"' : ($tag === 'button' ? ' type="button" data-gallery-image aria-label="' . $this->escape('Отвори изображение ' . ($position + 1)) . '"' : '');
            $html .= '<' . $tag . ' class="flex-gallery-image"' . $attributes . ' title="' . $this->escape($item['title']) . '">';
            $html .= '<img src="' . $this->escape($media['url']) . '" alt="' . $this->escape($alt) . '" loading="lazy" decoding="async"';
            if ($media['width'] && $media['height']) {
                $html .= ' width="' . (int) $media['width'] . '" height="' . (int) $media['height'] . '"';
            }
            $html .= '></' . $tag . '>';
            if ($settings['captions'] && ($item['caption'] !== '' || $item['description'] !== '')) {
                $html .= '<figcaption>' . $this->escape($item['caption']) . ($item['description'] !== '' ? '<p>' . $this->escape($item['description']) . '</p>' : '') . '</figcaption>';
            }
            $html .= '</figure>';
        }
        $html .= '</div>';
        if ($design === 'slider') {
            $html .= '<div class="flex-gallery-controls"><button type="button" data-gallery-prev aria-label="Предишно изображение" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><span data-gallery-counter aria-live="polite">1 / ' . count($items) . '</span><button type="button" data-gallery-next aria-label="Следващо изображение"' . (count($items) === 1 ? ' disabled' : '') . '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div><div class="flex-gallery-dots">';
            foreach ($items as $position => $_) {
                $html .= '<button type="button" data-gallery-slide="' . $position . '" aria-label="Изображение ' . ($position + 1) . '" aria-pressed="' . ($position === 0 ? 'true' : 'false') . '">' . ($position + 1) . '</button>';
            }
            $html .= '</div>';
        }
        return $html . '</section>';
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
