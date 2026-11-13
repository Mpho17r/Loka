import type { Product, Service } from '../types';

export const CITIES = ['Thohoyandou', 'Polokwane', 'Johannesburg', 'Pretoria', 'Cape Town', 'Durban'];
export const VIEWER_CITY = 'Thohoyandou'; // demo: would come from device location or profile

export const PRODUCT_CATEGORIES = ['All', 'Electronics', 'Home', 'Fashion', 'Food & Farm', 'Tools'];
export const SERVICE_CATEGORIES = ['All', 'Home services', 'Digital', 'Transport', 'Business admin', 'Education', 'Events'];

// Sample data for the prototype only. Replace with backend queries.
export const PRODUCTS: Product[] = [
  {
    id: 'p1', title: 'Samsung Galaxy A15, 128GB', price: 2899, condition: 'New', category: 'Electronics',
    city: 'Thohoyandou', seller: 'Venda Mobile Hub', verification: 'business', emoji: '📱',
    description: 'Sealed box with 12-month warranty. Cash or EFT on collection. Delivery within Thohoyandou available.',
  },
  {
    id: 'p2', title: 'Three-seater fabric couch', price: 1850, condition: 'Second-hand', category: 'Home',
    city: 'Polokwane', seller: 'Thabo M.', verification: 'identity', emoji: '🛋️',
    description: 'Good condition, grey. Buyer collects. Small mark on one armrest (photo available).',
  },
  {
    id: 'p3', title: 'Handwoven Venda basket set (3)', price: 420, condition: 'New', category: 'Home',
    city: 'Thohoyandou', seller: 'Mashudu Crafts', verification: 'business', emoji: '🧺',
    description: 'Set of three handwoven baskets in natural dyes. Made to order in 3 days.',
  },
  {
    id: 'p4', title: 'Cordless drill, 18V with 2 batteries', price: 1250, condition: 'Second-hand', category: 'Tools',
    city: 'Johannesburg', seller: 'Sipho K.', verification: 'identity', emoji: '🔧',
    description: 'Used for one season. Includes charger and carry case.',
  },
  {
    id: 'p5', title: 'Fresh mangoes, 10kg box', price: 280, condition: 'New', category: 'Food & Farm',
    city: 'Thohoyandou', seller: 'Tshivhase Farm', verification: 'business', emoji: '🥭',
    description: 'Seasonal Limpopo mangoes, picked to order. Bulk pricing for 5+ boxes.',
  },
  {
    id: 'p6', title: 'Ladies two-piece shweshwe dress', price: 650, condition: 'New', category: 'Fashion',
    city: 'Pretoria', seller: 'Nomsa Designs', verification: 'unverified', emoji: '👗',
    description: 'Made to measure. Allow 7 days. Sizes 32 to 44.',
  },
  {
    id: 'p7', title: 'HP 250 G9 laptop, 8GB / 256GB', price: 5200, condition: 'Second-hand', category: 'Electronics',
    city: 'Cape Town', seller: 'ReTech Cape', verification: 'business', emoji: '💻',
    description: 'Refurbished with 6-month seller warranty. Windows 11 installed.',
  },
];

export const SERVICES: Service[] = [
  {
    id: 's1', title: 'Plumbing and leak repairs', category: 'Home services', provider: 'Rendani Plumbing',
    verification: 'business', city: 'Thohoyandou', pricingModel: 'Quotation', delivery: 'On-site',
    rating: 4.7, jobs: 86, emoji: '🚰',
    description: 'Burst pipes, geyser installs, blocked drains and bathroom fittings. Call-outs across Vhembe.',
  },
  {
    id: 's2', title: 'Logo and brand design', category: 'Digital', provider: 'Lerato Creative',
    verification: 'identity', city: 'Johannesburg', pricingModel: 'Fixed price', fromPrice: 1500, delivery: 'Remote',
    rating: 4.9, jobs: 142, emoji: '🎨',
    description: 'Logo, colour palette and social media kit delivered in 5 days. Two revision rounds included.',
  },
  {
    id: 's3', title: 'CV writing and job application pack', category: 'Business admin', provider: 'Loka Direct',
    verification: 'business', city: 'Polokwane', pricingModel: 'Fixed price', fromPrice: 250, delivery: 'Remote',
    rating: 4.8, jobs: 310, emoji: '📄',
    description: 'Loka sells this service under its own brand. Professional CV and cover letter within 48 hours.',
  },
  {
    id: 's4', title: 'Furniture moving and local delivery', category: 'Transport', provider: 'Khathu Movers',
    verification: 'business', city: 'Thohoyandou', pricingModel: 'Quotation', delivery: 'On-site',
    rating: 4.5, jobs: 64, emoji: '🚚',
    description: 'Bakkie and two-person crew for local moves and furniture delivery.',
  },
  {
    id: 's5', title: 'Maths and science tutoring (Grade 8 to 12)', category: 'Education', provider: 'Ndivhuwo T.',
    verification: 'identity', city: 'Thohoyandou', pricingModel: 'Hourly', fromPrice: 180, delivery: 'Both',
    rating: 4.9, jobs: 38, emoji: '📚',
    description: 'Qualified teacher. In-person in Thohoyandou or online anywhere. First 30 minutes free.',
  },
  {
    id: 's6', title: 'Website for small businesses', category: 'Digital', provider: 'Loka Direct',
    verification: 'business', city: 'Pretoria', pricingModel: 'Quotation', delivery: 'Remote',
    rating: 4.6, jobs: 52, emoji: '🌐',
    description: 'Simple mobile-friendly business sites built by the Loka team. Quotation within one working day.',
  },
  {
    id: 's7', title: 'Wedding and event catering', category: 'Events', provider: 'Mutshidzi Catering',
    verification: 'business', city: 'Polokwane', pricingModel: 'Quotation', delivery: 'On-site',
    rating: 4.4, jobs: 29, emoji: '🍲',
    description: 'Traditional and modern menus for 30 to 300 guests, including serving staff.',
  },
];
