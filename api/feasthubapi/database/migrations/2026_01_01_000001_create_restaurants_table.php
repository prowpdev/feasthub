<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
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
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurants');
    }
};
