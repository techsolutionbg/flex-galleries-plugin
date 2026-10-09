<?php

declare(strict_types=1);

// Run only in the development checkout; all gallery writes are rolled back.
$root = dirname(__DIR__, 4);
require $root . '/vendor/autoload.php';
$container = \Flex\Bootstrap::boot($root)->container();
$config = $container->get(\Flex\Contracts\Configuration\ConfigRepositoryInterface::class);
if (($_ENV['APP_ENV'] ?? '') !== 'local') throw new RuntimeException('This smoke test requires APP_ENV=local.');
$container->get(\Flex\Contracts\Http\KernelInterface::class);
$database = $container->get(\Flex\Database\DatabaseManager::class)->connection();
$images = $database->table('media')->whereNull('deleted_at')->where('mime', 'like', 'image/%')->limit(2)->pluck('id')->all();
if ($images === []) throw new RuntimeException('Upload an image before running the smoke test.');
$before = $database->table('flex_galleries')->count();
$database->beginTransaction();
try {
    $store = new \Flex\Galleries\GalleryStore($database);
    $gallery = $store->save(['name' => 'Тест на галериите', 'status' => 'active', 'design' => 'grid', 'items' => array_map(static fn($id): array => ['media_id' => (int) $id, 'caption' => 'Тестов надпис'], $images)]);
    $id = $gallery['id'];
    $page = \Flex\Pages\Page::query()->first() ?? new \Flex\Pages\Page(['title' => 'Тест']);
    $page = clone $page;
    $source = '<p>[gallery id="' . $id . '"]</p><p>[gallery id="' . $id . '" design="masonry"]</p><p>[gallery id="' . $id . '" design="slider"]</p>';
    $page->setAttribute('content', $source);
    $themes = $container->get(\Flex\Themes\ThemeManager::class);
    $html = $themes->renderForTheme($themes->activeTheme(), 'page.twig', ['page' => $page, 'page_settings' => [], 'navigation' => [], 'head_tags' => '', 'menu_html' => [], 'featured_media' => [], 'page_public_path' => 'test']);
    if (substr_count($html, 'data-flex-gallery') !== 3) throw new RuntimeException('The active theme did not render all three galleries.');
    foreach (['grid', 'masonry', 'slider'] as $design) if (!str_contains($html, 'flex-gallery--' . $design)) throw new RuntimeException('Missing design: ' . $design);
    if ($page->getAttribute('content') !== $source) throw new RuntimeException('Rendering modified page content.');
    $store->action($id, 'trash', $gallery['version']);
    if ((new \Flex\Galleries\GalleryRenderer($store))->render($id) !== '') throw new RuntimeException('Trashed gallery is still public.');
    echo "PASS: active plugin, dev database, active theme, three independent designs, unchanged page content and trash visibility.\n";
} finally {
    $database->rollBack();
}
if ($database->table('flex_galleries')->count() !== $before) throw new RuntimeException('Smoke test did not roll back.');
echo "PASS: all smoke-test gallery writes rolled back.\n";
