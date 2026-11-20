<?php

use App\Http\Controllers\CateringApiController;
use App\Http\Middleware\NormalizeCateringApiResponse;
use Illuminate\Support\Facades\Route;

$routes = [
    ['GET', 'public/restaurants'],
    ['GET', 'public/{slug}/storefront'],
    ['POST', 'public/register-owner'],
    ['POST', 'public/{slug}/inquiries'],
    ['GET', 'public/{slug}/track'],
    ['POST', 'public/{slug}/quotations/{quotationNumber}/respond'],
    ['POST', 'auth/login'],
    ['GET', 'auth/me'],
    ['POST', 'auth/logout'],
    ['GET', 'admin/overview'],
    ['GET', 'admin/landing-page'],
    ['PATCH', 'admin/landing-page'],
    ['GET', 'admin/services'],
    ['POST', 'admin/services'],
    ['PUT', 'admin/services/{id}', ['id' => '[0-9]+']],
    ['DELETE', 'admin/services/{id}', ['id' => '[0-9]+']],
    ['GET', 'admin/inquiries'],
    ['GET', 'admin/inquiries/export/csv'],
    ['GET', 'admin/inquiries/{id}', ['id' => '[0-9]+']],
    ['PATCH', 'admin/inquiries/{id}', ['id' => '[0-9]+']],
    ['POST', 'admin/inquiries/{id}/notes', ['id' => '[0-9]+']],
    ['POST', 'admin/inquiries/{id}/quotations', ['id' => '[0-9]+']],
    ['POST', 'admin/inquiries/{id}/convert-booking', ['id' => '[0-9]+']],
    ['POST', 'admin/quotations/{id}/send', ['id' => '[0-9]+']],
    ['GET', 'admin/bookings'],
    ['PATCH', 'admin/bookings/{id}', ['id' => '[0-9]+']],
    ['POST', 'admin/bookings/{id}/payments', ['id' => '[0-9]+']],
    ['GET', 'admin/catalog'],
    ['POST', 'admin/packages'],
    ['PUT', 'admin/packages/{id}', ['id' => '[0-9]+']],
    ['DELETE', 'admin/packages/{id}', ['id' => '[0-9]+']],
    ['POST', 'admin/categories'],
    ['POST', 'admin/food-items'],
    ['PUT', 'admin/food-items/{id}', ['id' => '[0-9]+']],
    ['DELETE', 'admin/food-items/{id}', ['id' => '[0-9]+']],
    ['GET', 'admin/notifications'],
    ['POST', 'admin/notifications/reminder'],
    ['PATCH', 'admin/restaurant'],
    ['GET', 'admin/users'],
    ['POST', 'admin/users'],
    ['PATCH', 'admin/users/{id}', ['id' => '[0-9]+']],
    ['DELETE', 'admin/users/{id}', ['id' => '[0-9]+']],
    ['GET', 'superadmin/overview'],
    ['GET', 'superadmin/restaurants'],
    ['PATCH', 'superadmin/restaurants/{id}', ['id' => '[0-9]+']],
    ['GET', 'superadmin/users'],
    ['POST', 'superadmin/users'],
    ['PATCH', 'superadmin/users/{id}', ['id' => '[0-9]+']],
    ['DELETE', 'superadmin/users/{id}', ['id' => '[0-9]+']],
    ['GET', 'superadmin/bookings'],
    ['PATCH', 'superadmin/bookings/{id}', ['id' => '[0-9]+']],
];

Route::middleware(['throttle:120,1', NormalizeCateringApiResponse::class])->group(function () use ($routes): void {
    foreach ($routes as $definition) {
        [$method, $uri] = $definition;
        $constraints = $definition[2] ?? [];
        $route = Route::match([$method], $uri, CateringApiController::class)->defaults('path', $uri);
        if ($constraints) {
            $route->where($constraints);
        }
    }
});
