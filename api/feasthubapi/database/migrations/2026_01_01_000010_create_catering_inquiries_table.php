<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('catering_inquiries');
    }
};
