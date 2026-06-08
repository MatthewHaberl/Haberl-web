-- ================================================================
-- Migration 021: product_images seed
-- Verified image URLs sourced directly from manufacturer CDNs.
-- All status = 'pending_review' — admin approves to go live.
-- product_id = NULL → publish applies to all products matching
-- brand + ILIKE(product_family) via append_brand_image().
-- ================================================================

INSERT INTO product_images (brand, product_family, url, alt_text, source, notes, sort_order) VALUES

-- ================================================================
-- VICTRON ENERGY — victronenergy.com/upload/products|documents
-- ================================================================

-- Inverters / Inverter-Chargers
('Victron', 'MultiPlus-II',
 'https://www.victronenergy.com/upload/products/MultiPlus-II_nw.png',
 'Victron MultiPlus-II Inverter/Charger',
 'victronenergy.com', 'Official listing image — covers all MultiPlus-II voltages and powers', 0),

('Victron', 'MultiPlus-II GX',
 'https://www.victronenergy.com/upload/products/MultiPlus-II%20GX_nw.png',
 'Victron MultiPlus-II GX',
 'victronenergy.com', 'Official listing image — MultiPlus-II with built-in GX controller', 0),

('Victron', 'Quattro',
 'https://www.victronenergy.com/upload/documents/Quattro-12-3000-120-50-30_front_300dpi.jpg',
 'Victron Quattro Inverter/Charger',
 'victronenergy.com', 'Official product photo — Quattro 12V 3kVA front view', 0),

('Victron', 'Phoenix Inverter',
 'https://www.victronenergy.com/upload/products/Inverter%20compact.png',
 'Victron Phoenix Inverter Compact',
 'victronenergy.com', 'Official listing image', 0),

-- Solar Charge Controllers
('Victron', 'SmartSolar MPPT',
 'https://www.victronenergy.com/upload/products/smartsolar%20MPPT%2075%2015.png',
 'Victron SmartSolar MPPT Charge Controller',
 'victronenergy.com', 'Official listing image — covers all SmartSolar MPPT compact models', 0),

-- GX / Monitoring Devices
('Victron', 'Cerbo GX',
 'https://www.victronenergy.com/upload/products/Cerbo%20GX%20nw.png',
 'Victron Cerbo GX System Monitor',
 'victronenergy.com', 'Official listing image', 0),

('Victron', 'BMV-712',
 'https://www.victronenergy.com/upload/documents/BMV-712%20Smart.png',
 'Victron BMV-712 Smart Battery Monitor',
 'victronenergy.com', 'Official product photo', 0),

('Victron', 'BMV-700',
 'https://www.victronenergy.com/upload/documents/BMV-700_front_BAM010700000.jpg',
 'Victron BMV-700 Battery Monitor',
 'victronenergy.com', 'Official product photo', 0),

-- DC-DC Converters
('Victron', 'Orion-Tr Smart',
 'https://www.victronenergy.com/upload/documents/Orion-Tr%20Smart%2012-12-30%20%28front%29.png',
 'Victron Orion-Tr Smart DC-DC Charger',
 'victronenergy.com', 'Official product photo — Orion-Tr Smart 12/12-30 front view', 0),

-- Battery Chargers
('Victron', 'Blue Smart IP22',
 'https://www.victronenergy.com/upload/documents/Blue%20Smart%20IP22%20Charger%2012V%2015A%20%281%29%20230V%20%28front%29.png',
 'Victron Blue Smart IP22 Battery Charger',
 'victronenergy.com', 'Official product photo', 0),

('Victron', 'Phoenix Smart IP43',
 'https://www.victronenergy.com/upload/documents/Smart%20IP43%20Charger%2012V%2030A%201%2B1%20outputs%20%28front-angle%29.png',
 'Victron Phoenix Smart IP43 Battery Charger',
 'victronenergy.com', 'Official product photo — front angle', 0),

('Victron', 'Blue Smart IP65',
 'https://www.victronenergy.com/upload/products/Blue%20Smart%20IP65%20Charger%207A%20%28total%29%201.png',
 'Victron Blue Smart IP65 Battery Charger',
 'victronenergy.com', 'Official listing image', 0),

('Victron', 'Skylla',
 'https://www.victronenergy.com/upload/products/Skylla%20IP65new.png',
 'Victron Skylla IP65 Battery Charger',
 'victronenergy.com', 'Official listing image', 0),

-- EV Charging
('Victron', 'EV Charging Station',
 'https://www.victronenergy.com/upload/products/EV%20Charging%20Station%20NS.png',
 'Victron EV Charging Station NS',
 'victronenergy.com', 'Official listing image', 0),

-- ================================================================
-- JA SOLAR — ja-solar.com (EU/global CDN)
-- ================================================================
('JA Solar', 'JAM72D40',
 'https://ja-solar.com/fileadmin/_processed_/e/2/csm_JAM_72_D40_LB_frontal_vorne_1_ce831bd93f.webp',
 'JA Solar JAM72D40 N-Type Bifacial Panel',
 'ja-solar.com', 'Official product image — JAM72D40 LB front view', 0),

-- ================================================================
-- FREEDOMWON — freedomwon.co.za
-- ================================================================
('FreedomWon', 'eTower',
 'https://www.freedomwon.co.za/wp-content/uploads/eTower-Grouping-2-4-Stack-768x667.png',
 'FreedomWon eTower Lithium Battery',
 'freedomwon.co.za', 'Official product image — eTower 2–4 stack grouping', 0),

('FreedomWon', 'LiTE Home',
 'https://www.freedomwon.co.za/wp-content/uploads/LiTE-Home-10_8-view-2-1.webp',
 'FreedomWon LiTE Home 10/8kWh Battery',
 'freedomwon.co.za', 'Official product image — LiTE Home 10/8kWh view 2', 0),

-- ================================================================
-- DEYE — deyeinverter.com
-- ================================================================
('Deye', 'SUN-16K',
 'https://www.deyeinverter.com/deyeinverter/2025/01/16/sun-16k-sg04lp1.png',
 'Deye SUN-16K Single Phase Hybrid Inverter',
 'deyeinverter.com', 'Official product image from Deye product page', 0),

-- ================================================================
-- SOLIS — cmsdata.solisinverters.com
-- ================================================================
('Solis', 'S6-EH1P',
 'https://cmsdata.solisinverters.com/uploads/image/20230209/LU5Eelv7W2J8efw6kPyELQvEuIgQhUzAliRIXcpp.png',
 'Solis S6-EH1P Hybrid Inverter',
 'solisinverters.com', 'Official product image from S6-EH1P US product page', 0);
