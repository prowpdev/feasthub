<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $email = trim((string) env('FEASTHUB_SUPERADMIN_EMAIL', ''));
        $password = (string) env('FEASTHUB_SUPERADMIN_PASSWORD', '');

        if ($email === '' && $password === '') {
            return;
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12) {
            throw new \InvalidArgumentException('Set a valid FEASTHUB_SUPERADMIN_EMAIL and a FEASTHUB_SUPERADMIN_PASSWORD of at least 12 characters.');
        }

        $existing = DB::table('users')->where('email', $email)->first();
        if ($existing) {
            if ($existing->role !== 'superadmin') {
                throw new \RuntimeException('The configured superadmin email is already assigned to a non-superadmin user.');
            }

            return;
        }

        DB::table('users')->insert([
            'name' => 'Platform Superadmin',
            'email' => $email,
            'password' => Hash::make($password),
            'role' => 'superadmin',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
