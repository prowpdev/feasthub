<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('food_items');
    }
};
