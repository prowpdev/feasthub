<?php

namespace App\Http\Controllers;

use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class CateringApiController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $path = trim((string) $request->route('path'), '/');
        foreach ($request->route()->parameters() as $key => $value) {
            if ($key !== 'path') {
                $path = str_replace('{'.$key.'}', (string) $value, $path);
            }
        }
        $method = $request->method();

        if ($method === 'GET' && $path === 'public/restaurants') {
            return $this->restaurants();
        }

        if ($method === 'GET' && preg_match('#^public/([^/]+)/storefront$#', $path, $matches)) {
            return $this->storefront($matches[1]);
        }

        if ($method === 'POST' && $path === 'public/register-owner') {
            if ($this->isRateLimited($request, 15)) {
                return response()->json(['error' => 'Too many requests. Please wait a moment before trying again.'], 429);
            }

            return $this->registerOwner($request);
        }

        if ($method === 'POST' && preg_match('#^public/([^/]+)/inquiries$#', $path, $matches)) {
            if ($this->isRateLimited($request, 20)) {
                return response()->json(['error' => 'Too many requests. Please wait a moment before trying again.'], 429);
            }

            return $this->createInquiry($request, $matches[1]);
        }

        if ($method === 'GET' && preg_match('#^public/([^/]+)/track$#', $path, $matches)) {
            if ($this->isRateLimited($request, 40)) {
                return response()->json(['error' => 'Too many requests. Please wait a moment before trying again.'], 429);
            }

            return $this->trackInquiry($request, $matches[1]);
        }

        if ($method === 'POST' && preg_match('#^public/([^/]+)/quotations/([^/]+)/respond$#', $path, $matches)) {
            return $this->respondToQuotation($request, $matches[1], $matches[2]);
        }

        if ($method === 'POST' && $path === 'auth/login') {
            return $this->login($request);
        }

        $actor = $this->authenticate($request);
        if ($actor instanceof JsonResponse) {
            return $actor;
        }

        if ($method === 'GET' && $path === 'auth/me') {
            return response()->json(['user' => $this->formatUser($actor)]);
        }

        if ($method === 'POST' && $path === 'auth/logout') {
            DB::table('api_tokens')->where('token_hash', $request->attributes->get('api_token_hash'))->delete();

            return response()->json(['ok' => true]);
        }

        return $this->authenticatedEndpoint($request, $path, $method, $actor);
    }

    private function restaurants(): JsonResponse
    {
        $restaurants = DB::table('restaurants')
            ->where('is_published', true)
            ->orderBy('id')
            ->get()
            ->map(fn (object $row) => $this->booleanFields((array) $row, ['is_published']))
            ->all();

        return response()->json(['restaurants' => $restaurants]);
    }

    private function storefront(string $slug): JsonResponse
    {
        $restaurant = DB::table('restaurants')->where('slug', $slug)->first();
        if (! $restaurant) {
            return response()->json(['error' => 'Restaurant not found'], 404);
        }

        $restaurantId = (int) $restaurant->id;
        $packages = DB::table('catering_packages')->where('restaurant_id', $restaurantId)
            ->orderByDesc('is_seasonal')->orderBy('id')->get()
            ->map(fn (object $row) => $this->formatPackage((array) $row))->all();
        $foodItems = DB::table('food_items')->where('restaurant_id', $restaurantId)
            ->orderBy('category_id')->orderBy('id')->get()
            ->map(fn (object $row) => $this->formatFoodItem((array) $row))->all();
        $services = DB::table('restaurant_services')->where('restaurant_id', $restaurantId)
            ->where('is_available', true)->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn (object $row) => $this->booleanFields((array) $row, ['is_available']))->all();

        return response()->json([
            'restaurant' => $this->booleanFields((array) $restaurant, ['is_published']),
            'eventTypes' => DB::table('event_types')->where('restaurant_id', $restaurantId)->orderBy('sort_order')->get(),
            'packages' => $packages,
            'categories' => DB::table('food_categories')->where('restaurant_id', $restaurantId)->orderBy('sort_order')->get(),
            'foodItems' => $foodItems,
            'services' => $services,
        ]);
    }

    private function registerOwner(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'owner_name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'max:100'],
            'restaurant_name' => ['required', 'string', 'min:2', 'max:120'],
            'slug' => ['nullable', 'string', 'max:60'],
            'tagline' => ['required', 'string', 'min:3', 'max:200'],
            'phone' => ['required', 'string', 'min:6', 'max:40'],
            'address' => ['required', 'string', 'min:5', 'max:300'],
            'brand_color' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'hero_headline' => ['sometimes', 'string', 'min:3', 'max:160'],
            'hero_subheadline' => ['sometimes', 'string', 'min:5', 'max:300'],
            'hero_image_url' => ['sometimes', 'string', 'min:5'],
            'about_title' => ['sometimes', 'string', 'min:2', 'max:140'],
            'about_description' => ['sometimes', 'string', 'min:5', 'max:1000'],
            'starter_services' => ['sometimes', 'array'],
            'starter_services.*.title' => ['required', 'string', 'min:2'],
            'starter_services.*.description' => ['nullable', 'string'],
            'starter_services.*.price_type' => ['nullable', 'in:flat,per_person,included,custom'],
            'starter_services.*.price' => ['nullable', 'numeric', 'min:0'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Please verify your registration details.');
        }

        $data = $validator->validated();
        if (DB::table('users')->whereRaw('LOWER(email) = ?', [Str::lower($data['email'])])->exists()) {
            return response()->json(['error' => 'An account with this email address already exists.'], 409);
        }

        $created = DB::transaction(function () use ($data): array {
            $slug = Str::slug(trim($data['slug'] ?? '') ?: $data['restaurant_name']);
            $slug = Str::limit($slug ?: 'kitchen-'.time(), 60, '');
            if (DB::table('restaurants')->where('slug', $slug)->exists()) {
                $slug = Str::limit($slug, 54, '').'-'.random_int(100, 999);
            }

            $restaurantId = DB::table('restaurants')->insertGetId([
                'slug' => $slug,
                'name' => trim($data['restaurant_name']),
                'tagline' => trim($data['tagline']),
                'brand_color' => $data['brand_color'] ?? '#1B4332',
                'email' => trim($data['email']),
                'phone' => trim($data['phone']),
                'address' => trim($data['address']),
                'logo_text' => trim($data['restaurant_name']),
                'tax_rate' => 8.5,
                'service_charge_rate' => 15,
                'hero_headline' => $data['hero_headline'] ?? 'Make Every Occasion Delicious',
                'hero_subheadline' => $data['hero_subheadline'] ?? 'From intimate family gatherings to grand celebrations, let us take care of the food.',
                'hero_image_url' => $data['hero_image_url'] ?? '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
                'about_title' => $data['about_title'] ?? 'Our Culinary Philosophy',
                'about_description' => $data['about_description'] ?? 'Crafted from scratch for private celebrations, corporate gatherings, and community events.',
                'is_published' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $userId = DB::table('users')->insertGetId([
                'restaurant_id' => $restaurantId,
                'name' => trim($data['owner_name']),
                'email' => trim($data['email']),
                'password' => Hash::make($data['password']),
                'role' => 'owner',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->seedDefaultCatalog($restaurantId, trim($data['restaurant_name']));
            $services = $data['starter_services'] ?? [];
            if ($services) {
                foreach ($services as $index => $service) {
                    DB::table('restaurant_services')->insert([
                        'restaurant_id' => $restaurantId,
                        'title' => trim($service['title']),
                        'description' => trim($service['description'] ?? ''),
                        'price_type' => $service['price_type'] ?? 'flat',
                        'price' => $service['price'] ?? 0,
                        'is_available' => true,
                        'sort_order' => $index + 1,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            } else {
                $this->seedDefaultServices($restaurantId);
            }

            $token = $this->createToken($userId);
            $this->dispatchNotification($restaurantId, 'staff', trim($data['email']), 'owner_registered',
                'Welcome to FeastHub — '.$data['restaurant_name'],
                'Your catering landing page is published and ready to accept quotation inquiries.');
            $this->logAudit($restaurantId, 'restaurant', $restaurantId, 'owner_registered', trim($data['owner_name']),
                'Registered restaurant '.$data['restaurant_name'].' ('.$slug.')');

            return ['restaurant_id' => $restaurantId, 'token' => $token];
        });

        $restaurantId = $created['restaurant_id'];
        $user = DB::table('users')->leftJoin('restaurants', 'restaurants.id', '=', 'users.restaurant_id')
            ->where('users.restaurant_id', $restaurantId)->select('users.*', 'restaurants.name as restaurant_name', 'restaurants.slug as restaurant_slug')->first();

        return response()->json([
            'token' => $created['token'],
            'restaurant' => DB::table('restaurants')->where('id', $restaurantId)->first(),
            'user' => $this->formatUser((array) $user),
        ], 201);
    }

    private function createInquiry(Request $request, string $slug): JsonResponse
    {
        $restaurant = DB::table('restaurants')->where('slug', $slug)->first();
        if (! $restaurant) {
            return response()->json(['error' => 'Restaurant not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'event_type_id' => ['nullable', 'integer'],
            'event_type_name' => ['required', 'string', 'min:2'],
            'event_date' => ['required', 'date'],
            'start_time' => ['required', 'string', 'min:2'],
            'end_time' => ['nullable', 'string'],
            'guest_count' => ['required', 'integer', 'min:10', 'max:5000'],
            'event_venue' => ['required', 'string', 'min:2', 'max:200'],
            'delivery_address' => ['required', 'string', 'min:5', 'max:400'],
            'venue_setting' => ['sometimes', 'in:indoor,outdoor,unspecified'],
            'selected_package_id' => ['nullable', 'integer'],
            'selected_items' => ['sometimes', 'array'],
            'selected_items.*.food_item_id' => ['required', 'integer'],
            'selected_items.*.quantity' => ['required', 'integer', 'min:1'],
            'selected_items.*.notes' => ['nullable', 'string', 'max:300'],
            'selected_items.*.selected_addons' => ['sometimes', 'array'],
            'selected_items.*.selected_addons.*.name' => ['required', 'string'],
            'selected_items.*.selected_addons.*.price' => ['required', 'numeric'],
            'dietary_requirements' => ['nullable', 'string', 'max:600'],
            'food_allergies' => ['nullable', 'string', 'max:600'],
            'special_instructions' => ['nullable', 'string', 'max:1500'],
            'additional_services' => ['sometimes', 'array'],
            'additional_services.*' => ['string'],
            'full_name' => ['required', 'string', 'min:2', 'max:150'],
            'phone' => ['required', 'string', 'min:6', 'max:40'],
            'email' => ['required', 'email'],
            'company_name' => ['nullable', 'string', 'max:150'],
            'preferred_contact' => ['sometimes', 'in:Phone,Email,Messenger'],
            'privacy_consent' => ['accepted'],
            'website_honeypot' => ['nullable', 'string', 'max:0'],
            'captcha_checked' => ['accepted'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Validation failed');
        }
        $data = $validator->validated();
        $items = $data['selected_items'] ?? [];
        if (empty($data['selected_package_id']) && count($items) === 0) {
            return response()->json(['error' => 'Please select a catering package or at least one food item for your inquiry.'], 422);
        }

        $created = DB::transaction(function () use ($data, $items, $restaurant): array {
            $customer = DB::table('customers')
                ->where('restaurant_id', $restaurant->id)
                ->whereRaw('LOWER(email) = ?', [Str::lower($data['email'])])->first();
            $customerId = $customer
                ? (int) $customer->id
                : DB::table('customers')->insertGetId([
                    'restaurant_id' => $restaurant->id,
                    'full_name' => trim($data['full_name']),
                    'email' => trim($data['email']),
                    'phone' => trim($data['phone']),
                    'company_name' => trim($data['company_name'] ?? ''),
                    'preferred_contact' => $data['preferred_contact'] ?? 'Email',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            if ($customer) {
                DB::table('customers')->where('id', $customerId)->update([
                    'full_name' => trim($data['full_name']),
                    'phone' => trim($data['phone']),
                    'company_name' => trim($data['company_name'] ?? ''),
                    'preferred_contact' => $data['preferred_contact'] ?? 'Email',
                    'updated_at' => now(),
                ]);
            }

            $packageName = null;
            $estimate = 0.0;
            if (! empty($data['selected_package_id'])) {
                $package = DB::table('catering_packages')
                    ->where('id', $data['selected_package_id'])
                    ->where('restaurant_id', $restaurant->id)->first();
                if ($package) {
                    $packageName = $package->name;
                    $estimate += $package->pricing_type === 'per_person'
                        ? (float) $package->price * (int) $data['guest_count']
                        : (float) $package->price;
                }
            }

            $resolvedItems = [];
            foreach ($items as $item) {
                $food = DB::table('food_items')
                    ->where('id', $item['food_item_id'])->where('restaurant_id', $restaurant->id)->first();
                if (! $food) {
                    continue;
                }
                $addons = $item['selected_addons'] ?? [];
                $unitPrice = $food->unit_price === null ? null : (float) $food->unit_price + array_sum(array_column($addons, 'price'));
                $lineTotal = $unitPrice === null ? null : $unitPrice * (int) $item['quantity'];
                if ($lineTotal !== null) {
                    $estimate += $lineTotal;
                }
                $addonText = $addons ? 'Add-ons: '.implode(', ', array_column($addons, 'name')) : '';
                $resolvedItems[] = [
                    'food_item_id' => $food->id,
                    'item_name' => $food->name,
                    'quantity' => $item['quantity'],
                    'unit_price' => $unitPrice,
                    'line_total' => $lineTotal,
                    'notes' => implode(' · ', array_filter([$addonText, $item['notes'] ?? ''])),
                ];
            }

            $reference = $this->generateReference('INQ', $restaurant->slug);
            while (DB::table('catering_inquiries')->where('reference_number', $reference)->exists()) {
                $reference = $this->generateReference('INQ', $restaurant->slug);
            }
            $inquiryId = DB::table('catering_inquiries')->insertGetId([
                'restaurant_id' => $restaurant->id,
                'customer_id' => $customerId,
                'reference_number' => $reference,
                'event_type_id' => $data['event_type_id'] ?? null,
                'event_type_name' => $data['event_type_name'],
                'event_date' => $data['event_date'],
                'start_time' => $data['start_time'],
                'end_time' => $data['end_time'] ?? null,
                'guest_count' => $data['guest_count'],
                'event_venue' => $data['event_venue'],
                'delivery_address' => $data['delivery_address'],
                'venue_setting' => $data['venue_setting'] ?? 'unspecified',
                'selected_package_id' => $data['selected_package_id'] ?? null,
                'selected_package_name' => $packageName,
                'dietary_requirements' => $data['dietary_requirements'] ?? '',
                'food_allergies' => $data['food_allergies'] ?? '',
                'special_instructions' => $data['special_instructions'] ?? '',
                'additional_services_json' => json_encode($data['additional_services'] ?? [], JSON_THROW_ON_ERROR),
                'estimated_total' => $estimate > 0 ? round($estimate, 2) : null,
                'status' => 'Request Received',
                'privacy_consent' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($resolvedItems as $item) {
                DB::table('inquiry_items')->insert(['inquiry_id' => $inquiryId] + $item);
            }
            $this->dispatchNotification((int) $restaurant->id, 'customer', $data['email'], 'inquiry_submitted',
                'Catering Inquiry Received: '.$reference.' — '.$restaurant->name,
                'We received your catering request for '.$data['event_date'].' ('.$data['guest_count'].' guests).', $reference);
            $this->dispatchNotification((int) $restaurant->id, 'staff', $restaurant->email, 'new_inquiry',
                'New Catering Inquiry '.$reference,
                $data['full_name'].' requested catering for '.$data['event_type_name'].' at '.$data['event_venue'].'.', $reference);
            $this->logAudit((int) $restaurant->id, 'inquiry', $inquiryId, 'inquiry_submitted', $data['full_name'],
                'Customer submitted inquiry '.$reference.' for '.$data['event_date']);

            return ['reference_number' => $reference, 'estimated_total' => $estimate > 0 ? round($estimate, 2) : null];
        });

        return response()->json($created + [
            'status' => 'Request Received',
            'message' => 'Your quotation inquiry has been submitted. Our catering team will review availability and respond shortly.',
        ], 201);
    }

    private function trackInquiry(Request $request, string $slug): JsonResponse
    {
        $reference = Str::upper(trim((string) $request->query('reference')));
        $contact = Str::lower(trim((string) $request->query('contact')));
        if (! $reference || ! $contact) {
            return response()->json(['error' => 'Please provide both your inquiry reference number and email or phone number.'], 400);
        }
        $restaurant = DB::table('restaurants')->where('slug', $slug)->first();
        if (! $restaurant) {
            return response()->json(['error' => 'Restaurant not found'], 404);
        }
        $inquiry = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.restaurant_id', $restaurant->id)->whereRaw('UPPER(i.reference_number) = ?', [$reference])
            ->select('i.*', 'c.full_name', 'c.email as customer_email', 'c.phone as customer_phone', 'c.company_name', 'c.preferred_contact')
            ->first();
        if (! $inquiry) {
            return response()->json(['error' => 'No inquiry found with that reference number.'], 404);
        }
        $emailMatches = Str::lower($inquiry->customer_email) === $contact;
        $digits = preg_replace('/\D+/', '', $contact);
        $phone = preg_replace('/\D+/', '', $inquiry->customer_phone);
        $phoneMatches = strlen($digits) >= 6 && str_ends_with($phone, substr($digits, -7));
        if (! $emailMatches && ! $phoneMatches) {
            return response()->json(['error' => 'Contact verification failed. Please enter the email address or phone number used on the inquiry.'], 403);
        }

        $inquiry = (array) $inquiry;
        $inquiry['additional_services'] = json_decode($inquiry['additional_services_json'] ?: '[]', true) ?: [];
        unset($inquiry['additional_services_json']);
        $quotation = DB::table('quotations')->where('inquiry_id', $inquiry['id'])
            ->whereIn('status', ['sent', 'accepted', 'declined'])->orderByDesc('version')->orderByDesc('id')->first();
        if ($quotation) {
            $quotation = (array) $quotation;
            $quotation['items'] = DB::table('quotation_items')->where('quotation_id', $quotation['id'])->get();
        }

        return response()->json([
            'restaurant' => DB::table('restaurants')->where('id', $restaurant->id)
                ->select('id', 'slug', 'name', 'email', 'phone', 'address', 'logo_text')->first(),
            'inquiry' => $inquiry,
            'items' => DB::table('inquiry_items')->where('inquiry_id', $inquiry['id'])->get(),
            'quotation' => $quotation,
            'booking' => DB::table('bookings')->where('inquiry_id', $inquiry['id'])->orderByDesc('id')->first(),
        ]);
    }

    private function respondToQuotation(Request $request, string $slug, string $quotationNumber): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'reference' => ['required', 'string'],
            'contact' => ['required', 'string'],
            'decision' => ['required', 'in:accept,decline'],
            'customer_note' => ['nullable', 'string', 'max:2000'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Missing verification details or decision.');
        }
        $data = $validator->validated();
        $restaurant = DB::table('restaurants')->where('slug', $slug)->first();
        if (! $restaurant) {
            return response()->json(['error' => 'Restaurant not found'], 404);
        }
        $quotation = DB::table('quotations as q')->join('catering_inquiries as i', 'i.id', '=', 'q.inquiry_id')
            ->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('q.restaurant_id', $restaurant->id)
            ->whereRaw('UPPER(q.quotation_number) = ?', [Str::upper($quotationNumber)])
            ->whereRaw('UPPER(i.reference_number) = ?', [Str::upper(trim($data['reference']))])
            ->select('q.*', 'i.reference_number', 'i.event_date', 'i.event_venue', 'i.guest_count',
                'i.id as inquiry_id', 'c.full_name', 'c.email as customer_email', 'c.phone as customer_phone')
            ->first();
        if (! $quotation) {
            return response()->json(['error' => 'Quotation not found.'], 404);
        }
        if (! $this->contactMatches($data['contact'], $quotation->customer_email, $quotation->customer_phone)) {
            return response()->json(['error' => 'Verification failed.'], 403);
        }
        if ($quotation->status !== 'sent') {
            return response()->json(['error' => "This quotation is already marked as {$quotation->status}."], 409);
        }

        DB::transaction(function () use ($data, $quotation, $restaurant, $slug): void {
            if ($data['decision'] === 'accept') {
                DB::table('quotations')->where('id', $quotation->id)->update(['status' => 'accepted', 'accepted_at' => now(), 'updated_at' => now()]);
                DB::table('catering_inquiries')->where('id', $quotation->inquiry_id)->update(['status' => 'Confirmed', 'updated_at' => now()]);
                if (! DB::table('bookings')->where('inquiry_id', $quotation->inquiry_id)->exists()) {
                    $items = DB::table('quotation_items')->where('quotation_id', $quotation->id)->get();
                    $summary = $items->map(fn ($item) => "{$item->title} (x{$item->quantity})")->implode(', ');
                    $total = (float) $quotation->grand_total;
                    $deposit = round($total * 0.4, 2);
                    $bookingReference = $this->generateReference('BK', $slug);
                    $bookingId = DB::table('bookings')->insertGetId([
                        'restaurant_id' => $restaurant->id,
                        'inquiry_id' => $quotation->inquiry_id,
                        'quotation_id' => $quotation->id,
                        'booking_reference' => $bookingReference,
                        'customer_name' => $quotation->full_name,
                        'customer_email' => $quotation->customer_email,
                        'customer_phone' => $quotation->customer_phone,
                        'event_date' => $quotation->event_date,
                        'event_venue' => $quotation->event_venue,
                        'guest_count' => $quotation->guest_count,
                        'confirmed_menu_summary' => $summary ?: 'Confirmed Catering Package',
                        'total_amount' => $total,
                        'deposit_amount' => $deposit,
                        'amount_paid' => 0,
                        'balance_due' => $total,
                        'payment_status' => 'Unpaid',
                        'booking_status' => 'Confirmed',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $this->dispatchNotification((int) $restaurant->id, 'customer', $quotation->customer_email, 'booking_confirmed',
                        'Booking Confirmed: '.$bookingReference.' — '.$restaurant->name,
                        'Your event is confirmed. Deposit of $'.number_format($deposit, 2).' is pending verification.', $bookingReference);
                    $this->dispatchNotification((int) $restaurant->id, 'staff', $restaurant->email, 'quotation_accepted',
                        'Quotation Accepted: '.$quotation->quotation_number,
                        $quotation->full_name.' accepted quotation '.$quotation->quotation_number.'.', $bookingReference);
                    $this->logAudit((int) $restaurant->id, 'booking', $bookingId, 'customer_accepted_quotation',
                        $quotation->full_name, 'Customer accepted '.$quotation->quotation_number.'; created booking '.$bookingReference);
                }
            } else {
                DB::table('quotations')->where('id', $quotation->id)->update(['status' => 'declined', 'updated_at' => now()]);
                DB::table('catering_inquiries')->where('id', $quotation->inquiry_id)->update(['status' => 'Under Review', 'updated_at' => now()]);
                if (! empty($data['customer_note'])) {
                    DB::table('inquiry_notes')->insert([
                        'inquiry_id' => $quotation->inquiry_id,
                        'author_name' => $quotation->full_name,
                        'note' => 'Revision request: '.$data['customer_note'],
                        'is_internal' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                $this->dispatchNotification((int) $restaurant->id, 'staff', $restaurant->email, 'quotation_revision_requested',
                    'Quotation Revision Requested: '.$quotation->quotation_number,
                    $quotation->full_name.' requested updates. Note: '.($data['customer_note'] ?? 'No note provided'), $quotation->reference_number);
                $this->logAudit((int) $restaurant->id, 'quotation', (int) $quotation->id, 'quotation_declined',
                    $quotation->full_name, 'Customer requested changes: '.($data['customer_note'] ?? 'None'));
            }
        });

        return response()->json([
            'ok' => true,
            'status' => $data['decision'] === 'accept' ? 'accepted' : 'declined',
            'message' => $data['decision'] === 'accept'
                ? 'Quotation accepted and booking confirmed.'
                : 'Your revision request has been sent to our catering coordinator.',
        ]);
    }

    private function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), ['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Email and password are required.');
        }
        $user = DB::table('users')->whereRaw('LOWER(email) = ?', [Str::lower(trim($request->input('email')))])->first();
        if (! $user || ! Hash::check($request->input('password'), $user->password)) {
            return response()->json(['error' => 'Invalid credentials.'], 401);
        }
        if (! $user->is_active) {
            return response()->json(['error' => 'Your user account has been suspended. Contact a platform superadmin.'], 403);
        }

        $plainToken = $this->createToken((int) $user->id);
        $actor = $this->userRecord((int) $user->id);

        return response()->json(['token' => $plainToken, 'user' => $this->formatUser($actor)]);
    }

    private function authenticate(Request $request): array|JsonResponse
    {
        $authorization = (string) $request->header('Authorization', '');
        $plainToken = preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches) ? trim($matches[1]) : '';
        if ($plainToken === '') {
            return response()->json(['error' => 'Authentication required'], 401);
        }
        $hash = hash('sha256', $plainToken);
        $token = DB::table('api_tokens')->where('token_hash', $hash)->first();
        if (! $token || now()->greaterThanOrEqualTo($token->expires_at)) {
            if ($token) {
                DB::table('api_tokens')->where('id', $token->id)->delete();
            }

            return response()->json(['error' => 'Session expired, invalid, or suspended'], 401);
        }
        $actor = $this->userRecord((int) $token->user_id);
        if (! $actor || ! $actor['is_active']) {
            DB::table('api_tokens')->where('id', $token->id)->delete();

            return response()->json(['error' => 'Session expired, invalid, or suspended'], 401);
        }
        $request->attributes->set('api_token_hash', $hash);

        return $actor;
    }

    private function userRecord(int $userId): ?array
    {
        $row = DB::table('users')->leftJoin('restaurants', 'restaurants.id', '=', 'users.restaurant_id')
            ->where('users.id', $userId)
            ->select('users.id', 'users.restaurant_id', 'users.name', 'users.email', 'users.role', 'users.is_active',
                'restaurants.name as restaurant_name', 'restaurants.slug as restaurant_slug')
            ->first();

        return $row ? (array) $row : null;
    }

    private function formatUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'restaurant_id' => $user['restaurant_id'] === null ? null : (int) $user['restaurant_id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'is_active' => (bool) $user['is_active'],
            'restaurant_name' => $user['restaurant_name'] ?? null,
            'restaurant_slug' => $user['restaurant_slug'] ?? null,
        ];
    }

    private function createToken(int $userId): string
    {
        $plainToken = bin2hex(random_bytes(32));
        DB::table('api_tokens')->insert([
            'user_id' => $userId,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addDays(7),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $plainToken;
    }

    private function authenticatedEndpoint(Request $request, string $path, string $method, array $actor): Response
    {
        if (str_starts_with($path, 'admin/')) {
            $restaurantId = $this->tenantId($request, $actor);
            if ($restaurantId instanceof JsonResponse) {
                return $restaurantId;
            }

            if ($method === 'GET' && $path === 'admin/overview') {
                return $this->adminOverview($restaurantId);
            }
            if (in_array($path, ['admin/landing-page', 'admin/services'], true)) {
                return $this->adminLandingOrServices($request, $path, $method, $restaurantId, $actor);
            }
            if (preg_match('#^admin/services/(\d+)$#', $path, $m)) {
                return $this->adminServiceMutation($request, $method, $restaurantId, (int) $m[1], $actor);
            }
            if ($method === 'GET' && $path === 'admin/inquiries/export/csv') {
                return $this->adminExportInquiries($restaurantId, $actor);
            }
            if ($path === 'admin/inquiries' && $method === 'GET') {
                return $this->adminInquiries($request, $restaurantId);
            }
            if (preg_match('#^admin/inquiries/(\d+)/notes$#', $path, $m) && $method === 'POST') {
                return $this->adminAddInquiryNote($request, $restaurantId, (int) $m[1], $actor);
            }
            if (preg_match('#^admin/inquiries/(\d+)/quotations$#', $path, $m) && $method === 'POST') {
                return $this->adminCreateQuotation($request, $restaurantId, (int) $m[1], $actor);
            }
            if (preg_match('#^admin/inquiries/(\d+)/convert-booking$#', $path, $m) && $method === 'POST') {
                return $this->adminConvertBooking($request, $restaurantId, (int) $m[1], $actor);
            }
            if (preg_match('#^admin/inquiries/(\d+)$#', $path, $m)) {
                return $this->adminInquiry($request, $method, $restaurantId, (int) $m[1], $actor);
            }
            if (preg_match('#^admin/quotations/(\d+)/send$#', $path, $m) && $method === 'POST') {
                return $this->adminSendQuotation($restaurantId, (int) $m[1], $actor);
            }
            if ($path === 'admin/bookings' && $method === 'GET') {
                return $this->adminBookings($restaurantId);
            }
            if (preg_match('#^admin/bookings/(\d+)/payments$#', $path, $m) && $method === 'POST') {
                return $this->adminRecordPayment($request, $restaurantId, (int) $m[1], $actor);
            }
            if (preg_match('#^admin/bookings/(\d+)$#', $path, $m) && $method === 'PATCH') {
                return $this->adminUpdateBooking($request, $restaurantId, (int) $m[1], $actor);
            }
            if ($path === 'admin/catalog' && $method === 'GET') {
                return $this->adminCatalog($restaurantId);
            }
            if ($path === 'admin/packages' && $method === 'POST') {
                return $this->adminPackageMutation($request, 'create', $restaurantId, null, $actor);
            }
            if (preg_match('#^admin/packages/(\d+)$#', $path, $m)) {
                return $this->adminPackageMutation($request, $method === 'PUT' ? 'update' : 'delete', $restaurantId, (int) $m[1], $actor);
            }
            if ($path === 'admin/categories' && $method === 'POST') {
                return $this->adminCreateCategory($request, $restaurantId);
            }
            if ($path === 'admin/food-items' && $method === 'POST') {
                return $this->adminFoodMutation($request, 'create', $restaurantId, null, $actor);
            }
            if (preg_match('#^admin/food-items/(\d+)$#', $path, $m)) {
                return $this->adminFoodMutation($request, $method === 'PUT' ? 'update' : 'delete', $restaurantId, (int) $m[1], $actor);
            }
            if ($path === 'admin/notifications' && $method === 'GET') {
                return $this->adminNotifications($restaurantId);
            }
            if ($path === 'admin/notifications/reminder' && $method === 'POST') {
                return $this->adminReminder($request, $restaurantId);
            }
            if ($path === 'admin/restaurant' && $method === 'PATCH') {
                return $this->adminUpdateRestaurant($request, $restaurantId, $actor);
            }
            if ($path === 'admin/users' && in_array($method, ['GET', 'POST'], true)) {
                return $this->adminUsers($request, $method, $restaurantId, $actor);
            }
            if (preg_match('#^admin/users/(\d+)$#', $path, $m)) {
                return $this->adminUserMutation($request, $method, $restaurantId, (int) $m[1], $actor);
            }
        }

        if (str_starts_with($path, 'superadmin/')) {
            if ($actor['role'] !== 'superadmin') {
                return response()->json(['error' => 'Superadmin privileges required.'], 403);
            }
            if ($path === 'superadmin/overview' && $method === 'GET') {
                return $this->superadminOverview();
            }
            if ($path === 'superadmin/restaurants' && $method === 'GET') {
                return $this->superadminRestaurants();
            }
            if (preg_match('#^superadmin/restaurants/(\d+)$#', $path, $m) && $method === 'PATCH') {
                return $this->superadminUpdateRestaurant($request, (int) $m[1], $actor);
            }
            if ($path === 'superadmin/users' && $method === 'GET') {
                return $this->superadminUsers($request);
            }
            if ($path === 'superadmin/users' && $method === 'POST') {
                return $this->superadminCreateUser($request, $actor);
            }
            if (preg_match('#^superadmin/users/(\d+)$#', $path, $m)) {
                return $this->superadminUserMutation($request, $method, (int) $m[1], $actor);
            }
            if ($path === 'superadmin/bookings' && $method === 'GET') {
                return $this->superadminBookings($request);
            }
            if (preg_match('#^superadmin/bookings/(\d+)$#', $path, $m) && $method === 'PATCH') {
                return $this->superadminUpdateBooking($request, (int) $m[1], $actor);
            }
        }

        return response()->json(['error' => 'Endpoint not found'], 404);
    }

    private function tenantId(Request $request, array $actor): int|JsonResponse
    {
        if ($actor['role'] === 'superadmin') {
            $id = (int) ($request->query('restaurant_id') ?: $request->input('restaurant_id', 0));
            if ($id > 0 && DB::table('restaurants')->where('id', $id)->exists()) {
                return $id;
            }

            return response()->json(['error' => 'Select a target restaurant tenant to perform tenant-level operations.'], 403);
        }
        if (empty($actor['restaurant_id'])) {
            return response()->json(['error' => 'User is not assigned to a restaurant tenant.'], 403);
        }

        return (int) $actor['restaurant_id'];
    }

    private function adminOverview(int $restaurantId): JsonResponse
    {
        $count = fn (string $table, ?string $column = null, ?string $value = null) => DB::table($table)
            ->where('restaurant_id', $restaurantId)
            ->when($column !== null, fn (Builder $query) => $query->where($column, $value))
            ->count();
        $upcoming = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.restaurant_id', $restaurantId)->whereNotIn('i.status', ['Cancelled', 'Completed'])
            ->orderBy('i.event_date')->limit(6)
            ->select('i.id', 'i.reference_number', 'i.event_type_name', 'i.event_date', 'i.start_time',
                'i.guest_count', 'i.event_venue', 'i.status', 'c.full_name as customer_name')->get();
        $stats = DB::table('catering_inquiries')->where('restaurant_id', $restaurantId)
            ->selectRaw('SUBSTR(event_date, 1, 7) as month, COUNT(*) as inquiries, COALESCE(SUM(guest_count), 0) as total_guests, COALESCE(SUM(estimated_total), 0) as value')
            ->groupBy('month')->orderBy('month')->limit(8)->get();
        $quoted = (float) DB::table('quotations')->where('restaurant_id', $restaurantId)
            ->whereIn('status', ['sent', 'accepted'])->sum('grand_total');
        $estimated = (float) DB::table('catering_inquiries')->where('restaurant_id', $restaurantId)
            ->where('status', '!=', 'Cancelled')->sum('estimated_total');
        $restaurant = DB::table('restaurants')->where('id', $restaurantId)->first();

        return response()->json([
            'restaurant' => $this->booleanFields((array) $restaurant, ['is_published']),
            'staff' => DB::table('users')->where('restaurant_id', $restaurantId)
                ->select('id', 'name', 'email', 'role', 'is_active')->orderBy('id')->get()
                ->map(fn ($row) => $this->booleanFields((array) $row, ['is_active'])),
            'metrics' => [
                'totalInquiries' => $count('catering_inquiries'),
                'newInquiries' => $count('catering_inquiries', 'status', 'Request Received'),
                'pendingQuotations' => DB::table('catering_inquiries')->where('restaurant_id', $restaurantId)
                    ->whereIn('status', ['Under Review', 'Quotation Sent', 'Awaiting Customer Confirmation'])->count(),
                'confirmedBookings' => DB::table('bookings')->where('restaurant_id', $restaurantId)
                    ->whereIn('booking_status', ['Confirmed', 'In Preparation'])->count(),
                'upcomingEventsCount' => $upcoming->count(),
                'estimatedValue' => round($quoted ?: $estimated, 2),
            ],
            'upcomingEvents' => $upcoming,
            'monthlyStats' => $stats,
        ]);
    }

    private function adminLandingOrServices(Request $request, string $path, string $method, int $restaurantId, array $actor): JsonResponse
    {
        if ($path === 'admin/landing-page' && $method === 'GET') {
            return response()->json([
                'restaurant' => $this->booleanFields((array) DB::table('restaurants')->where('id', $restaurantId)->first(), ['is_published']),
                'services' => DB::table('restaurant_services')->where('restaurant_id', $restaurantId)
                    ->orderBy('sort_order')->orderBy('id')->get()->map(fn ($row) => $this->booleanFields((array) $row, ['is_available'])),
            ]);
        }
        if ($path === 'admin/services' && $method === 'GET') {
            return response()->json([
                'services' => DB::table('restaurant_services')->where('restaurant_id', $restaurantId)
                    ->orderBy('sort_order')->orderBy('id')->get()->map(fn ($row) => $this->booleanFields((array) $row, ['is_available'])),
            ]);
        }

        if ($actor['role'] === 'staff') {
            return response()->json(['error' => 'Only owners, managers, or superadmins can edit landing pages and services.'], 403);
        }
        if ($path === 'admin/landing-page' && $method === 'PATCH') {
            $fields = ['name', 'tagline', 'brand_color', 'email', 'phone', 'address', 'hero_headline',
                'hero_subheadline', 'hero_image_url', 'about_title', 'about_description',
                'cta_primary_text', 'cta_secondary_text'];
            $updates = $request->only($fields);
            if ($request->has('is_published')) {
                $updates['is_published'] = $request->boolean('is_published');
            }
            $updates['updated_at'] = now();
            DB::table('restaurants')->where('id', $restaurantId)->update($updates);
            $this->logAudit($restaurantId, 'restaurant', $restaurantId, 'landing_page_updated', $actor['name'],
                'Updated landing page configuration');

            return response()->json(['ok' => true]);
        }
        if ($path === 'admin/services' && $method === 'POST') {
            $validator = Validator::make($request->all(), [
                'title' => ['required', 'string', 'min:1', 'max:255'],
                'description' => ['nullable', 'string'],
                'price_type' => ['sometimes', 'in:flat,per_person,included,custom'],
                'price' => ['sometimes', 'numeric', 'min:0'],
                'is_available' => ['sometimes', 'boolean'],
                'sort_order' => ['sometimes', 'integer'],
            ]);
            if ($validator->fails()) {
                return $this->validationError($validator, 'Service title is required.');
            }
            $data = $validator->validated();
            $id = DB::table('restaurant_services')->insertGetId([
                'restaurant_id' => $restaurantId,
                'title' => trim($data['title']),
                'description' => trim($data['description'] ?? ''),
                'price_type' => $data['price_type'] ?? 'flat',
                'price' => $data['price'] ?? 0,
                'is_available' => $data['is_available'] ?? true,
                'sort_order' => $data['sort_order'] ?? 10,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->logAudit($restaurantId, 'service', $id, 'service_created', $actor['name'], 'Added service: '.$data['title']);

            return response()->json(['id' => $id], 201);
        }

        return response()->json(['error' => 'Endpoint not found'], 404);
    }

    private function adminServiceMutation(Request $request, string $method, int $restaurantId, int $id, array $actor): JsonResponse
    {
        if ($actor['role'] === 'staff') {
            return response()->json(['error' => 'Insufficient permissions.'], 403);
        }
        $service = DB::table('restaurant_services')->where('id', $id)->where('restaurant_id', $restaurantId)->first();
        if (! $service) {
            return response()->json(['error' => 'Service not found'], 404);
        }
        if ($method === 'DELETE') {
            DB::table('restaurant_services')->where('id', $id)->delete();
            $this->logAudit($restaurantId, 'service', $id, 'service_deleted', $actor['name'], 'Removed service #'.$id);

            return response()->json(['ok' => true]);
        }
        if ($method !== 'PUT') {
            return response()->json(['error' => 'Method not allowed'], 405);
        }
        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string'],
            'price_type' => ['sometimes', 'in:flat,per_person,included,custom'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'is_available' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid service details.');
        }
        $data = $validator->validated();
        DB::table('restaurant_services')->where('id', $id)->update([
            'title' => trim($data['title']),
            'description' => trim($data['description'] ?? ''),
            'price_type' => $data['price_type'] ?? 'flat',
            'price' => $data['price'] ?? 0,
            'is_available' => $data['is_available'] ?? true,
            'updated_at' => now(),
        ]);
        $this->logAudit($restaurantId, 'service', $id, 'service_updated', $actor['name'], 'Updated service: '.$data['title']);

        return response()->json(['ok' => true]);
    }

    private function adminInquiries(Request $request, int $restaurantId): JsonResponse
    {
        $query = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.restaurant_id', $restaurantId)
            ->select('i.*', 'c.full_name as customer_name', 'c.email as customer_email', 'c.phone as customer_phone', 'c.company_name', 'c.preferred_contact');
        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('i.status', $request->query('status'));
        }
        if ($request->filled('search')) {
            $search = '%'.Str::lower(trim($request->query('search'))).'%';
            $query->where(function (Builder $builder) use ($search): void {
                $builder->whereRaw('LOWER(i.reference_number) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(c.full_name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(c.email) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(i.event_venue) LIKE ?', [$search]);
            });
        }
        $rows = $query->orderByDesc('i.created_at')->orderByDesc('i.id')->get()
            ->map(fn ($row) => $this->formatInquiry((array) $row));

        return response()->json(['inquiries' => $rows]);
    }

    private function adminExportInquiries(int $restaurantId, array $actor): Response
    {
        $rows = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.restaurant_id', $restaurantId)
            ->orderByDesc('i.created_at')
            ->select('i.reference_number', 'c.full_name', 'c.email', 'c.phone', 'i.event_type_name',
                'i.event_date', 'i.guest_count', 'i.event_venue', 'i.status', 'i.estimated_total', 'i.created_at')->get();
        $headers = ['Reference', 'Customer', 'Email', 'Phone', 'Event Type', 'Event Date', 'Guests', 'Venue', 'Status', 'Estimated Total', 'Submitted At'];
        $lines = [$this->csvLine($headers)];
        foreach ($rows as $row) {
            $lines[] = $this->csvLine([
                $row->reference_number, $row->full_name, $row->email, $row->phone, $row->event_type_name,
                $row->event_date, $row->guest_count, $row->event_venue, $row->status, $row->estimated_total, $row->created_at,
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="catering-inquiries-'.($actor['restaurant_slug'] ?: 'tenant').'.csv"',
        ]);
    }

    private function adminInquiry(Request $request, string $method, int $restaurantId, int $id, array $actor): JsonResponse
    {
        $inquiry = $this->inquiryRecord($restaurantId, $id);
        if (! $inquiry) {
            return response()->json(['error' => 'Inquiry not found'], 404);
        }
        if ($method === 'GET') {
            $quotations = DB::table('quotations')->where('inquiry_id', $id)->orderByDesc('version')->orderByDesc('id')->get();
            $quotations = $quotations->map(function ($quote) {
                return array_merge((array) $quote, [
                    'items' => DB::table('quotation_items')->where('quotation_id', $quote->id)->get(),
                ]);
            });

            return response()->json([
                'inquiry' => $this->formatInquiry($inquiry),
                'items' => DB::table('inquiry_items')->where('inquiry_id', $id)->get(),
                'notes' => DB::table('inquiry_notes')->where('inquiry_id', $id)->orderByDesc('created_at')->get(),
                'quotations' => $quotations,
                'booking' => DB::table('bookings')->where('inquiry_id', $id)->first(),
            ]);
        }
        if ($method !== 'PATCH') {
            return response()->json(['error' => 'Method not allowed'], 405);
        }
        $validator = Validator::make($request->all(), [
            'status' => ['sometimes', 'in:Request Received,Under Review,Quotation Sent,Awaiting Customer Confirmation,Confirmed,Completed,Cancelled'],
            'assigned_staff_id' => ['sometimes', 'nullable', 'integer'],
            'guest_count' => ['sometimes', 'integer', 'min:1'],
            'event_date' => ['sometimes', 'date'],
            'start_time' => ['sometimes', 'string'],
            'event_venue' => ['sometimes', 'string'],
            'delivery_address' => ['sometimes', 'string'],
            'special_instructions' => ['sometimes', 'nullable', 'string'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid inquiry details.');
        }
        $data = $validator->validated();
        $updates = array_intersect_key($data, array_flip([
            'status', 'guest_count', 'event_date', 'start_time', 'event_venue', 'delivery_address', 'special_instructions',
        ]));
        if (array_key_exists('assigned_staff_id', $data)) {
            $staff = null;
            if ($data['assigned_staff_id']) {
                $staff = DB::table('users')->where('id', $data['assigned_staff_id'])->where('restaurant_id', $restaurantId)->first();
                if (! $staff) {
                    return response()->json(['error' => 'Assigned staff member not found'], 422);
                }
            }
            $updates['assigned_staff_id'] = $staff?->id;
            $updates['assigned_staff_name'] = $staff?->name;
        }
        $updates['updated_at'] = now();
        DB::table('catering_inquiries')->where('id', $id)->update($updates);
        $action = isset($data['status']) && $data['status'] !== $inquiry['status'] ? 'status_changed' : 'inquiry_updated';
        $this->logAudit($restaurantId, 'inquiry', $id, $action, $actor['name'], 'Updated inquiry '.$inquiry['reference_number']);

        return response()->json(['ok' => true]);
    }

    private function adminAddInquiryNote(Request $request, int $restaurantId, int $id, array $actor): JsonResponse
    {
        $note = trim((string) $request->input('note'));
        if ($note === '') {
            return response()->json(['error' => 'Note text is required'], 400);
        }
        $inquiry = DB::table('catering_inquiries')->where('id', $id)->where('restaurant_id', $restaurantId)->first();
        if (! $inquiry) {
            return response()->json(['error' => 'Inquiry not found'], 404);
        }
        $noteId = DB::table('inquiry_notes')->insertGetId([
            'inquiry_id' => $id,
            'user_id' => $actor['id'],
            'author_name' => $actor['name'],
            'note' => $note,
            'is_internal' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->logAudit($restaurantId, 'inquiry', $id, 'note_added', $actor['name'], 'Added internal note to '.$inquiry->reference_number);

        return response()->json(['id' => $noteId], 201);
    }

    private function formatInquiry(array $row): array
    {
        $row['additional_services'] = json_decode($row['additional_services_json'] ?? '[]', true) ?: [];
        unset($row['additional_services_json']);

        return $row;
    }

    private function inquiryRecord(int $restaurantId, int $id): ?array
    {
        $row = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.id', $id)->where('i.restaurant_id', $restaurantId)
            ->select('i.*', 'c.full_name as customer_name', 'c.email as customer_email', 'c.phone as customer_phone',
                'c.company_name', 'c.preferred_contact')->first();

        return $row ? (array) $row : null;
    }

    private function csvLine(array $values): string
    {
        return implode(',', array_map(fn ($value) => '"'.str_replace('"', '""', (string) ($value ?? '')).'"', $values));
    }

    private function adminCreateQuotation(Request $request, int $restaurantId, int $inquiryId, array $actor): JsonResponse
    {
        $inquiry = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.id', $inquiryId)->where('i.restaurant_id', $restaurantId)
            ->select('i.*', 'c.full_name', 'c.email as customer_email')->first();
        if (! $inquiry) {
            return response()->json(['error' => 'Inquiry not found'], 404);
        }
        $validator = Validator::make($request->all(), [
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_type' => ['sometimes', 'in:package,food_item,service,custom'],
            'items.*.title' => ['required', 'string', 'min:1'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'delivery_fee' => ['sometimes', 'numeric', 'min:0'],
            'service_charge' => ['sometimes', 'numeric', 'min:0'],
            'discount_amount' => ['sometimes', 'numeric', 'min:0'],
            'tax_rate' => ['sometimes', 'numeric', 'min:0', 'max:50'],
            'payment_terms' => ['required', 'string', 'min:3'],
            'terms_conditions' => ['required', 'string', 'min:3'],
            'valid_until' => ['required', 'date'],
            'send_immediately' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid quotation data');
        }
        $data = $validator->validated();
        $subtotal = collect($data['items'])->sum(fn ($item) => $item['quantity'] * $item['unit_price']);
        $delivery = (float) ($data['delivery_fee'] ?? 0);
        $serviceCharge = (float) ($data['service_charge'] ?? 0);
        $discount = (float) ($data['discount_amount'] ?? 0);
        $taxRate = (float) ($data['tax_rate'] ?? 8.5);
        $taxAmount = round(max(0, $subtotal + $delivery + $serviceCharge - $discount) * $taxRate / 100, 2);
        $grandTotal = round(max(0, $subtotal + $delivery + $serviceCharge - $discount) + $taxAmount, 2);
        $restaurant = DB::table('restaurants')->where('id', $restaurantId)->first();
        $quote = DB::transaction(function () use ($data, $inquiry, $restaurantId, $restaurant, $actor, $subtotal, $delivery, $serviceCharge, $discount, $taxAmount, $grandTotal): array {
            $version = (int) DB::table('quotations')->where('inquiry_id', $inquiry->id)->max('version') + 1;
            $number = $this->generateReference('QTN', $restaurant->slug);
            while (DB::table('quotations')->where('quotation_number', $number)->exists()) {
                $number = $this->generateReference('QTN', $restaurant->slug);
            }
            $send = (bool) ($data['send_immediately'] ?? false);
            $quoteId = DB::table('quotations')->insertGetId([
                'restaurant_id' => $restaurantId,
                'inquiry_id' => $inquiry->id,
                'quotation_number' => $number,
                'version' => $version,
                'subtotal' => round($subtotal, 2),
                'delivery_fee' => $delivery,
                'service_charge' => $serviceCharge,
                'discount_amount' => $discount,
                'tax_amount' => $taxAmount,
                'grand_total' => $grandTotal,
                'payment_terms' => $data['payment_terms'],
                'terms_conditions' => $data['terms_conditions'],
                'valid_until' => $data['valid_until'],
                'status' => $send ? 'sent' : 'draft',
                'created_by_name' => $actor['name'],
                'sent_at' => $send ? now() : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach ($data['items'] as $item) {
                DB::table('quotation_items')->insert([
                    'quotation_id' => $quoteId,
                    'item_type' => $item['item_type'] ?? 'custom',
                    'title' => $item['title'],
                    'description' => $item['description'] ?? '',
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'line_total' => round($item['quantity'] * $item['unit_price'], 2),
                ]);
            }
            DB::table('catering_inquiries')->where('id', $inquiry->id)->update([
                'status' => $send ? 'Quotation Sent' : 'Under Review',
                'estimated_total' => $grandTotal,
                'updated_at' => now(),
            ]);
            if ($send) {
                $this->dispatchNotification($restaurantId, 'customer', $inquiry->customer_email,
                    $version > 1 ? 'quotation_updated' : 'quotation_prepared',
                    'Catering Quotation '.$number.' from '.$restaurant->name,
                    'Your formal catering quotation '.$number.' totaling $'.number_format($grandTotal, 2).' is ready. Track reference '.$inquiry->reference_number.' online to review and accept.',
                    $inquiry->reference_number);
            }
            $this->logAudit($restaurantId, 'quotation', $quoteId, $send ? 'quotation_sent' : 'quotation_drafted',
                $actor['name'], ($send ? 'Issued and emailed ' : 'Saved draft ').$number);

            return ['id' => $quoteId, 'number' => $number];
        });
        $created = (array) DB::table('quotations')->where('id', $quote['id'])->first();
        $created['items'] = DB::table('quotation_items')->where('quotation_id', $quote['id'])->get();

        return response()->json(['quotation' => $created], 201);
    }

    private function adminSendQuotation(int $restaurantId, int $quotationId, array $actor): JsonResponse
    {
        $quotation = DB::table('quotations as q')->join('catering_inquiries as i', 'i.id', '=', 'q.inquiry_id')
            ->join('customers as c', 'c.id', '=', 'i.customer_id')->join('restaurants as r', 'r.id', '=', 'q.restaurant_id')
            ->where('q.id', $quotationId)->where('q.restaurant_id', $restaurantId)
            ->select('q.*', 'i.reference_number', 'c.full_name', 'c.email as customer_email', 'r.name as rest_name')->first();
        if (! $quotation) {
            return response()->json(['error' => 'Quotation not found'], 404);
        }
        DB::table('quotations')->where('id', $quotationId)->update(['status' => 'sent', 'sent_at' => now(), 'updated_at' => now()]);
        DB::table('catering_inquiries')->where('id', $quotation->inquiry_id)->update(['status' => 'Quotation Sent', 'updated_at' => now()]);
        $this->dispatchNotification($restaurantId, 'customer', $quotation->customer_email, 'quotation_prepared',
            'Catering Quotation '.$quotation->quotation_number.' from '.$quotation->rest_name,
            'Your catering quotation '.$quotation->quotation_number.' ($'.number_format((float) $quotation->grand_total, 2).') has been sent. Please use reference '.$quotation->reference_number.' to review and accept.',
            $quotation->reference_number);
        $this->logAudit($restaurantId, 'quotation', $quotationId, 'quotation_sent', $actor['name'],
            'Sent quotation '.$quotation->quotation_number.' to '.$quotation->customer_email);

        return response()->json(['ok' => true]);
    }

    private function adminConvertBooking(Request $request, int $restaurantId, int $inquiryId, array $actor): JsonResponse
    {
        $inquiry = DB::table('catering_inquiries as i')->join('customers as c', 'c.id', '=', 'i.customer_id')
            ->where('i.id', $inquiryId)->where('i.restaurant_id', $restaurantId)
            ->select('i.*', 'c.full_name', 'c.email as customer_email', 'c.phone as customer_phone')->first();
        if (! $inquiry) {
            return response()->json(['error' => 'Inquiry not found'], 404);
        }
        if (DB::table('bookings')->where('inquiry_id', $inquiryId)->exists()) {
            return response()->json(['error' => 'A booking already exists for this inquiry.'], 409);
        }
        $quoteQuery = DB::table('quotations')->where('inquiry_id', $inquiryId);
        $quote = $request->filled('quotation_id')
            ? $quoteQuery->where('id', $request->input('quotation_id'))->first()
            : $quoteQuery->orderByDesc('version')->first();
        if (! $quote) {
            return response()->json(['error' => 'Please create a quotation before converting to a confirmed booking.'], 400);
        }
        if ($quote->status !== 'accepted' && ! $request->boolean('staff_verified_acceptance')) {
            return response()->json(['error' => 'Customer must explicitly accept the quotation (or staff must confirm written acceptance) before booking.'], 400);
        }
        $restaurant = DB::table('restaurants')->where('id', $restaurantId)->first();
        $booking = DB::transaction(function () use ($quote, $inquiry, $restaurantId, $restaurant, $request, $actor): array {
            if ($quote->status !== 'accepted') {
                DB::table('quotations')->where('id', $quote->id)->update(['status' => 'accepted', 'accepted_at' => now(), 'updated_at' => now()]);
            }
            $total = (float) $quote->grand_total;
            $deposit = round($total * ((float) $request->input('deposit_percentage', 40)) / 100, 2);
            $reference = $this->generateReference('BK', $restaurant->slug);
            $summary = DB::table('quotation_items')->where('quotation_id', $quote->id)->get()
                ->map(fn ($item) => "{$item->title} (x{$item->quantity})")->implode(', ');
            $bookingId = DB::table('bookings')->insertGetId([
                'restaurant_id' => $restaurantId,
                'inquiry_id' => $inquiry->id,
                'quotation_id' => $quote->id,
                'booking_reference' => $reference,
                'customer_name' => $inquiry->full_name,
                'customer_email' => $inquiry->customer_email,
                'customer_phone' => $inquiry->customer_phone,
                'event_date' => $inquiry->event_date,
                'event_venue' => $inquiry->event_venue,
                'guest_count' => $inquiry->guest_count,
                'confirmed_menu_summary' => $summary ?: 'Confirmed Catering Package',
                'total_amount' => $total,
                'deposit_amount' => $deposit,
                'amount_paid' => 0,
                'balance_due' => $total,
                'payment_status' => 'Unpaid',
                'booking_status' => 'Confirmed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('catering_inquiries')->where('id', $inquiry->id)->update(['status' => 'Confirmed', 'updated_at' => now()]);
            $this->dispatchNotification($restaurantId, 'customer', $inquiry->customer_email, 'booking_confirmed',
                'Booking Confirmed: '.$reference.' — '.$restaurant->name,
                'Your catering booking for '.$inquiry->event_date.' is confirmed. Deposit required: $'.number_format($deposit, 2).'.', $reference);
            $this->logAudit($restaurantId, 'booking', $bookingId, 'booking_created', $actor['name'],
                'Converted '.$inquiry->reference_number.' into booking '.$reference);

            return ['id' => $bookingId];
        });

        return response()->json(['booking' => DB::table('bookings')->where('id', $booking['id'])->first()], 201);
    }

    private function adminBookings(int $restaurantId): JsonResponse
    {
        $bookings = DB::table('bookings as b')->join('catering_inquiries as i', 'i.id', '=', 'b.inquiry_id')
            ->where('b.restaurant_id', $restaurantId)->orderBy('b.event_date')->orderByDesc('b.id')
            ->select('b.*', 'i.reference_number as inquiry_reference')->get()
            ->map(fn ($booking) => array_merge((array) $booking, [
                'payments' => DB::table('booking_payments')->where('booking_id', $booking->id)->orderByDesc('paid_at')->get(),
            ]));

        return response()->json(['bookings' => $bookings]);
    }

    private function adminUpdateBooking(Request $request, int $restaurantId, int $bookingId, array $actor): JsonResponse
    {
        $booking = DB::table('bookings')->where('id', $bookingId)->where('restaurant_id', $restaurantId)->first();
        if (! $booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }
        $status = $request->input('booking_status');
        if ($status) {
            if (! in_array($status, ['Confirmed', 'In Preparation', 'Completed', 'Cancelled'], true)) {
                return response()->json(['error' => 'Invalid booking status'], 422);
            }
            DB::table('bookings')->where('id', $bookingId)->update(['booking_status' => $status, 'updated_at' => now()]);
            if (in_array($status, ['Completed', 'Cancelled'], true)) {
                DB::table('catering_inquiries')->where('id', $booking->inquiry_id)->update(['status' => $status, 'updated_at' => now()]);
            }
            $this->logAudit($restaurantId, 'booking', $bookingId, 'booking_status_updated', $actor['name'],
                $booking->booking_reference.' -> '.$status);
        }

        return response()->json(['ok' => true]);
    }

    private function adminRecordPayment(Request $request, int $restaurantId, int $bookingId, array $actor): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_method' => ['required', 'string', 'max:80'],
            'reference_code' => ['required', 'string', 'max:120'],
            'notes' => ['nullable', 'string'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Verified payment amount, method, and transaction reference are required.');
        }
        $booking = DB::table('bookings')->where('id', $bookingId)->where('restaurant_id', $restaurantId)->first();
        if (! $booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }
        $data = $validator->validated();

        return DB::transaction(function () use ($data, $booking, $restaurantId, $bookingId, $actor): JsonResponse {
            DB::table('booking_payments')->insert([
                'booking_id' => $bookingId,
                'amount' => $data['amount'],
                'payment_method' => $data['payment_method'],
                'reference_code' => $data['reference_code'],
                'recorded_by_name' => $actor['name'],
                'notes' => $data['notes'] ?? '',
                'paid_at' => now(),
            ]);
            $paid = round((float) $booking->amount_paid + (float) $data['amount'], 2);
            $balance = max(0, round((float) $booking->total_amount - $paid, 2));
            $status = $balance <= 0.01 ? 'Fully Paid'
                : ($paid >= (float) $booking->deposit_amount
                    ? ($paid > (float) $booking->deposit_amount ? 'Partially Paid' : 'Deposit Paid')
                    : ($paid > 0 ? 'Partially Paid' : 'Unpaid'));
            DB::table('bookings')->where('id', $bookingId)->update([
                'amount_paid' => $paid, 'balance_due' => $balance, 'payment_status' => $status, 'updated_at' => now(),
            ]);
            $this->logAudit($restaurantId, 'payment', $bookingId, 'payment_verified', $actor['name'],
                'Verified $'.$data['amount'].' via '.$data['payment_method'].' ('.$data['reference_code'].'). Status: '.$status);

            return response()->json(['ok' => true, 'amount_paid' => $paid, 'balance_due' => $balance, 'payment_status' => $status], 201);
        });
    }

    private function adminCatalog(int $restaurantId): JsonResponse
    {
        return response()->json([
            'packages' => DB::table('catering_packages')->where('restaurant_id', $restaurantId)
                ->orderByDesc('is_seasonal')->orderBy('id')->get()->map(fn ($row) => $this->formatPackage((array) $row)),
            'categories' => DB::table('food_categories')->where('restaurant_id', $restaurantId)->orderBy('sort_order')->get(),
            'foodItems' => DB::table('food_items')->where('restaurant_id', $restaurantId)->orderBy('category_id')->orderBy('id')
                ->get()->map(fn ($row) => $this->formatFoodItem((array) $row)),
        ]);
    }

    private function adminPackageMutation(Request $request, string $action, int $restaurantId, ?int $id, array $actor): JsonResponse
    {
        if ($action === 'delete') {
            $package = DB::table('catering_packages')->where('id', $id)->where('restaurant_id', $restaurantId)->first();
            if (! $package) {
                return response()->json(['error' => 'Package not found'], 404);
            }
            DB::table('catering_packages')->where('id', $id)->delete();
            $this->logAudit($restaurantId, 'package', (int) $id, 'package_deleted', $actor['name'], 'Deleted package #'.$id);

            return response()->json(['ok' => true]);
        }
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['required', 'string'],
            'pricing_type' => ['sometimes', 'in:per_person,flat_package'],
            'price' => ['required', 'numeric', 'min:0'],
            'min_guests' => ['sometimes', 'integer', 'min:1'],
            'max_guests' => ['nullable', 'integer', 'min:1'],
            'inclusions' => ['sometimes', 'array'],
            'addons' => ['sometimes', 'array'],
            'image_url' => ['nullable', 'string'],
            'is_available' => ['sometimes', 'boolean'],
            'is_seasonal' => ['sometimes', 'boolean'],
            'promo_label' => ['nullable', 'string', 'max:255'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid package details.');
        }
        $data = $validator->validated();
        $values = [
            'name' => $data['name'],
            'description' => $data['description'],
            'pricing_type' => $data['pricing_type'] ?? 'per_person',
            'price' => $data['price'],
            'min_guests' => $data['min_guests'] ?? 20,
            'max_guests' => $data['max_guests'] ?? null,
            'inclusions_json' => json_encode($data['inclusions'] ?? [], JSON_THROW_ON_ERROR),
            'addons_json' => json_encode($data['addons'] ?? [], JSON_THROW_ON_ERROR),
            'image_url' => $data['image_url'] ?? '/src/assets/images/hero_catering_banquet_1795136239169.jpg',
            'is_available' => $data['is_available'] ?? true,
            'is_seasonal' => $data['is_seasonal'] ?? false,
            'promo_label' => $data['promo_label'] ?? null,
            'updated_at' => now(),
        ];
        if ($action === 'create') {
            $values += ['restaurant_id' => $restaurantId, 'created_at' => now()];
            $id = DB::table('catering_packages')->insertGetId($values);
            $this->logAudit($restaurantId, 'package', $id, 'package_created', $actor['name'], 'Created package '.$data['name']);

            return response()->json(['id' => $id], 201);
        }
        if (! DB::table('catering_packages')->where('id', $id)->where('restaurant_id', $restaurantId)->exists()) {
            return response()->json(['error' => 'Package not found'], 404);
        }
        DB::table('catering_packages')->where('id', $id)->update($values);
        $this->logAudit($restaurantId, 'package', (int) $id, 'package_updated', $actor['name'], 'Updated package '.$data['name']);

        return response()->json(['ok' => true]);
    }

    private function adminCreateCategory(Request $request, int $restaurantId): JsonResponse
    {
        $name = trim((string) $request->input('name'));
        if ($name === '') {
            return response()->json(['error' => 'Category name is required'], 400);
        }
        $id = DB::table('food_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'name' => $name,
            'slug' => Str::slug($name),
            'sort_order' => 10,
        ]);

        return response()->json(['id' => $id], 201);
    }

    private function adminFoodMutation(Request $request, string $action, int $restaurantId, ?int $id, array $actor): JsonResponse
    {
        if ($action === 'delete') {
            if (! DB::table('food_items')->where('id', $id)->where('restaurant_id', $restaurantId)->exists()) {
                return response()->json(['error' => 'Food item not found'], 404);
            }
            DB::table('food_items')->where('id', $id)->delete();
            $this->logAudit($restaurantId, 'food_item', (int) $id, 'food_item_deleted', $actor['name'], 'Deleted food item #'.$id);

            return response()->json(['ok' => true]);
        }
        $validator = Validator::make($request->all(), [
            'category_id' => ['required', 'integer'],
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['required', 'string'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'price_unit' => ['sometimes', 'string', 'max:80'],
            'min_order_qty' => ['sometimes', 'integer', 'min:1'],
            'dietary_tags' => ['nullable', 'string'],
            'allergens' => ['nullable', 'string'],
            'image_url' => ['nullable', 'string'],
            'is_available' => ['sometimes', 'boolean'],
            'addons' => ['sometimes', 'array'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid food item details.');
        }
        $data = $validator->validated();
        if (! DB::table('food_categories')->where('id', $data['category_id'])->where('restaurant_id', $restaurantId)->exists()) {
            return response()->json(['error' => 'Category not found'], 422);
        }
        $values = [
            'category_id' => $data['category_id'],
            'name' => $data['name'],
            'description' => $data['description'],
            'unit_price' => $data['unit_price'] ?? null,
            'price_unit' => $data['price_unit'] ?? 'per tray',
            'min_order_qty' => $data['min_order_qty'] ?? 1,
            'dietary_tags' => $data['dietary_tags'] ?? '',
            'allergens' => $data['allergens'] ?? '',
            'image_url' => $data['image_url'] ?? '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg',
            'is_available' => $data['is_available'] ?? true,
            'addons_json' => json_encode($data['addons'] ?? [], JSON_THROW_ON_ERROR),
            'updated_at' => now(),
        ];
        if ($action === 'create') {
            $values += ['restaurant_id' => $restaurantId, 'created_at' => now()];
            $id = DB::table('food_items')->insertGetId($values);
            $this->logAudit($restaurantId, 'food_item', $id, 'food_item_created', $actor['name'], 'Added menu item '.$data['name']);

            return response()->json(['id' => $id], 201);
        }
        if (! DB::table('food_items')->where('id', $id)->where('restaurant_id', $restaurantId)->exists()) {
            return response()->json(['error' => 'Food item not found'], 404);
        }
        DB::table('food_items')->where('id', $id)->update($values);
        $this->logAudit($restaurantId, 'food_item', (int) $id, 'food_item_updated', $actor['name'], 'Updated menu item '.$data['name']);

        return response()->json(['ok' => true]);
    }

    private function adminNotifications(int $restaurantId): JsonResponse
    {
        return response()->json([
            'notifications' => DB::table('notifications')->where('restaurant_id', $restaurantId)
                ->orderByDesc('created_at')->orderByDesc('id')->limit(100)->get(),
            'auditLogs' => DB::table('audit_logs')->where('restaurant_id', $restaurantId)
                ->orderByDesc('created_at')->orderByDesc('id')->limit(100)->get(),
        ]);
    }

    private function adminReminder(Request $request, int $restaurantId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'booking_id' => ['required', 'integer'],
            'channel' => ['sometimes', 'in:email,sms,messenger'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Booking and reminder channel are required.');
        }
        $booking = DB::table('bookings')->where('id', $request->input('booking_id'))
            ->where('restaurant_id', $restaurantId)->first();
        if (! $booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }
        $channel = $request->input('channel', 'email');
        $contact = $channel === 'sms' ? $booking->customer_phone : $booking->customer_email;
        $this->dispatchNotification($restaurantId, 'customer', $contact, 'event_reminder',
            'Upcoming Event Reminder: '.$booking->booking_reference.' on '.$booking->event_date,
            'Looking forward to catering your event at '.$booking->event_venue.' for '.$booking->guest_count.' guests.',
            $booking->booking_reference, $channel);

        return response()->json(['ok' => true], 201);
    }

    private function adminUpdateRestaurant(Request $request, int $restaurantId, array $actor): JsonResponse
    {
        if ($actor['role'] === 'staff') {
            return response()->json(['error' => 'Only owners or managers can update restaurant settings.'], 403);
        }
        $fields = ['name', 'tagline', 'brand_color', 'email', 'phone', 'address', 'tax_rate', 'service_charge_rate'];
        $updates = $request->only($fields);
        if (isset($updates['tax_rate']) && (! is_numeric($updates['tax_rate']) || $updates['tax_rate'] < 0 || $updates['tax_rate'] > 50)) {
            return response()->json(['error' => 'Invalid tax rate'], 422);
        }
        if (isset($updates['service_charge_rate']) && (! is_numeric($updates['service_charge_rate']) || $updates['service_charge_rate'] < 0 || $updates['service_charge_rate'] > 100)) {
            return response()->json(['error' => 'Invalid service charge rate'], 422);
        }
        $updates['updated_at'] = now();
        DB::table('restaurants')->where('id', $restaurantId)->update($updates);
        $this->logAudit($restaurantId, 'restaurant', $restaurantId, 'settings_updated', $actor['name'], 'Updated restaurant profile & tax/service rates');

        return response()->json(['ok' => true]);
    }

    private function adminUsers(Request $request, string $method, int $restaurantId, array $actor): JsonResponse
    {
        if ($actor['role'] !== 'owner') {
            return response()->json(['error' => 'Only restaurant owners can manage team members.'], 403);
        }

        if ($method === 'GET') {
            $users = DB::table('users')
                ->where('restaurant_id', $restaurantId)
                ->whereIn('role', ['manager', 'staff'])
                ->select('id', 'name', 'email', 'role', 'is_active', 'created_at')
                ->orderBy('name')
                ->get()
                ->map(fn ($user) => $this->booleanFields((array) $user, ['is_active']));

            return response()->json(['users' => $users]);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'max:100'],
            'role' => ['required', 'in:manager,staff'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Name, valid email, password (min 8 chars), and role are required.');
        }
        $data = $validator->validated();
        $email = Str::lower(trim($data['email']));
        if (DB::table('users')->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json(['error' => 'Email already exists.'], 409);
        }

        $userId = DB::transaction(function () use ($data, $email, $restaurantId, $actor): int {
            $userId = DB::table('users')->insertGetId([
                'restaurant_id' => $restaurantId,
                'name' => trim($data['name']),
                'email' => $email,
                'password' => Hash::make($data['password']),
                'role' => $data['role'],
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->logAudit($restaurantId, 'user', $userId, 'user_created', $actor['name'],
                'Created '.$data['role'].' account for '.$email);

            return $userId;
        });

        return response()->json(['id' => $userId], 201);
    }

    private function adminUserMutation(Request $request, string $method, int $restaurantId, int $userId, array $actor): JsonResponse
    {
        if ($actor['role'] !== 'owner') {
            return response()->json(['error' => 'Only restaurant owners can manage team members.'], 403);
        }
        $user = DB::table('users')
            ->where('id', $userId)
            ->where('restaurant_id', $restaurantId)
            ->whereIn('role', ['manager', 'staff'])
            ->first();
        if (! $user) {
            return response()->json(['error' => 'Team member not found.'], 404);
        }

        if ($method === 'DELETE') {
            DB::transaction(function () use ($restaurantId, $userId, $user, $actor): void {
                DB::table('api_tokens')->where('user_id', $userId)->delete();
                $this->logAudit($restaurantId, 'user', $userId, 'user_deleted', $actor['name'],
                    'Removed team account for '.$user->email);
                DB::table('users')->where('id', $userId)->delete();
            });

            return response()->json(['ok' => true]);
        }
        if ($method !== 'PATCH') {
            return response()->json(['error' => 'Method not allowed'], 405);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'email' => ['sometimes', 'email', 'max:255'],
            'role' => ['sometimes', 'in:manager,staff'],
            'is_active' => ['sometimes', 'boolean'],
            'new_password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:100'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid team member details.');
        }
        $data = $validator->validated();
        $email = isset($data['email']) ? Str::lower(trim($data['email'])) : $user->email;
        if ($email !== Str::lower($user->email)
            && DB::table('users')->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json(['error' => 'Email already exists.'], 409);
        }

        DB::transaction(function () use ($data, $email, $restaurantId, $userId, $user, $actor): void {
            $updates = [
                'name' => isset($data['name']) ? trim($data['name']) : $user->name,
                'email' => $email,
                'role' => $data['role'] ?? $user->role,
                'is_active' => $data['is_active'] ?? (bool) $user->is_active,
                'updated_at' => now(),
            ];
            if (! empty($data['new_password'])) {
                $updates['password'] = Hash::make($data['new_password']);
            }
            DB::table('users')->where('id', $userId)->update($updates);
            if (($data['is_active'] ?? true) === false || ! empty($data['new_password'])) {
                DB::table('api_tokens')->where('user_id', $userId)->delete();
            }
            $this->logAudit($restaurantId, 'user', $userId, 'user_updated', $actor['name'],
                'Updated team account for '.$email);
        });

        return response()->json(['ok' => true]);
    }

    private function superadminOverview(): JsonResponse
    {
        $financial = DB::table('bookings')->selectRaw(
            'COALESCE(SUM(total_amount), 0) as total_contract, COALESCE(SUM(amount_paid), 0) as total_paid, COALESCE(SUM(balance_due), 0) as total_balance'
        )->first();

        return response()->json(['metrics' => [
            'totalRestaurants' => DB::table('restaurants')->count(),
            'publishedRestaurants' => DB::table('restaurants')->where('is_published', true)->count(),
            'totalUsers' => DB::table('users')->count(),
            'activeUsers' => DB::table('users')->where('is_active', true)->count(),
            'totalInquiries' => DB::table('catering_inquiries')->count(),
            'totalBookings' => DB::table('bookings')->count(),
            'totalContractValue' => round((float) $financial->total_contract, 2),
            'totalVerifiedPaid' => round((float) $financial->total_paid, 2),
            'totalOutstandingBalance' => round((float) $financial->total_balance, 2),
        ]]);
    }

    private function superadminRestaurants(): JsonResponse
    {
        $restaurants = DB::table('restaurants as r')
            ->select('r.*')
            ->selectSub(fn (Builder $q) => $q->from('catering_inquiries as i')->selectRaw('COUNT(*)')->whereColumn('i.restaurant_id', 'r.id'), 'inquiry_count')
            ->selectSub(fn (Builder $q) => $q->from('bookings as b')->selectRaw('COUNT(*)')->whereColumn('b.restaurant_id', 'r.id'), 'booking_count')
            ->selectSub(fn (Builder $q) => $q->from('restaurant_services as s')->selectRaw('COUNT(*)')->whereColumn('s.restaurant_id', 'r.id'), 'service_count')
            ->selectSub(fn (Builder $q) => $q->from('users as u')->select('u.name')->whereColumn('u.restaurant_id', 'r.id')->where('u.role', 'owner')->orderBy('u.id')->limit(1), 'owner_name')
            ->selectSub(fn (Builder $q) => $q->from('users as u')->select('u.email')->whereColumn('u.restaurant_id', 'r.id')->where('u.role', 'owner')->orderBy('u.id')->limit(1), 'owner_email')
            ->orderBy('r.id')->get()->map(fn ($row) => $this->booleanFields((array) $row, ['is_published']));

        return response()->json(['restaurants' => $restaurants]);
    }

    private function superadminUpdateRestaurant(Request $request, int $id, array $actor): JsonResponse
    {
        $restaurant = DB::table('restaurants')->where('id', $id)->first();
        if (! $restaurant) {
            return response()->json(['error' => 'Restaurant not found'], 404);
        }
        $fields = ['name', 'tagline', 'brand_color', 'hero_headline', 'hero_subheadline', 'hero_image_url', 'about_title', 'about_description'];
        $updates = $request->only($fields);
        if ($request->has('is_published')) {
            $updates['is_published'] = $request->boolean('is_published');
        }
        $updates['updated_at'] = now();
        DB::table('restaurants')->where('id', $id)->update($updates);
        $this->logAudit($id, 'restaurant', $id, 'superadmin_updated_restaurant', $actor['name'],
            'Superadmin updated landing page for '.($updates['name'] ?? $restaurant->name));

        return response()->json(['ok' => true]);
    }

    private function superadminUsers(Request $request): JsonResponse
    {
        $query = DB::table('users as u')->leftJoin('restaurants as r', 'r.id', '=', 'u.restaurant_id')
            ->select('u.id', 'u.restaurant_id', 'u.name', 'u.email', 'u.role', 'u.is_active', 'u.created_at',
                'r.name as restaurant_name', 'r.slug as restaurant_slug');
        if ($request->filled('role') && $request->query('role') !== 'all') {
            $query->where('u.role', $request->query('role'));
        }
        if ((int) $request->query('restaurant_id', 0) > 0) {
            $query->where('u.restaurant_id', (int) $request->query('restaurant_id'));
        }
        if ($request->filled('search')) {
            $search = '%'.Str::lower(trim($request->query('search'))).'%';
            $query->where(function (Builder $builder) use ($search): void {
                $builder->whereRaw('LOWER(u.name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(u.email) LIKE ?', [$search])
                    ->orWhereRaw("LOWER(COALESCE(r.name, '')) LIKE ?", [$search]);
            });
        }
        $users = $query->orderByDesc('u.id')->get()->map(fn ($row) => $this->booleanFields((array) $row, ['is_active']));

        return response()->json(['users' => $users]);
    }

    private function superadminCreateUser(Request $request, array $actor): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'in:superadmin,owner,manager,staff'],
            'restaurant_id' => ['nullable', 'integer'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Name, valid email, password (min 8 chars), and role are required.');
        }
        $data = $validator->validated();
        if ($data['role'] !== 'superadmin' && empty($data['restaurant_id'])) {
            return response()->json(['error' => 'Owners, managers, and staff must be assigned to a restaurant.'], 400);
        }
        if (! empty($data['restaurant_id']) && ! DB::table('restaurants')->where('id', $data['restaurant_id'])->exists()) {
            return response()->json(['error' => 'Restaurant not found'], 422);
        }
        if (DB::table('users')->whereRaw('LOWER(email) = ?', [Str::lower($data['email'])])->exists()) {
            return response()->json(['error' => 'Email already exists.'], 409);
        }
        $userId = DB::table('users')->insertGetId([
            'restaurant_id' => $data['role'] === 'superadmin' ? null : ($data['restaurant_id'] ?? null),
            'name' => trim($data['name']),
            'email' => trim($data['email']),
            'password' => Hash::make($data['password']),
            'role' => $data['role'],
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if (! empty($data['restaurant_id'])) {
            $this->logAudit((int) $data['restaurant_id'], 'user', $userId, 'user_created', $actor['name'],
                'Superadmin created '.$data['role'].' account for '.$data['email']);
        }

        return response()->json(['id' => $userId], 201);
    }

    private function superadminUserMutation(Request $request, string $method, int $userId, array $actor): JsonResponse
    {
        $user = DB::table('users')->where('id', $userId)->first();
        if (! $user) {
            return response()->json(['error' => 'User not found'], 404);
        }
        if ($method === 'DELETE') {
            if ($userId === (int) $actor['id']) {
                return response()->json(['error' => 'You cannot delete your own active superadmin account.'], 400);
            }
            DB::table('users')->where('id', $userId)->delete();

            return response()->json(['ok' => true]);
        }
        if ($method !== 'PATCH') {
            return response()->json(['error' => 'Method not allowed'], 405);
        }
        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'role' => ['sometimes', 'in:superadmin,owner,manager,staff'],
            'restaurant_id' => ['sometimes', 'nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
            'new_password' => ['sometimes', 'nullable', 'string', 'min:8'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator, 'Invalid user details.');
        }
        $data = $validator->validated();
        if ($userId === (int) $actor['id'] && ($data['is_active'] ?? true) === false) {
            return response()->json(['error' => 'You cannot suspend your own active superadmin account.'], 400);
        }
        $role = $data['role'] ?? $user->role;
        $restaurantId = $role === 'superadmin'
            ? null
            : ($data['restaurant_id'] ?? $user->restaurant_id);
        if ($role !== 'superadmin' && ! $restaurantId) {
            return response()->json(['error' => 'Owners, managers, and staff must be assigned to a restaurant.'], 400);
        }
        if ($restaurantId && ! DB::table('restaurants')->where('id', $restaurantId)->exists()) {
            return response()->json(['error' => 'Restaurant not found'], 422);
        }
        $updates = [
            'name' => isset($data['name']) ? trim($data['name']) : $user->name,
            'role' => $role,
            'restaurant_id' => $restaurantId,
            'is_active' => $data['is_active'] ?? (bool) $user->is_active,
            'updated_at' => now(),
        ];
        if (! empty($data['new_password'])) {
            $updates['password'] = Hash::make($data['new_password']);
        }
        DB::table('users')->where('id', $userId)->update($updates);
        if (($data['is_active'] ?? null) === false) {
            DB::table('api_tokens')->where('user_id', $userId)->delete();
        }

        return response()->json(['ok' => true]);
    }

    private function superadminBookings(Request $request): JsonResponse
    {
        $query = DB::table('bookings as b')->join('restaurants as r', 'r.id', '=', 'b.restaurant_id')
            ->join('catering_inquiries as i', 'i.id', '=', 'b.inquiry_id')
            ->select('b.*', 'r.name as restaurant_name', 'r.slug as restaurant_slug', 'i.reference_number as inquiry_reference');
        if ((int) $request->query('restaurant_id', 0) > 0) {
            $query->where('b.restaurant_id', (int) $request->query('restaurant_id'));
        }
        if ($request->filled('booking_status') && $request->query('booking_status') !== 'All') {
            $query->where('b.booking_status', $request->query('booking_status'));
        }
        if ($request->filled('payment_status') && $request->query('payment_status') !== 'All') {
            $query->where('b.payment_status', $request->query('payment_status'));
        }
        if ($request->filled('search')) {
            $search = '%'.Str::lower(trim($request->query('search'))).'%';
            $query->where(function (Builder $builder) use ($search): void {
                $builder->whereRaw('LOWER(b.booking_reference) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(b.customer_name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(b.event_venue) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(r.name) LIKE ?', [$search]);
            });
        }
        $bookings = $query->orderBy('b.event_date')->orderByDesc('b.id')->get()
            ->map(fn ($booking) => array_merge((array) $booking, [
                'payments' => DB::table('booking_payments')->where('booking_id', $booking->id)->orderByDesc('paid_at')->get(),
            ]));

        return response()->json(['bookings' => $bookings]);
    }

    private function superadminUpdateBooking(Request $request, int $bookingId, array $actor): JsonResponse
    {
        $booking = DB::table('bookings')->where('id', $bookingId)->first();
        if (! $booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }
        $status = $request->input('booking_status');
        if ($status) {
            if (! in_array($status, ['Confirmed', 'In Preparation', 'Completed', 'Cancelled'], true)) {
                return response()->json(['error' => 'Invalid booking status'], 422);
            }
            DB::table('bookings')->where('id', $bookingId)->update(['booking_status' => $status, 'updated_at' => now()]);
            if (in_array($status, ['Completed', 'Cancelled'], true)) {
                DB::table('catering_inquiries')->where('id', $booking->inquiry_id)->update(['status' => $status, 'updated_at' => now()]);
            }
            $this->logAudit((int) $booking->restaurant_id, 'booking', $bookingId, 'superadmin_booking_updated', $actor['name'],
                'Superadmin updated '.$booking->booking_reference.' -> '.$status);
        }

        return response()->json(['ok' => true]);
    }

    private function validationError($validator, string $message): JsonResponse
    {
        return response()->json(['error' => $message, 'details' => $validator->errors()], 422);
    }

    private function isRateLimited(Request $request, int $limit): bool
    {
        $key = 'catering-api:'.$request->ip().':'.$request->path();
        if (RateLimiter::tooManyAttempts($key, $limit)) {
            return true;
        }
        RateLimiter::hit($key, 60);

        return false;
    }

    private function booleanFields(array $row, array $fields): array
    {
        foreach ($fields as $field) {
            if (array_key_exists($field, $row)) {
                $row[$field] = (bool) $row[$field];
            }
        }

        return $row;
    }

    private function formatPackage(array $row): array
    {
        $row['inclusions'] = json_decode($row['inclusions_json'] ?: '[]', true) ?: [];
        $row['addons'] = json_decode($row['addons_json'] ?: '[]', true) ?: [];
        unset($row['inclusions_json'], $row['addons_json']);

        return $this->booleanFields($row, ['is_available', 'is_seasonal']);
    }

    private function formatFoodItem(array $row): array
    {
        $row['addons'] = json_decode($row['addons_json'] ?: '[]', true) ?: [];
        unset($row['addons_json']);

        return $this->booleanFields($row, ['is_available']);
    }

    private function contactMatches(string $contact, string $email, string $phone): bool
    {
        $cleanContact = Str::lower(trim($contact));
        $digits = preg_replace('/\D+/', '', $cleanContact);
        $phoneDigits = preg_replace('/\D+/', '', $phone);

        return Str::lower($email) === $cleanContact
            || (strlen($digits) >= 6 && str_ends_with($phoneDigits, substr($digits, -7)));
    }

    private function generateReference(string $prefix, string $slug): string
    {
        $code = collect(explode('-', $slug))->map(fn (string $part) => Str::upper(substr($part, 0, 1)))->take(3)->implode('');

        return $prefix.'-'.($code ?: 'X').'-'.now()->year.'-'.random_int(1000, 9999);
    }

    private function seedDefaultCatalog(int $restaurantId, string $restaurantName): void
    {
        $events = [
            ['Birthday Parties', 'birthday-parties', "Celebration platters, grazing tables, and desserts crafted by {$restaurantName}.", '/src/assets/images/event_birthday_table_1795136243424.jpg', 1],
            ['Weddings and Receptions', 'weddings-receptions', 'Multi-course plated banquets and coordinated reception service.', '/src/assets/images/event_wedding_banquet_1795136243199.jpg', 2],
            ['Corporate Events', 'corporate-events', 'Executive luncheons, boardroom buffets, and conference catering.', '/src/assets/images/event_corporate_buffet_1795136243249.jpg', 3],
            ['Family Gatherings', 'family-gatherings', 'Generous family-style roasts, salads, and artisan breads.', '/src/assets/images/event_family_gathering_1795136243668.jpg', 4],
            ['School and Community Events', 'school-community', 'High-volume warm buffet trays tailored for community halls.', '/src/assets/images/event_community_feast_1795136243259.jpg', 5],
            ['Packed Meals and Bulk Orders', 'packed-meals-bulk', 'Individually sealed meal boxes with clear allergen labeling.', '/src/assets/images/event_packed_meals_1795136242777.jpg', 6],
        ];
        foreach ($events as [$name, $slug, $description, $image, $order]) {
            DB::table('event_types')->insert([
                'restaurant_id' => $restaurantId,
                'name' => $name,
                'slug' => $slug,
                'description' => $description,
                'image_url' => $image,
                'sort_order' => $order,
            ]);
        }

        $mainCategory = DB::table('food_categories')->insertGetId([
            'restaurant_id' => $restaurantId, 'name' => 'Signature Mains', 'slug' => 'signature-mains', 'sort_order' => 1,
        ]);
        $boxCategory = DB::table('food_categories')->insertGetId([
            'restaurant_id' => $restaurantId, 'name' => 'Packed Meal Boxes', 'slug' => 'packed-meal-boxes', 'sort_order' => 2,
        ]);
        DB::table('catering_packages')->insert([
            'restaurant_id' => $restaurantId,
            'name' => $restaurantName.' Signature Buffet',
            'description' => 'Balanced two-entrée buffet featuring seasonal salads, artisan bread, and dessert bites.',
            'pricing_type' => 'per_person',
            'price' => 54,
            'min_guests' => 20,
            'max_guests' => 250,
            'inclusions_json' => json_encode(['Seasonal Greens Salad', 'Choice of Two Signature Entrées', 'Herb Roasted Potatoes', 'Assorted Dessert Bites'], JSON_THROW_ON_ERROR),
            'addons_json' => json_encode([['name' => 'Coffee & Tea Service', 'price' => 6]], JSON_THROW_ON_ERROR),
            'image_url' => '/src/assets/images/event_corporate_buffet_1795136243249.jpg',
            'is_available' => true,
            'is_seasonal' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('food_items')->insert([
            [
                'restaurant_id' => $restaurantId,
                'category_id' => $mainCategory,
                'name' => 'Herb-Crusted Roast Platter',
                'description' => 'Slow-roasted signature main served with seasonal vegetables and house jus.',
                'unit_price' => 210,
                'price_unit' => 'per platter (serves 10)',
                'min_order_qty' => 1,
                'dietary_tags' => 'Gluten-Free',
                'allergens' => 'None',
                'image_url' => '/src/assets/images/dish_herb_roast_beef_1795136242853.jpg',
                'is_available' => true,
                'addons_json' => '[]',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'restaurant_id' => $restaurantId,
                'category_id' => $boxCategory,
                'name' => 'Executive Catering Meal Box',
                'description' => 'Individually sealed protein, grain, and roasted seasonal vegetable box with utensils.',
                'unit_price' => 24,
                'price_unit' => 'per box',
                'min_order_qty' => 15,
                'dietary_tags' => 'Dairy-Free',
                'allergens' => 'Fish',
                'image_url' => '/src/assets/images/event_packed_meals_1795136242777.jpg',
                'is_available' => true,
                'addons_json' => '[]',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    private function seedDefaultServices(int $restaurantId): void
    {
        $services = [
            ['Food setup', 'Chafing dish placement, serving risers, labeled menu cards, and table styling.', 'flat', 150, 1],
            ['Waitstaff', 'Uniformed banquet captains and servers for plated service, replenishment, and teardown.', 'per_person', 18, 2],
            ['Tables and chairs', 'Banquet dining tables, folding chairs, and pressed linen tablecloths delivered on-site.', 'custom', 0, 3],
            ['Buffet arrangement', 'Full hot and ambient buffet line setup with stainless chafers and serving utensils.', 'flat', 185, 4],
            ['Food delivery', 'Insulated temperature-controlled courier delivery directly to your venue.', 'flat', 95, 5],
        ];
        foreach ($services as [$title, $description, $priceType, $price, $order]) {
            DB::table('restaurant_services')->insert([
                'restaurant_id' => $restaurantId,
                'title' => $title,
                'description' => $description,
                'price_type' => $priceType,
                'price' => $price,
                'is_available' => true,
                'sort_order' => $order,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function dispatchNotification(int $restaurantId, string $recipientType, string $contact, string $eventKey, string $subject, string $body, ?string $reference = null, string $channel = 'email'): void
    {
        DB::table('notifications')->insert([
            'restaurant_id' => $restaurantId,
            'recipient_type' => $recipientType,
            'recipient_contact' => $contact,
            'channel' => $channel,
            'event_key' => $eventKey,
            'subject' => $subject,
            'body' => $body,
            'status' => 'sent',
            'related_reference' => $reference,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function logAudit(int $restaurantId, string $entityType, int $entityId, string $action, string $actor, string $details): void
    {
        DB::table('audit_logs')->insert([
            'restaurant_id' => $restaurantId,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'action' => $action,
            'actor_name' => $actor,
            'details' => $details,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
