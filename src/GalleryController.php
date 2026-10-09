<?php

declare(strict_types=1);

namespace Flex\Galleries;

use Flex\Contracts\Http\ResponseFactoryInterface;
use Flex\Http\RequestInput;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final readonly class GalleryController
{
    public function __construct(private ResponseFactoryInterface $responses, private RequestInput $input) {}

    /** @param array<string, string> $arguments */
    public function __invoke(ServerRequestInterface $request, array $arguments = []): ResponseInterface
    {
        $store = new GalleryStore();
        try {
            $id = isset($arguments['id']) ? filter_var($arguments['id'], FILTER_VALIDATE_INT) : null;
            if ($id !== null && (!is_int($id) || $id < 1)) {
                throw new GalleryException('Невалиден идентификатор.', 422);
            }
            $method = $request->getMethod();
            $body = $method === 'GET' ? [] : $this->input->all($request);
            $view = $request->getQueryParams()['view'] ?? 'active';
            if (!is_string($view)) {
                throw new GalleryException('Невалиден изглед.', 422);
            }
            if ($method === 'GET') {
                $result = $id === null
                    ? ['galleries' => $store->index($view)]
                    : ['gallery' => $store->get($id)];
            } elseif ($method === 'DELETE' || ($method === 'POST' && $id !== null)) {
                $action = $arguments['action'] ?? 'trash';
                $store->action($id ?? 0, $action, $body['version'] ?? null);
                $result = ['ok' => true];
            } else {
                $result = ['gallery' => $store->save($body, $id)];
            }
            return $this->responses->json($result, $method === 'POST' && $id === null ? 201 : 200, ['Cache-Control' => 'no-store']);
        } catch (GalleryException $error) {
            return $this->responses->json(['error' => ['message' => $error->getMessage()]], $error->getCode(), ['Cache-Control' => 'no-store']);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            return $this->responses->json(['error' => ['message' => 'Идентификаторът е зает от друга заявка. Опитайте отново.']], 409, ['Cache-Control' => 'no-store']);
        }
    }
}
