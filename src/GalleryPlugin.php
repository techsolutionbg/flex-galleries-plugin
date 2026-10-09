<?php

declare(strict_types=1);

namespace Flex\Galleries;

use Flex\Extension\V1\{BootablePluginInterface, PluginContext, PluginInterface};

final class GalleryPlugin implements PluginInterface, BootablePluginInterface
{
    public function install(PluginContext $context): void
    {
        (new GalleryStore())->install();
    }
    public function activate(PluginContext $context): void
    {
        (new GalleryStore())->install();
    }
    public function deactivate(PluginContext $context): void {}

    public function boot(PluginContext $context): void
    {
        $context->admin?->page('galleries', 'Галерии', 'assets/admin.js', true, ['group' => 'content', 'icon' => 'images']);
        $context->routes?->admin(['GET', 'POST'], '/galleries', GalleryController::class, 'index');
        $context->routes?->admin(['GET', 'PUT', 'DELETE'], '/galleries/{id:number}', GalleryController::class, 'gallery');
        $context->routes?->admin('POST', '/galleries/{id:number}/{action:restore}', GalleryController::class, 'restore');
        $context->routes?->admin('DELETE', '/galleries/{id:number}/{action:force}', GalleryController::class, 'force');
        $context->api->addFilter('public.content', static fn(mixed $html): mixed => is_string($html) ? (new GalleryRenderer(new GalleryStore()))->content($html) : $html);
    }
}
