<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NormalizeCateringApiResponse
{
    private const BOOLEAN_KEYS = [
        'is_active', 'is_available', 'is_published', 'is_seasonal', 'privacy_consent', 'is_internal',
    ];

    private const INTEGER_KEYS = [
        'id', 'restaurant_id', 'customer_id', 'event_type_id', 'selected_package_id', 'assigned_staff_id',
        'inquiry_id', 'quotation_id', 'food_item_id', 'category_id', 'package_id', 'booking_id', 'user_id',
        'guest_count', 'quantity', 'version', 'sort_order', 'min_guests', 'max_guests', 'min_order_qty',
        'inquiries', 'total_guests', 'totalInquiries', 'newInquiries', 'pendingQuotations',
        'confirmedBookings', 'upcomingEventsCount', 'totalRestaurants', 'publishedRestaurants',
        'totalUsers', 'activeUsers', 'totalBookings',
    ];

    private const DECIMAL_KEYS = [
        'tax_rate', 'service_charge_rate', 'price', 'unit_price', 'line_total', 'estimated_total',
        'subtotal', 'delivery_fee', 'service_charge', 'discount_amount', 'tax_amount', 'grand_total',
        'total_amount', 'deposit_amount', 'amount_paid', 'balance_due', 'amount',
        'default_servings_per_guest', 'value', 'totalContractValue', 'totalVerifiedPaid',
        'totalOutstandingBalance', 'estimatedValue',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($response instanceof JsonResponse) {
            $response->setData($this->normalize($response->getData(true)));
        }

        return $response;
    }

    private function normalize(mixed $value, ?string $key = null): mixed
    {
        if (is_array($value)) {
            foreach ($value as $itemKey => $itemValue) {
                $value[$itemKey] = $this->normalize($itemValue, is_string($itemKey) ? $itemKey : null);
            }

            return $value;
        }
        if ($key !== null && in_array($key, self::BOOLEAN_KEYS, true)) {
            return (bool) $value;
        }
        if ($key !== null && in_array($key, self::INTEGER_KEYS, true) && is_numeric($value)) {
            return (int) $value;
        }
        if ($key !== null && in_array($key, self::DECIMAL_KEYS, true) && is_numeric($value)) {
            return (float) $value;
        }

        return $value;
    }
}
