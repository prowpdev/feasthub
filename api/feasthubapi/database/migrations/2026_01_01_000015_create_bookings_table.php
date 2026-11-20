<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
