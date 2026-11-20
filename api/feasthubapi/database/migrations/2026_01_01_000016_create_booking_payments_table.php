<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_payments');
    }
};
