<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('catering_packages');
    }
};
