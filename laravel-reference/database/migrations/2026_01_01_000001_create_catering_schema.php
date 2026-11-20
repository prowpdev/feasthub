<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('restaurants', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->string('tagline');
            $table->string('brand_color', 20)->default('#1B4332');
            $table->string('email');
            $table->string('phone', 40);
            $table->text('address');
            $table->string('logo_text');
            $table->decimal('tax_rate', 5, 3)->default(8.500);
            $table->decimal('service_charge_rate', 5, 2)->default(15.00);
            $table->string('hero_headline')->default('Make Every Occasion Delicious');
            $table->text('hero_subheadline');
            $table->string('hero_image_url');
            $table->string('about_title');
            $table->text('about_description');
            $table->string('cta_primary_text')->default('Request a Catering Quote');
            $table->string('cta_secondary_text')->default('Explore Catering Packages');
            $table->boolean('is_published')->default(true);
            $table->timestamps();
        });

        Schema::create('restaurant_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('price_type', ['flat', 'per_person', 'included', 'custom'])->default('flat');
            $table->decimal('price', 10, 2)->default(0);
            $table->boolean('is_available')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->enum('role', ['superadmin', 'owner', 'manager', 'staff'])->default('staff');
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('full_name');
            $table->string('email');
            $table->string('phone', 40);
            $table->string('company_name')->nullable();
            $table->enum('preferred_contact', ['Phone', 'Email', 'Messenger'])->default('Email');
            $table->timestamps();
            $table->index(['restaurant_id', 'email']);
        });

        Schema::create('event_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->text('description');
            $table->string('image_url');
            $table->integer('sort_order')->default(0);
        });

        Schema::create('catering_packages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description');
            $table->enum('pricing_type', ['per_person', 'flat_package'])->default('per_person');
            $table->decimal('price', 10, 2);
            $table->unsignedInteger('min_guests')->default(20);
            $table->unsignedInteger('max_guests')->nullable();
            $table->json('inclusions_json');
            $table->json('addons_json');
            $table->string('image_url');
            $table->boolean('is_available')->default(true);
            $table->boolean('is_seasonal')->default(false);
            $table->string('promo_label')->nullable();
            $table->timestamps();
        });

        Schema::create('food_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->integer('sort_order')->default(0);
        });

        Schema::create('food_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('food_categories')->cascadeOnDelete();
            $table->string('name');
            $table->text('description');
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->string('price_unit', 80)->default('per tray');
            $table->unsignedInteger('min_order_qty')->default(1);
            $table->string('dietary_tags')->default('');
            $table->string('allergens')->default('');
            $table->string('image_url');
            $table->boolean('is_available')->default(true);
            $table->json('addons_json');
            $table->timestamps();
        });

        Schema::create('package_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('package_id')->constrained('catering_packages')->cascadeOnDelete();
            $table->foreignId('food_item_id')->constrained('food_items')->cascadeOnDelete();
            $table->decimal('default_servings_per_guest', 5, 2)->default(1.00);
        });

        Schema::create('catering_inquiries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('reference_number')->unique();
            $table->foreignId('event_type_id')->nullable()->constrained('event_types')->nullOnDelete();
            $table->string('event_type_name');
            $table->date('event_date');
            $table->string('start_time', 20);
            $table->string('end_time', 20)->nullable();
            $table->unsignedInteger('guest_count');
            $table->string('event_venue');
            $table->text('delivery_address');
            $table->enum('venue_setting', ['indoor', 'outdoor', 'unspecified'])->default('unspecified');
            $table->foreignId('selected_package_id')->nullable()->constrained('catering_packages')->nullOnDelete();
            $table->string('selected_package_name')->nullable();
            $table->text('dietary_requirements')->nullable();
            $table->text('food_allergies')->nullable();
            $table->text('special_instructions')->nullable();
            $table->json('additional_services_json');
            $table->decimal('estimated_total', 12, 2)->nullable();
            $table->enum('status', [
                'Request Received',
                'Under Review',
                'Quotation Sent',
                'Awaiting Customer Confirmation',
                'Confirmed',
                'Completed',
                'Cancelled',
            ])->default('Request Received');
            $table->foreignId('assigned_staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('assigned_staff_name')->nullable();
            $table->boolean('privacy_consent')->default(true);
            $table->timestamps();
            $table->index(['restaurant_id', 'status', 'event_date']);
        });

        Schema::create('inquiry_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inquiry_id')->constrained('catering_inquiries')->cascadeOnDelete();
            $table->foreignId('food_item_id')->nullable()->constrained('food_items')->nullOnDelete();
            $table->string('item_name');
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->decimal('line_total', 12, 2)->nullable();
            $table->text('notes')->nullable();
        });

        Schema::create('inquiry_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inquiry_id')->constrained('catering_inquiries')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('author_name');
            $table->text('note');
            $table->boolean('is_internal')->default(true);
            $table->timestamps();
        });

        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inquiry_id')->constrained('catering_inquiries')->cascadeOnDelete();
            $table->string('quotation_number')->unique();
            $table->unsignedInteger('version')->default(1);
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('delivery_fee', 10, 2)->default(0);
            $table->decimal('service_charge', 10, 2)->default(0);
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->decimal('tax_amount', 10, 2)->default(0);
            $table->decimal('grand_total', 12, 2)->default(0);
            $table->text('payment_terms');
            $table->text('terms_conditions');
            $table->date('valid_until');
            $table->enum('status', ['draft', 'sent', 'accepted', 'declined', 'expired'])->default('draft');
            $table->string('created_by_name');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('quotation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')->constrained('quotations')->cascadeOnDelete();
            $table->enum('item_type', ['package', 'food_item', 'service', 'custom'])->default('custom');
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
        });

        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inquiry_id')->constrained('catering_inquiries')->cascadeOnDelete();
            $table->foreignId('quotation_id')->nullable()->constrained('quotations')->nullOnDelete();
            $table->string('booking_reference')->unique();
            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone', 40);
            $table->date('event_date');
            $table->string('event_venue');
            $table->unsignedInteger('guest_count');
            $table->text('confirmed_menu_summary');
            $table->decimal('total_amount', 12, 2);
            $table->decimal('deposit_amount', 12, 2);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->decimal('balance_due', 12, 2);
            $table->enum('payment_status', ['Unpaid', 'Deposit Paid', 'Partially Paid', 'Fully Paid'])->default('Unpaid');
            $table->enum('booking_status', ['Confirmed', 'In Preparation', 'Completed', 'Cancelled'])->default('Confirmed');
            $table->timestamps();
        });

        Schema::create('booking_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('payment_method', 80);
            $table->string('reference_code', 120);
            $table->string('recorded_by_name');
            $table->text('notes')->nullable();
            $table->timestamp('paid_at')->useCurrent();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->enum('recipient_type', ['customer', 'staff']);
            $table->string('recipient_contact');
            $table->enum('channel', ['email', 'sms', 'messenger'])->default('email');
            $table->string('event_key', 80);
            $table->string('subject');
            $table->text('body');
            $table->enum('status', ['queued', 'sent', 'failed'])->default('sent');
            $table->string('related_reference')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('booking_payments');
        Schema::dropIfExists('bookings');
        Schema::dropIfExists('quotation_items');
        Schema::dropIfExists('quotations');
        Schema::dropIfExists('inquiry_notes');
        Schema::dropIfExists('inquiry_items');
        Schema::dropIfExists('catering_inquiries');
        Schema::dropIfExists('package_items');
        Schema::dropIfExists('food_items');
        Schema::dropIfExists('food_categories');
        Schema::dropIfExists('catering_packages');
        Schema::dropIfExists('event_types');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('users');
        Schema::dropIfExists('restaurant_services');
        Schema::dropIfExists('restaurants');
    }
};
