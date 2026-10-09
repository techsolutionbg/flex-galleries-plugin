<?php

declare(strict_types=1);

namespace Flex\Galleries;

use Illuminate\Database\Connection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;

final class GalleryStore
{
    private Connection $db;

    public function __construct(?Connection $connection = null)
    {
        $this->db = $connection ?? Model::resolveConnection();
    }

    public function install(): void
    {
        $schema = $this->db->getSchemaBuilder();
        if (!$schema->hasTable('flex_galleries')) {
            $schema->create('flex_galleries', static function (Blueprint $table): void {
                $table->increments('id');
                $table->string('name', 190);
                $table->string('slug', 190)->unique();
                $table->string('status', 16);
                $table->string('design', 16);
                $table->text('settings');
                $table->unsignedInteger('version')->default(1);
                $table->timestamps();
                $table->softDeletes();
            });
        }
        if (!$schema->hasTable('flex_gallery_items')) {
            $schema->create('flex_gallery_items', static function (Blueprint $table): void {
                $table->increments('id');
                $table->unsignedInteger('gallery_id')->index();
                $table->unsignedInteger('media_id')->index();
                $table->unsignedInteger('position');
                foreach (['alt', 'caption', 'description', 'link', 'title'] as $field) {
                    $table->text($field);
                }
            });
        }
    }

    /** @return list<array<string, mixed>> */
    public function index(string $view = 'active'): array
    {
        if (!in_array($view, ['active', 'trash'], true)) {
            throw new GalleryException('Невалиден изглед.', 422);
        }
        $query = $this->db->table('flex_galleries');
        $view === 'trash' ? $query->whereNotNull('deleted_at') : $query->whereNull('deleted_at');
        return $query->orderByDesc('id')->get()->map(function ($row): array {
            $result = $this->record($row);
            $result['item_count'] = $this->db->table('flex_gallery_items')->where('gallery_id', $row->id)->count();
            return $result;
        })->all();
    }

