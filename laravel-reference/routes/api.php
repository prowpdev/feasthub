<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PublicStorefrontController;
use App\Http\Controllers\CateringInquiryController;
use App\Http\Controllers\QuotationController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\CatalogController;

// Public Multi-Tenant Storefront & Customer Workflows
Route::prefix('public')->group(function () {
    Route::get('/restaurants', [PublicStorefrontController::class, 'restaurants']);
    Route::get('/{slug}/storefront', [PublicStorefrontController::class, 'show']);

    Route::middleware('throttle:20,1')->group(function () {
        Route::post('/register-owner', [PublicStorefrontController::class, 'registerOwner']);
        Route::post('/{slug}/inquiries', [CateringInquiryController::class, 'storePublic']);
        Route::get('/{slug}/track', [CateringInquiryController::class, 'trackPublic']);
        Route::post('/{slug}/quotations/{quotationNumber}/respond', [QuotationController::class, 'respondPublic']);
    });
});

// Sanctum Authentication
Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // All Admin Routes Strictly Scoped by $request->user()->restaurant_id (or superadmin ?restaurant_id)
    Route::prefix('admin')->group(function () {
        Route::get('/overview', [CateringInquiryController::class, 'overview']);
        Route::get('/landing-page', [PublicStorefrontController::class, 'adminLandingPage']);
        Route::patch('/landing-page', [PublicStorefrontController::class, 'updateLandingPage']);
        Route::apiResource('services', PublicStorefrontController::class);

        Route::get('/inquiries', [CateringInquiryController::class, 'index']);
        Route::get('/inquiries/export/csv', [CateringInquiryController::class, 'exportCsv']);
        Route::get('/inquiries/{id}', [CateringInquiryController::class, 'show']);
        Route::patch('/inquiries/{id}', [CateringInquiryController::class, 'update']);
        Route::post('/inquiries/{id}/notes', [CateringInquiryController::class, 'addNote']);

        Route::post('/inquiries/{id}/quotations', [QuotationController::class, 'store']);
        Route::post('/quotations/{id}/send', [QuotationController::class, 'send']);
        Route::get('/quotations/{id}/pdf', [QuotationController::class, 'downloadPdf']);

        Route::post('/inquiries/{id}/convert-booking', [BookingController::class, 'convertFromInquiry']);
        Route::get('/bookings', [BookingController::class, 'index']);
        Route::patch('/bookings/{id}', [BookingController::class, 'updateStatus']);
        Route::post('/bookings/{id}/payments', [BookingController::class, 'recordVerifiedPayment']);

        Route::get('/catalog', [CatalogController::class, 'index']);
        Route::apiResource('packages', CatalogController::class);
        Route::apiResource('food-items', CatalogController::class);
    });

    // Platform Superadmin Routes (role:superadmin)
    Route::prefix('superadmin')->middleware('role:superadmin')->group(function () {
        Route::get('/overview', [BookingController::class, 'superadminOverview']);
        Route::get('/restaurants', [PublicStorefrontController::class, 'superadminRestaurants']);
        Route::patch('/restaurants/{id}', [PublicStorefrontController::class, 'superadminUpdateRestaurant']);
        Route::apiResource('users', AuthController::class);
        Route::get('/bookings', [BookingController::class, 'superadminIndex']);
        Route::patch('/bookings/{id}', [BookingController::class, 'superadminUpdateStatus']);
    });
});
