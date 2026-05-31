-- ============================================================
-- Seed data for local development / testing
-- DO NOT run in production
-- ============================================================

-- Products
insert into public.products (slug, name, description, price, category, sku, stock_qty) values
('4mm-twin-earth-10m', '4mm Twin & Earth Cable — 10m roll', 'SANS-approved 4mm² twin and earth cable. 10m roll.', 28000, 'Cable', 'CAB-4TE-10', 50),
('20a-mcb', '20A MCB Single Pole', 'DIN rail mounted 20A single pole MCB. Schneider compatible.', 18500, 'Protection', 'MCB-20A-SP', 30),
('db-board-8way', 'DB Board 8-way Flush', '8-way flush-mounted DB board with blanks included.', 32000, 'Distribution', 'DB-8W-F', 20),
('solar-inverter-5kva', '5kVA Hybrid Solar Inverter', '5kVA hybrid inverter, MPPT 80A, 48V battery bank compatible.', 1250000, 'Solar', 'INV-5K-HYB', 5),
('lifepo4-100ah', 'LiFePO4 100Ah 48V Battery', '100Ah 48V lithium iron phosphate battery. BMS included.', 980000, 'Solar', 'BAT-LFP-100', 8);
