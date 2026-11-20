<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CateringApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_registration_creates_a_token_and_seeded_storefront(): void
    {
        $response = $this->postJson('/api/public/register-owner', [
            'owner_name' => 'Avery Owner',
            'email' => 'avery@example.test',
            'password' => 'secure-password',
            'restaurant_name' => 'Avery Kitchen',
            'tagline' => 'Seasonal catering for every gathering',
            'phone' => '555-0100',
            'address' => '123 Market Street, San Francisco',
            'starter_services' => [
                ['title' => 'Delivery service', 'description' => 'Local delivery', 'price_type' => 'flat', 'price' => 25],
            ],
        ])->assertCreated()
            ->assertJsonPath('user.role', 'owner')
            ->assertJsonPath('user.restaurant_slug', 'avery-kitchen');

        $token = $response->json('token');
        $userId = $response->json('user.id');
        $restaurantId = $response->json('restaurant.id');

        $this->assertDatabaseHas('api_tokens', [
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
        ]);
        $this->assertDatabaseCount('event_types', 6);
        $this->assertDatabaseCount('catering_packages', 1);
        $this->assertDatabaseCount('food_items', 2);

        $this->withToken($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $userId);
        $this->withToken($token)->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('restaurant.id', $restaurantId);
        $this->withToken($token)->getJson('/api/superadmin/overview')
            ->assertForbidden();

        $packageId = (int) DB::table('catering_packages')->where('restaurant_id', $restaurantId)->value('id');
        $inquiryResponse = $this->postJson('/api/public/avery-kitchen/inquiries', [
            'event_type_id' => null,
            'event_type_name' => 'Birthday Party',
            'event_date' => '2026-10-10',
            'start_time' => '18:00',
            'end_time' => '22:00',
            'guest_count' => 20,
            'event_venue' => 'Harbor Hall',
            'delivery_address' => '500 Bay Street, San Francisco',
            'venue_setting' => 'indoor',
            'selected_package_id' => $packageId,
            'selected_items' => [],
            'dietary_requirements' => '',
            'food_allergies' => '',
            'special_instructions' => '',
            'additional_services' => [],
            'full_name' => 'Casey Customer',
            'phone' => '555-0111',
            'email' => 'casey@example.test',
            'company_name' => '',
            'preferred_contact' => 'Email',
            'privacy_consent' => true,
            'captcha_checked' => true,
        ])->assertCreated()->assertJsonPath('estimated_total', 1080);

        $reference = $inquiryResponse->json('reference_number');
        $this->getJson('/api/public/avery-kitchen/track?reference='.$reference.'&contact=casey%40example.test')
            ->assertOk()
            ->assertJsonPath('inquiry.reference_number', $reference)
            ->assertJsonPath('inquiry.customer_email', 'casey@example.test');

        $inquiryId = (int) DB::table('catering_inquiries')->where('reference_number', $reference)->value('id');
        $quotationResponse = $this->withToken($token)->postJson('/api/admin/inquiries/'.$inquiryId.'/quotations', [
            'items' => [[
                'item_type' => 'package',
                'title' => 'Signature Buffet',
                'description' => 'Seasonal menu',
                'quantity' => 1,
                'unit_price' => 1000,
            ]],
            'delivery_fee' => 10,
            'service_charge' => 15,
            'discount_amount' => 0,
            'tax_rate' => 8.5,
            'payment_terms' => '40% deposit due on confirmation',
            'terms_conditions' => 'Final guest count due one week before the event',
            'valid_until' => '2026-09-20',
            'send_immediately' => true,
        ])->assertCreated();
        $quotationNumber = $quotationResponse->json('quotation.quotation_number');

        $this->postJson('/api/public/avery-kitchen/quotations/'.$quotationNumber.'/respond', [
            'reference' => $reference,
            'contact' => 'casey@example.test',
            'decision' => 'accept',
        ])->assertOk()->assertJsonPath('status', 'accepted');

        $booking = DB::table('bookings')->where('inquiry_id', $inquiryId)->first();
        $this->assertNotNull($booking);
        $this->withToken($token)->getJson('/api/admin/bookings')
            ->assertOk()->assertJsonPath('bookings.0.id', (int) $booking->id);
        $this->withToken($token)->postJson('/api/admin/bookings/'.$booking->id.'/payments', [
            'amount' => 500,
            'payment_method' => 'Bank transfer',
            'reference_code' => 'TXN-100',
            'notes' => '',
        ])->assertCreated()->assertJsonPath('payment_status', 'Partially Paid');

        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_admin_catalog_and_superadmin_routes_use_their_correct_tenants(): void
    {
        $registration = $this->postJson('/api/public/register-owner', [
            'owner_name' => 'Morgan Owner',
            'email' => 'morgan@example.test',
            'password' => 'secure-password',
            'restaurant_name' => 'Morgan Catering',
            'tagline' => 'Good food for every event',
            'phone' => '555-0120',
            'address' => '20 River Road, Portland',
        ])->assertCreated();
        $ownerToken = $registration->json('token');
        $restaurantId = $registration->json('restaurant.id');

        $this->withToken($ownerToken)->getJson('/api/admin/catalog')
            ->assertOk()->assertJsonCount(1, 'packages')->assertJsonCount(2, 'foodItems');

        $package = $this->withToken($ownerToken)->postJson('/api/admin/packages', [
            'name' => 'Lunch Package',
            'description' => 'A weekday menu',
            'pricing_type' => 'flat_package',
            'price' => 300,
            'min_guests' => 10,
            'max_guests' => 50,
            'inclusions' => ['Salad', 'Entree'],
            'addons' => [],
            'is_available' => true,
            'is_seasonal' => false,
        ])->assertCreated();
        $packageId = $package->json('id');
        $this->withToken($ownerToken)->putJson('/api/admin/packages/'.$packageId, [
            'name' => 'Updated Lunch Package',
            'description' => 'A revised weekday menu',
            'pricing_type' => 'flat_package',
            'price' => 325,
            'inclusions' => ['Salad'],
            'addons' => [],
        ])->assertOk();
        $this->withToken($ownerToken)->deleteJson('/api/admin/packages/'.$packageId)->assertOk();

        $category = $this->withToken($ownerToken)->postJson('/api/admin/categories', ['name' => 'Desserts'])->assertCreated();
        $food = $this->withToken($ownerToken)->postJson('/api/admin/food-items', [
            'category_id' => $category->json('id'),
            'name' => 'Lemon Tart',
            'description' => 'A citrus dessert',
            'unit_price' => 12,
            'addons' => [],
        ])->assertCreated();
        $this->withToken($ownerToken)->putJson('/api/admin/food-items/'.$food->json('id'), [
            'category_id' => $category->json('id'),
            'name' => 'Lemon Tart',
            'description' => 'Updated dessert',
            'unit_price' => 13,
            'addons' => [],
        ])->assertOk();
        $this->withToken($ownerToken)->deleteJson('/api/admin/food-items/'.$food->json('id'))->assertOk();

        $service = $this->withToken($ownerToken)->postJson('/api/admin/services', [
            'title' => 'Cake delivery',
            'description' => 'Dessert delivery',
            'price_type' => 'flat',
            'price' => 20,
        ])->assertCreated();
        $this->withToken($ownerToken)->putJson('/api/admin/services/'.$service->json('id'), [
            'title' => 'Cake delivery',
            'description' => 'Updated dessert delivery',
            'price_type' => 'flat',
            'price' => 25,
        ])->assertOk();
        $this->withToken($ownerToken)->deleteJson('/api/admin/services/'.$service->json('id'))->assertOk();
        $this->withToken($ownerToken)->patchJson('/api/admin/landing-page', ['hero_headline' => 'Freshly prepared'])
            ->assertOk();
        $this->withToken($ownerToken)->patchJson('/api/admin/restaurant', [
            'name' => 'Morgan Catering',
            'tax_rate' => 8.5,
            'service_charge_rate' => 15,
        ])->assertOk();

        $superadminId = DB::table('users')->insertGetId([
            'name' => 'Platform Admin',
            'email' => 'platform@example.test',
            'password' => Hash::make('superadmin-password'),
            'role' => 'superadmin',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $superadminToken = $this->postJson('/api/auth/login', [
            'email' => 'platform@example.test',
            'password' => 'superadmin-password',
        ])->assertOk()->json('token');

        $this->withToken($superadminToken)->getJson('/api/superadmin/overview')
            ->assertOk()->assertJsonPath('metrics.totalRestaurants', 1);
        $this->withToken($superadminToken)->getJson('/api/superadmin/restaurants')
            ->assertOk()->assertJsonPath('restaurants.0.id', $restaurantId);
        $this->withToken($superadminToken)->getJson('/api/superadmin/users')
            ->assertOk()->assertJsonCount(2, 'users');
        $this->withToken($superadminToken)->getJson('/api/superadmin/bookings')->assertOk();
        $this->withToken($superadminToken)->patchJson('/api/superadmin/restaurants/'.$restaurantId, [
            'is_published' => false,
        ])->assertOk();

        $managedUser = $this->withToken($superadminToken)->postJson('/api/superadmin/users', [
            'name' => 'Tenant Manager',
            'email' => 'manager@example.test',
            'password' => 'manager-password',
            'role' => 'manager',
            'restaurant_id' => $restaurantId,
        ])->assertCreated();
        $managedUserId = $managedUser->json('id');
        $this->withToken($superadminToken)->patchJson('/api/superadmin/users/'.$managedUserId, [
            'is_active' => false,
        ])->assertOk();
        $this->withToken($superadminToken)->deleteJson('/api/superadmin/users/'.$managedUserId)->assertOk();
        $this->assertDatabaseHas('users', ['id' => $superadminId, 'role' => 'superadmin']);
    }

    public function test_restaurant_owners_can_manage_only_their_own_team_members(): void
    {
        $firstOwner = $this->postJson('/api/public/register-owner', [
            'owner_name' => 'Taylor Owner',
            'email' => 'taylor@example.test',
            'password' => 'owner-password',
            'restaurant_name' => 'Taylor Kitchen',
            'tagline' => 'Fresh food for every event',
            'phone' => '555-0130',
            'address' => '30 Oak Street, Austin',
        ])->assertCreated();
        $firstOwnerToken = $firstOwner->json('token');

        $this->withToken($firstOwnerToken)->postJson('/api/admin/users', [
            'name' => 'Second Owner',
            'email' => 'second-owner@example.test',
            'password' => 'owner-password',
            'role' => 'owner',
        ])->assertUnprocessable();

        $secondOwner = $this->postJson('/api/public/register-owner', [
            'owner_name' => 'Jamie Owner',
            'email' => 'jamie@example.test',
            'password' => 'owner-password',
            'restaurant_name' => 'Jamie Kitchen',
            'tagline' => 'Gather around good food',
            'phone' => '555-0131',
            'address' => '31 Oak Street, Austin',
        ])->assertCreated();
        $secondOwnerToken = $secondOwner->json('token');

        $manager = $this->withToken($firstOwnerToken)->postJson('/api/admin/users', [
            'name' => 'Taylor Manager',
            'email' => 'manager@example.test',
            'password' => 'manager-password',
            'role' => 'manager',
        ])->assertCreated();
        $managerId = $manager->json('id');
        $managerToken = $this->postJson('/api/auth/login', [
            'email' => 'manager@example.test',
            'password' => 'manager-password',
        ])->assertOk()->json('token');

        $staff = $this->withToken($firstOwnerToken)->postJson('/api/admin/users', [
            'name' => 'Taylor Staff',
            'email' => 'staff@example.test',
            'password' => 'staff-password',
            'role' => 'staff',
        ])->assertCreated();
        $staffId = $staff->json('id');
        $staffToken = $this->postJson('/api/auth/login', [
            'email' => 'staff@example.test',
            'password' => 'staff-password',
        ])->assertOk()->json('token');

        $this->withToken($firstOwnerToken)->getJson('/api/admin/users')
            ->assertOk()->assertJsonCount(2, 'users');
        $this->withToken($secondOwnerToken)->getJson('/api/admin/users')
            ->assertOk()->assertJsonCount(0, 'users');
        $this->withToken($secondOwnerToken)->patchJson('/api/admin/users/'.$managerId, [
            'name' => 'Cross Tenant Change',
        ])->assertNotFound();
        $this->withToken($managerToken)->getJson('/api/admin/users')->assertForbidden();

        $this->withToken($firstOwnerToken)->patchJson('/api/admin/users/'.$staffId, [
            'name' => 'Updated Staff',
            'email' => 'updated.staff@example.test',
            'role' => 'manager',
        ])->assertOk();
        $this->assertDatabaseHas('users', [
            'id' => $staffId,
            'restaurant_id' => $firstOwner->json('restaurant.id'),
            'name' => 'Updated Staff',
            'email' => 'updated.staff@example.test',
            'role' => 'manager',
        ]);

        $this->withToken($firstOwnerToken)->patchJson('/api/admin/users/'.$staffId, [
            'is_active' => false,
        ])->assertOk();
        $this->assertDatabaseMissing('api_tokens', ['user_id' => $staffId]);
        $this->withToken($staffToken)->getJson('/api/auth/me')->assertUnauthorized();

        $this->withToken($firstOwnerToken)->deleteJson('/api/admin/users/'.$staffId)->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $staffId]);
        $this->assertDatabaseHas('users', ['id' => $managerId, 'role' => 'manager']);
    }
}
