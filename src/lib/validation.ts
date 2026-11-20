import { z } from 'zod';

export const inquiryFormSchema = z.object({
  // Step 1: Event Information
  event_type_id: z.number().nullable().optional(),
  event_type_name: z.string().min(2, 'Please select an event type'),
  event_date: z.string().min(1, 'Please choose an event date'),
  start_time: z.string().min(1, 'Please select a start time'),
  end_time: z.string().optional(),
  guest_count: z.coerce.number().int().min(10, 'Minimum catering count is 10 guests').max(5000, 'Maximum online estimate is 5,000 guests'),
  event_venue: z.string().min(2, 'Please enter your venue name or residence'),
  delivery_address: z.string().min(6, 'Please provide the complete street delivery address'),
  venue_setting: z.enum(['indoor', 'outdoor', 'unspecified']).default('unspecified'),

  // Step 2: Food Preferences
  selected_package_id: z.number().nullable().optional(),
  dietary_requirements: z.string().max(600).optional(),
  food_allergies: z.string().max(600).optional(),
  special_instructions: z.string().max(1500).optional(),
  additional_services: z.array(z.string()).default([]),

  // Step 3: Customer Information
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string().min(7, 'Please enter a valid contact phone number'),
  email: z.string().email('Please enter a valid email address'),
  company_name: z.string().max(150).optional(),
  preferred_contact: z.enum(['Phone', 'Email', 'Messenger']).default('Email'),

  // Step 4: Consent & Anti-spam
  privacy_consent: z.boolean().refine((val) => val === true, {
    message: 'You must accept the privacy notice to submit your inquiry',
  }),
  captcha_checked: z.boolean().refine((val) => val === true, {
    message: 'Please confirm the anti-spam verification check',
  }),
  website_honeypot: z.string().max(0).optional(),
});

export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;

export const trackLookupSchema = z.object({
  reference: z.string().min(5, 'Enter your inquiry reference (e.g. INQ-MS-2026-1042)'),
  contact: z.string().min(4, 'Enter the email address or phone number used on your inquiry'),
});

export type TrackLookupValues = z.infer<typeof trackLookupSchema>;

export const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid staff email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export const ownerRegisterSchema = z.object({
  owner_name: z.string().min(2, 'Your full name is required'),
  email: z.string().email('Enter a valid business email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  restaurant_name: z.string().min(2, 'Restaurant brand name is required'),
  slug: z.string().max(60).optional(),
  tagline: z.string().min(3, 'Enter a short tagline for your catering kitchen'),
  phone: z.string().min(6, 'Business phone number is required'),
  address: z.string().min(5, 'Kitchen or headquarters address is required'),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Select a valid hex accent color'),
  hero_headline: z.string().min(3, 'Hero headline is required'),
  hero_subheadline: z.string().min(5, 'Supporting hero copy is required'),
  hero_image_url: z.string().min(5, 'Select a hero banner image'),
  about_title: z.string().min(2, 'About section title is required'),
  about_description: z.string().min(5, 'Enter a brief story for your restaurant'),
});

export type OwnerRegisterValues = z.infer<typeof ownerRegisterSchema>;
