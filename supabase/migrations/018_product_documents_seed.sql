-- Migration 018: Product Documents Seed
-- Verified document URLs from web research (2026-06-05).
-- All entries start as pending_review — admin must approve to publish.
-- Sources: sigenergy.com/en/support/download and jasolar.com
-- Victron, Sunsynk, Sungrow, Aiko, LONGi, Trina, FreedomWon, IES, Eenovance,
-- Deye, Solis, LuxPower docs are in wiki/resources/products/ — add via admin UI.

INSERT INTO product_documents (brand, product_family, doc_type, title, url, status, source, notes) VALUES

-- ============================================================
-- SIGENERGY — 26 verified URLs from sigenergy.com/en/support/download
-- ============================================================

-- SP Inverters
('Sigenergy', 'SigenStor SP Inverter', 'datasheet', 'SigenStor Home Datasheet',
 'https://www.sigenergy.com/en_download/1693469958902152.pdf', 'pending_review', 'sigenergy.com',
 'Original SigenStor SP home series'),

('Sigenergy', 'SigenStor SP Inverter', 'datasheet', 'Sigen Hybrid SP (3–12 kW) Datasheet',
 'https://www.sigenergy.com/en_download/1729071058291440.pdf', 'pending_review', 'sigenergy.com',
 'Covers 5kW, 6kW, 8kW, 10kW, 12kW SP models'),

('Sigenergy', 'SigenStor SP Inverter', 'datasheet', 'Sigen Hybrid SP2 Datasheet (3–6 kW)',
 'https://www.sigenergy.com/en_download/1743992001660270.pdf', 'pending_review', 'sigenergy.com',
 'Second generation SP2 series'),

('Sigenergy', 'SigenStor SP Inverter', 'manual', 'SigenStor Home User Manual',
 'https://www.sigenergy.com/en_download/1735006360164536.pdf', 'pending_review', 'sigenergy.com',
 'User manual for SP home series inverters'),

-- TP Inverters (Three Phase)
('Sigenergy', 'SigenStor 3P Inverter', 'datasheet', 'Sigen Hybrid TP Datasheet',
 'https://www.sigenergy.com/en_download/1693469427819336.pdf', 'pending_review', 'sigenergy.com',
 'Three-phase SigenStor series'),

('Sigenergy', 'SigenStor 3P Inverter', 'datasheet', 'Sigen Hybrid TP2 Datasheet (3–12 kW)',
 'https://www.sigenergy.com/en_download/1742440692263021.pdf', 'pending_review', 'sigenergy.com',
 'Second generation TP2 series 3–12kW'),

('Sigenergy', 'SigenStor 3P Inverter', 'installation_guide', 'Sigen Hybrid TP2 Installation Guide',
 'https://www.sigenergy.com/en_download/1753418920366806.pdf', 'pending_review', 'sigenergy.com', NULL),

('Sigenergy', 'SigenStor 3P Inverter', 'manual', 'SigenStor 5T–30T User Manual',
 'https://www.sigenergy.com/en_download/1729220554860537.pdf', 'pending_review', 'sigenergy.com',
 'Covers 12kW, 15kW, 20kW, 25kW, 30kW three-phase models'),

-- Batteries
('Sigenergy', 'SigenStor Battery', 'datasheet', 'SigenStor Battery Datasheet (314 Ah)',
 'https://www.sigenergy.com/en_download/1758200906743690.pdf', 'pending_review', 'sigenergy.com',
 'Latest generation 314Ah cells'),

('Sigenergy', 'SigenStor Battery', 'datasheet', 'SigenStor Battery Datasheet (280 Ah)',
 'https://www.sigenergy.com/en_download/1745981044645769.pdf', 'pending_review', 'sigenergy.com',
 'Previous generation 280Ah cells — covers 6.02kWh, 8.06kWh, 9.04kWh'),

-- SigenStack
('Sigenergy', 'SigenStack Battery', 'installation_guide', 'SigenStack Installation Guide',
 'https://www.sigenergy.com/en_download/1745725702340992.pdf', 'pending_review', 'sigenergy.com',
 'Covers SigenStack 12kWh and mounting accessories'),

('Sigenergy', 'SigenStack Battery', 'other', 'SigenStack Brochure',
 'https://www.sigenergy.com/en_download/1762244811883181.pdf', 'pending_review', 'sigenergy.com',
 'Commercial SigenStack product brochure'),

-- EV Chargers
('Sigenergy', 'Sigen EV AC Charger', 'datasheet', 'Sigen EV AC Charger Datasheet',
 'https://www.sigenergy.com/en_download/1693469297981431.pdf', 'pending_review', 'sigenergy.com',
 'Covers 7kW, 11kW, 22kW AC charger variants'),

