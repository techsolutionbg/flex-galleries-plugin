<?php

declare(strict_types=1);

namespace Flex\Galleries\Tests;

use Flex\Configuration\ConfigurationRepository;
use Flex\Database\DatabaseManager;
use Flex\Extensions\ExtensionApi;
use Flex\Galleries\{GalleryException, GalleryRenderer, GalleryStore};
use Flex\Pages\Page;
use Flex\Themes\ThemeManager;
use Flex\Configuration\ProjectPaths;
use Illuminate\Database\Schema\Blueprint;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../src/GalleryException.php';
require_once __DIR__ . '/../src/GalleryStore.php';
require_once __DIR__ . '/../src/GalleryRenderer.php';
require_once __DIR__ . '/../src/GalleryController.php';

final class GalleryTest extends TestCase
{
    private DatabaseManager $database;
    private GalleryStore $store;

    protected function setUp(): void
    {
        $config = new ConfigurationRepository(['database' => ['default' => 'sqlite', 'connections' => ['sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]]]);
        $this->database = new DatabaseManager($config);
        $this->database->schema()->create('media', static function (Blueprint $table): void {
            $table->increments('id');
            foreach (['title', 'alt', 'mime'] as $name) $table->text($name);
            $table->integer('width'); $table->integer('height');
            $table->text('thumbnail_path')->nullable(); $table->softDeletes();
        });
        $this->database->connection()->table('media')->insert([
            ['id' => 1, 'title' => 'Планина', 'alt' => 'Планина', 'mime' => 'image/png', 'width' => 800, 'height' => 600],
            ['id' => 2, 'title' => 'Море', 'alt' => 'Море', 'mime' => 'image/jpeg', 'width' => 800, 'height' => 600],
            ['id' => 3, 'title' => 'Документ', 'alt' => '', 'mime' => 'application/pdf', 'width' => 0, 'height' => 0],
        ]);
        $this->store = new GalleryStore($this->database->connection());
        $this->store->install(); $this->store->install();
    }

    protected function tearDown(): void { $this->database->disconnect(); }

    private function input(): array
    {
        return ['name' => 'Лятна галерия', 'status' => 'active', 'design' => 'grid',
            'items' => [['media_id' => 1, 'caption' => 'Първо'], ['media_id' => 2, 'caption' => 'Второ']]];
    }

    public function testDesignSettingsAreIndependentAndPreserveLegacyDefaults(): void
    {
        $input = $this->input();
        $input['settings'] = ['columns' => 4, 'gap' => 16, 'design_settings' => ['grid' => ['columns' => 2], 'masonry' => ['columns' => 5], 'slider' => ['height' => 'custom', 'slider_height' => 720]]];
        $gallery = $this->store->save($input);
        $presets = $gallery['settings']['design_settings'];
        self::assertSame(2, $presets['grid']['columns']);
        self::assertSame(5, $presets['masonry']['columns']);
        self::assertSame(720, $presets['slider']['slider_height']);
        self::assertSame(16, $presets['grid']['gap']);
        $gallery['settings']['design_settings']['masonry']['gap'] = 24;
        $saved = $this->store->save($gallery, $gallery['id']);
        self::assertSame(16, $saved['settings']['design_settings']['grid']['gap']);
        self::assertSame(24, $saved['settings']['design_settings']['masonry']['gap']);
        $saved['settings']['design_settings']['slider']['slider_height'] = 10;
        try { $this->store->save($saved, $saved['id']); self::fail('Invalid preset accepted'); }
        catch (GalleryException $error) { self::assertSame(422, $error->getCode()); }
    }

    public function testMediaTextIsCopiedAndEditsRemainLocalToOneGallery(): void
    {
        $this->database->schema()->table('media', static function (Blueprint $table): void {
            $table->text('caption')->default(''); $table->text('description')->default('');
        });
        $original = ['title' => 'Оригинално заглавие', 'alt' => 'Оригинален alt', 'caption' => 'Оригинален надпис', 'description' => 'Оригинално описание'];
        $this->database->connection()->table('media')->where('id', 1)->update($original);
        $input = $this->input(); $input['items'] = [['media_id' => 1]];
        $first = $this->store->save($input);
        $second = $this->store->save(array_replace($input, ['name' => 'Втора галерия']));
        foreach ($original as $key => $text) self::assertSame($text, $first['items'][0][$key]);
        $first['items'][0]['caption'] = 'Надпис само за първата';
        $first['items'][0]['alt'] = '';
        $updated = $this->store->save($first, $first['id']);
        self::assertSame('Надпис само за първата', $updated['items'][0]['caption']);
        self::assertSame('', $updated['items'][0]['alt']);
        $unchanged = $this->store->get($second['id']);
        foreach ($original as $key => $text) {
            self::assertSame($text, $unchanged['items'][0][$key]);
            self::assertSame($text, $this->database->connection()->table('media')->where('id', 1)->value($key));
        }
    }

    public function testJsonApiCreatesReadsUpdatesAndRejectsStaleWrites(): void
    {
        $controller = new \Flex\Galleries\GalleryController(new \Flex\Http\ResponseFactory(new \Nyholm\Psr7\Factory\Psr17Factory()), new \Flex\Http\RequestInput());
        $request = (new \Nyholm\Psr7\ServerRequest('POST', '/admin/plugins/flex/galleries/galleries'))->withParsedBody($this->input());
        $response = $controller($request);
        self::assertSame(201, $response->getStatusCode());
        $gallery = json_decode((string) $response->getBody(), true)['gallery'];
        $arguments = ['id' => (string) $gallery['id']];
        $response = $controller(new \Nyholm\Psr7\ServerRequest('GET', '/admin/plugins/flex/galleries/galleries/' . $gallery['id']), $arguments);
        self::assertSame(200, $response->getStatusCode());
        self::assertCount(2, json_decode((string) $response->getBody(), true)['gallery']['items']);
        $update = (new \Nyholm\Psr7\ServerRequest('PUT', '/admin/plugins/flex/galleries/galleries/' . $gallery['id']))->withParsedBody($this->input() + ['version' => 1]);
        self::assertSame(200, $controller($update, $arguments)->getStatusCode());
        self::assertSame(409, $controller($update, $arguments)->getStatusCode());
        $trash = (new \Nyholm\Psr7\ServerRequest('DELETE', '/admin/plugins/flex/galleries/galleries/' . $gallery['id']))->withParsedBody(['version' => 2]);
        self::assertSame(200, $controller($trash, $arguments)->getStatusCode());
        self::assertCount(1, $this->store->index('trash'));
    }

    public function testCrudReorderingAndOptimisticConcurrency(): void
    {
        $one = $this->store->save($this->input());
        $two = $this->store->save($this->input());
        self::assertSame('latna-galeria', $one['slug']);
        self::assertSame($one['slug'] . '-2', $two['slug']);
        $input = $this->input() + ['version' => $one['version']];
        $input['items'] = array_reverse($input['items']);
        $updated = $this->store->save($input, $one['id']);
        self::assertSame([2, 1], array_column($updated['items'], 'media_id'));
        self::assertSame(2, $updated['version']);
        try { $this->store->save($input, $one['id']); self::fail('Stale save accepted'); }
        catch (GalleryException $error) { self::assertSame(409, $error->getCode()); }
        $this->store->action($one['id'], 'trash', 2);
        self::assertCount(1, $this->store->index('trash'));
        self::assertSame('', (new GalleryRenderer($this->store))->render($one['id']));
        $this->store->action($one['id'], 'restore', 3);
        $this->store->action($one['id'], 'trash', 4);
        $this->store->action($one['id'], 'force', 5);
        self::assertCount(1, $this->store->index());
        self::assertSame(3, $this->database->connection()->table('media')->count());
    }

    public function testUnsafeUrlsInvalidMediaAndDuplicateItemsAreRejected(): void
    {
        foreach (['javascript:alert(1)', '//evil.example', '/\\evil.example', "https://site.test/\nfoo"] as $url) {
            $input = $this->input(); $input['items'][0]['link'] = $url;
            try { $this->store->save($input); self::fail('Unsafe URL accepted'); }
            catch (GalleryException $error) { self::assertSame(422, $error->getCode()); }
        }
        foreach ([3, 999, 1] as $id) {
            $input = $this->input(); $input['items'][1]['media_id'] = $id;
            try { $this->store->save($input); self::fail('Invalid media accepted'); }
            catch (GalleryException $error) { self::assertSame(422, $error->getCode()); }
        }
        self::assertCount(0, $this->store->index());
    }

    public function testMultipleEmbedsOverridesEscapingAndUnavailableImages(): void
    {
        $input = $this->input();
        $input['items'][0]['caption'] = '<script>alert(1)</script>';
        $gallery = $this->store->save($input);
        $id = $gallery['id'];
        $renderer = new GalleryRenderer($this->store);
        $html = $renderer->content('<h2>Заглавие</h2><p>[gallery id="' . $id . '"]</p><p>[gallery id="' . $id . '" design="slider"]</p><code>[gallery id="' . $id . '"]</code>');
        self::assertSame(2, substr_count($html, 'data-flex-gallery'));
        self::assertStringContainsString('flex-gallery--grid', $html);
        self::assertStringContainsString('flex-gallery--slider', $html);
        self::assertStringContainsString('&lt;script&gt;', $html);
        self::assertStringContainsString('<code>[gallery', $html);
        self::assertStringNotContainsString('<p><section', $html);
        $this->database->connection()->table('media')->where('id', 1)->delete();
        self::assertSame(1, substr_count($renderer->render($id), '<figure'));
        $input['version'] = 1; $input['status'] = 'draft';
        $this->store->save($input, $id);
        self::assertSame('', $renderer->render($id));
        self::assertStringNotContainsString('data-flex-gallery', $renderer->content('<p>[gallery id="' . $id . '"]</p>'));
    }

    public function testLightboxZoomSettingsAreStoredRenderedAndValidated(): void
    {
        $input = $this->input();
        $input['settings']['zoom'] = false;
        $input['settings']['zoom_max'] = 4;
        $gallery = $this->store->save($input);
        self::assertFalse($gallery['settings']['zoom']);
        self::assertSame(4, $gallery['settings']['zoom_max']);
        $html = (new GalleryRenderer($this->store))->render($gallery['id']);
        self::assertStringContainsString('data-zoom="0"', $html);
        self::assertStringContainsString('data-zoom-max="4"', $html);
        foreach ([1, 6] as $maximum) {
            $input['settings']['zoom_max'] = $maximum;
            try { $this->store->save($input); self::fail('Invalid zoom maximum accepted'); }
            catch (GalleryException $error) { self::assertSame(422, $error->getCode()); }
        }
    }

    public function testRenderingDoesNotChangeStoredPageContent(): void
    {
        $folder = sys_get_temp_dir() . '/flex-gallery-theme-' . bin2hex(random_bytes(4));
        mkdir($folder . '/themes/test', 0777, true);
        file_put_contents($folder . '/themes/test/index.php', '<?php echo $page->getAttribute("content");');
        $config = new ConfigurationRepository(['paths' => ['themes' => 'themes']]);
        $api = new ExtensionApi();
        $api->addFilter('public.content', static fn($html) => $html . '<b>Галерия</b>');
        $themes = new ThemeManager(new ProjectPaths($folder, $config), $config, null, $api);
        $page = new Page(['content' => '<p>Оригинал</p>']);
        try {
            self::assertSame('<p>Оригинал</p><b>Галерия</b>', $themes->renderForTheme('test', 'page.twig', ['page' => $page]));
            self::assertSame('<p>Оригинал</p>', $page->getAttribute('content'));
        } finally { unlink($folder . '/themes/test/index.php'); rmdir($folder . '/themes/test'); rmdir($folder . '/themes'); rmdir($folder); }
    }
}