    /** @return array<string, mixed> */
    public function get(int $id, bool $public = false): array
    {
        $row = $this->db->table('flex_galleries')->where('id', $id)->first();
        if ($row === null || ($public && ($row->deleted_at !== null || $row->status !== 'active'))) {
            throw new GalleryException('Галерията не е намерена.', 404);
        }
        $result = $this->record($row);
        $result['items'] = $this->db->table('flex_gallery_items')->where('gallery_id', $id)->orderBy('position')->get()->map(function ($item): array {
            $value = (array) $item;
            $media = $this->db->table('media')->where('id', $item->media_id)->whereNull('deleted_at')->first();
            $value['media_id'] = (int) $item->media_id;
            $value['media'] = $media === null ? null : [
                'id' => (int) $media->id, 'title' => $media->title, 'mime' => $media->mime,
                'alt' => $media->alt, 'width' => $media->width, 'height' => $media->height,
                'url' => '/media-files/' . $media->id . '/original',
                'thumbnail_url' => $media->thumbnail_path ? '/media-files/' . $media->id . '/thumbnail' : null,
            ];
            return $value;
        })->all();
        return $result;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function save(array $input, ?int $id = null): array
    {
        $name = $this->text($input['name'] ?? null, 190, 'Име');
        if ($name === '') {
            throw new GalleryException('Въведете име на галерията.', 422);
        }
        $slug = $this->text($input['slug'] ?? '', 190, 'Идентификатор');
        $generated = $slug === '';
        if ($generated) {
            $latin = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $name);
            $slug = trim(substr((string) preg_replace('/[^a-z0-9]+/', '-', is_string($latin) ? $latin : ''), 0, 190), '-') ?: 'gallery';
        }
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug)) {
            throw new GalleryException('Идентификаторът може да съдържа малки латински букви, цифри и тирета.', 422);
        }
        $status = $input['status'] ?? 'draft';
        $design = $input['design'] ?? 'grid';
        if (!in_array($status, ['active', 'inactive', 'draft'], true) || !in_array($design, ['grid', 'masonry', 'slider'], true)) {
            throw new GalleryException('Невалиден статус или дизайн.', 422);
        }
        $settings = $input['settings'] ?? [];
        if (!is_array($settings)) {
            throw new GalleryException('Невалидни настройки.', 422);
        }
        $normalized = [];
        foreach (['columns' => [1, 6, 3], 'gap' => [0, 48, 16], 'radius' => [0, 32, 8], 'slider_height' => [200, 1600, 600], 'zoom_max' => [2, 5, 3]] as $key => [$min, $max, $default]) {
            $value = filter_var($settings[$key] ?? $default, FILTER_VALIDATE_INT);
            if ($value === false || $value < $min || $value > $max) {
                throw new GalleryException('Невалидна стойност за ' . $key . '.', 422);
            }
            $normalized[$key] = $value;
        }
        $ratio = $settings['ratio'] ?? 'original';
        if (!in_array($ratio, ['original', 'square', 'landscape'], true)) {
            throw new GalleryException('Невалидни пропорции.', 422);
        }
        $normalized['ratio'] = $ratio;
        foreach (['width' => ['section', 'page'], 'fit' => ['contain', 'cover', 'scale-down'], 'height' => ['frame', 'auto', 'screen', 'custom']] as $key => $options) {
            $value = $settings[$key] ?? $options[0];
            if (!in_array($value, $options, true)) throw new GalleryException('Невалидна настройка за ' . $key . '.', 422);
            $normalized[$key] = $value;
        }
        foreach (['captions', 'lightbox', 'zoom'] as $key) {
            $value = $settings[$key] ?? true;
            if (!is_bool($value)) {
                throw new GalleryException('Невалидна настройка за ' . $key . '.', 422);
            }
            $normalized[$key] = $value;
        }
        $designSettings = $settings['design_settings'] ?? [];
        if (!is_array($designSettings)) throw new GalleryException('Невалидни настройки на дизайните.', 422);
        $normalized['design_settings'] = [];
        foreach (['grid', 'masonry', 'slider'] as $type) {
            $overrides = $designSettings[$type] ?? [];
            if (!is_array($overrides)) throw new GalleryException('Невалидни настройки на дизайна.', 422);
            $preset = array_intersect_key($normalized, array_flip(['columns', 'ratio', 'gap', 'fit', 'height', 'slider_height']));
            foreach (['columns' => [1, 6], 'gap' => [0, 48], 'slider_height' => [200, 1600]] as $key => [$min, $max]) {
                $value = filter_var($overrides[$key] ?? $preset[$key], FILTER_VALIDATE_INT);
                if ($value === false || $value < $min || $value > $max) throw new GalleryException('Невалидна стойност за ' . $key . '.', 422);
                $preset[$key] = $value;
            }
            foreach (['ratio' => ['original', 'square', 'landscape'], 'fit' => ['contain', 'cover', 'scale-down'], 'height' => ['frame', 'auto', 'screen', 'custom']] as $key => $options) {
                $value = $overrides[$key] ?? $preset[$key];
                if (!in_array($value, $options, true)) throw new GalleryException('Невалидна настройка за ' . $key . '.', 422);
                $preset[$key] = $value;
            }
            $normalized['design_settings'][$type] = $preset;
        }
        $items = $input['items'] ?? [];
        if (!is_array($items) || !array_is_list($items) || count($items) > 200) {
            throw new GalleryException('Разрешени са до 200 изображения в галерия.', 422);
        }
        $prepared = [];
        $seen = [];
        foreach ($items as $position => $item) {
            if (!is_array($item)) {
                throw new GalleryException('Невалиден елемент.', 422);
            }
            $mediaId = filter_var($item['media_id'] ?? null, FILTER_VALIDATE_INT);
            $media = $mediaId ? $this->db->table('media')->where('id', $mediaId)->whereNull('deleted_at')->first() : null;
            // Existing unavailable images can be retained and skipped publicly until removed/replaced.
            $existing = $id !== null && $mediaId && $this->db->table('flex_gallery_items')->where('gallery_id', $id)->where('media_id', $mediaId)->exists();
            if (($media === null && !$existing) || ($media !== null && !str_starts_with($media->mime, 'image/')) || isset($seen[$mediaId])) {
                throw new GalleryException('Изберете налични изображения без повторения.', 422);
            }
            $seen[$mediaId] = true;
            $values = ['media_id' => $mediaId, 'position' => $position];
            foreach (['alt' => 500, 'caption' => 1000, 'description' => 3000, 'link' => 2000, 'title' => 500] as $field => $max) {
                $default = $field === 'link' ? '' : mb_substr((string) ($media?->{$field} ?? ''), 0, $max);
                $values[$field] = $this->text($item[$field] ?? $default, $max, $field);
            }
            if (!$this->safeUrl($values['link'])) {
                throw new GalleryException('Връзката трябва да е локален адрес или HTTP/HTTPS URL.', 422);
            }
            $prepared[] = $values;
        }
        return $this->db->transaction(function () use ($id, $input, $name, $slug, $generated, $status, $design, $normalized, $prepared): array {
            $version = 1;
            if ($id !== null) {
                $row = $this->locked($id, $input['version'] ?? null);
                if ($row->deleted_at !== null) {
                    throw new GalleryException('Възстановете галерията преди редакция.', 409);
                }
                $version = (int) $row->version + 1;
            }
            $base = $slug;
            $suffix = 2;
            while ($this->db->table('flex_galleries')->where('slug', $slug)->when($id !== null, fn($q) => $q->where('id', '!=', $id))->exists()) {
                if (!$generated) {
                    throw new GalleryException('Идентификаторът вече се използва.', 422);
                }
                $slug = substr($base, 0, 180) . '-' . $suffix++;
            }
            $values = ['name' => $name, 'slug' => $slug, 'status' => $status, 'design' => $design,
                'settings' => json_encode($normalized, JSON_THROW_ON_ERROR), 'version' => $version, 'updated_at' => gmdate('Y-m-d H:i:s')];
            if ($id === null) {
                $id = (int) $this->db->table('flex_galleries')->insertGetId($values + ['created_at' => $values['updated_at']]);
            } else {
                $this->db->table('flex_galleries')->where('id', $id)->update($values);
            }
            $this->db->table('flex_gallery_items')->where('gallery_id', $id)->delete();
            foreach ($prepared as $item) {
                $this->db->table('flex_gallery_items')->insert($item + ['gallery_id' => $id]);
            }
            return $this->get($id);
        });
    }

    public function action(int $id, string $action, mixed $version): void
    {
        $this->db->transaction(function () use ($id, $action, $version): void {
            $row = $this->locked($id, $version);
            if (!in_array($action, ['trash', 'restore', 'force'], true)) {
                throw new GalleryException('Невалидно действие.', 422);
            }
            if ($action === 'force') {
                if ($row->deleted_at === null) {
                    throw new GalleryException('Първо преместете галерията в кошчето.', 409);
                }
                $this->db->table('flex_gallery_items')->where('gallery_id', $id)->delete();
                $this->db->table('flex_galleries')->where('id', $id)->delete();
            } else {
                $this->db->table('flex_galleries')->where('id', $id)->update([
                    'deleted_at' => $action === 'trash' ? gmdate('Y-m-d H:i:s') : null,
                    'version' => (int) $row->version + 1, 'updated_at' => gmdate('Y-m-d H:i:s'),
                ]);
            }
        });
    }

    private function locked(int $id, mixed $version): object
    {
        $row = $this->db->table('flex_galleries')->where('id', $id)->lockForUpdate()->first();
        if ($row === null) {
            throw new GalleryException('Галерията не е намерена.', 404);
        }
        if (filter_var($version, FILTER_VALIDATE_INT) !== (int) $row->version) {
            throw new GalleryException('Галерията е променена в друг таб. Презаредете данните.', 409);
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function record(object $row): array
    {
        $value = (array) $row;
        $value['id'] = (int) $row->id;
        $value['version'] = (int) $row->version;
        $value['settings'] = json_decode($row->settings, true, 512, JSON_THROW_ON_ERROR);
        return $value;
    }

    private function text(mixed $value, int $max, string $label): string
    {
        if (!is_string($value) || mb_strlen($value) > $max) {
            throw new GalleryException('Невалидна стойност за ' . $label . '.', 422);
        }
        return trim($value);
    }

    public function safeUrl(string $url): bool
    {
        if ($url === '') {
            return true;
        }
        if (preg_match('/[\x00-\x20\\\\]/', $url)) {
            return false;
        }
        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return true;
        }
        return filter_var($url, FILTER_VALIDATE_URL) !== false && in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true);
    }
}