('Sigenergy', 'Sigen EV AC Charger', 'manual', 'Sigen EV AC Charger User Manual',
 'https://www.sigenergy.com/en_download/1719469448125563.pdf', 'pending_review', 'sigenergy.com', NULL),

('Sigenergy', 'Sigen EV DC Charging Module', 'datasheet', 'Sigen EV DC Charging Module Datasheet',
 'https://www.sigenergy.com/en_download/1745981434747419.pdf', 'pending_review', 'sigenergy.com',
 'Covers DC 12kW and 25kW CCS2 modules'),

-- Gateways
('Sigenergy', 'Sigen Home Gateway', 'datasheet', 'Sigen Energy Gateway Home Datasheet',
 'https://www.sigenergy.com/en_download/1750236411485099.pdf', 'pending_review', 'sigenergy.com',
 'SP Home Gateway 1x inverter, 12kW max'),

('Sigenergy', 'Sigen Home Max Gateway', 'datasheet', 'Sigen Gateway HomeMax TP Datasheet',
 'https://www.sigenergy.com/en_download/1694161796647109.pdf', 'pending_review', 'sigenergy.com',
 'TP Home Max Gateway 2x inverter variants'),

('Sigenergy', 'Sigen Home Gateway', 'installation_guide', 'Sigen Gateway SP Installation Guide',
 'https://www.sigenergy.com/en_download/1741171426439428.pdf', 'pending_review', 'sigenergy.com', NULL),

('Sigenergy', 'Sigen Home Max Gateway', 'installation_guide', 'Sigen Gateway HomeMax SP Installation Guide',
 'https://www.sigenergy.com/en_download/1729216501785372.pdf', 'pending_review', 'sigenergy.com', NULL),

('Sigenergy', 'Sigen Commercial Gateway', 'manual', 'Sigen C&I Gateway Series User Manual',
 'https://www.sigenergy.com/en_download/1745396111487259.pdf', 'pending_review', 'sigenergy.com',
 'Covers commercial gateways for 6x–50x inverter configurations'),

-- Monitoring / Power Meters
('Sigenergy', 'Sigen Power Sensor', 'datasheet', 'Sigen Power Sensor Datasheet',
 'https://www.sigenergy.com/en_download/1693469475467033.pdf', 'pending_review', 'sigenergy.com',
 'Original power sensor'),

('Sigenergy', 'Sigen Power Sensor', 'datasheet', 'Sigen Power Sensor Datasheet (2025)',
 'https://www.sigenergy.com/en_download/1746004491280323.pdf', 'pending_review', 'sigenergy.com',
 '2025 updated version — 3-phase without CT, 173–480VAC'),

('Sigenergy', 'Sigen Communication Module', 'datasheet', 'Sigen Communication Module Datasheet',
 'https://www.sigenergy.com/en_download/1693470018139874.pdf', 'pending_review', 'sigenergy.com', NULL),

-- App Manuals
('Sigenergy', 'mySigen App', 'manual', 'mySigen App User Manual v05',
 'https://www.sigenergy.com/en_download/1748413421183055.pdf', 'pending_review', 'sigenergy.com',
 'Customer-facing app manual'),

('Sigenergy', 'mySigen App', 'manual', 'mySigen Installer Manual v03',
 'https://www.sigenergy.com/en_download/1728639199773064.pdf', 'pending_review', 'sigenergy.com',
 'Installer / commissioning manual'),

('Sigenergy', 'SigenStor 3P Inverter', 'other', 'Sigen Modbus Protocol V2.7',
 'https://www.sigenergy.com/us_download/1755488219226583.pdf', 'pending_review', 'sigenergy.com',
 'Technical Modbus protocol document for integrators'),

-- ============================================================
-- JA SOLAR — verified URLs from jasolar.com
-- ============================================================

('JA Solar', 'JAM72D42 Series', 'datasheet', 'JAM72D42 585–650W N-Type Bifacial Datasheet (Jan 2025)',
 'https://www.jasolar.com/uploadfile/fujian/2025/0121/2fd5fc873399dd6.pdf', 'pending_review', 'jasolar.com',
 'Covers 585W and 645W N-Type bifacial models in our catalogue'),

('JA Solar', 'JAM66D45 Series', 'datasheet', 'JAM66D45-620W 132-Cell N-Type Datasheet (Nov 2024)',
 'https://www.jasolar.com/uploadfile/fujian/2024/1120/92a6022a1d9a311.pdf', 'pending_review', 'jasolar.com',
 'JA Solar 620W 132-cell N-Type — our 620W SKU');
