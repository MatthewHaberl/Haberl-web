-- Migration 019: Product Documents Seed — Extended Brands
-- Victron, Sunsynk, Sungrow, Deye, Solis, LuxPower, JA Solar (extra),
-- Aiko, LONGi, Trina, FreedomWon, BSL, Eenovance, IES, Photon, Victron AGM
-- All entries start as pending_review — admin must approve to publish.
-- Sources: wiki/resources/products/ research session 2026-06-05.
-- Direct-PDF URLs only; support-portal page links excluded.

INSERT INTO product_documents (brand, product_family, doc_type, title, url, status, source, notes) VALUES

-- ============================================================
-- VICTRON ENERGY — Cross-product references
-- ============================================================

('Victron', 'General Reference', 'wiring_diagram', 'The Wiring Unlimited Book',
 'https://www.victronenergy.com/upload/documents/The_Wiring_Unlimited_book/43562-Wiring_Unlimited-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Wiring best practices across all Victron products'),

('Victron', 'General Reference', 'wiring_diagram', 'VE.Bus Panel Wiring Diagram',
 'https://www.victronenergy.com/upload/documents/WD-Wiring-diagram-for-a-VE-bus-panel.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — MultiPlus Inverter/Charger
-- ============================================================

('Victron', 'MultiPlus Inverter/Charger', 'datasheet', 'MultiPlus Inverter/Charger 800VA–5kVA Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-MultiPlus-inverter-charger-800VA-5kVA-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus 12V (800W–3000W), 24V, 48V full range; also MultiPlus Compact'),

('Victron', 'MultiPlus Inverter/Charger', 'manual', 'MultiPlus 3kVA 230V Installation & User Manual',
 'https://www.victronenergy.com/upload/documents/Manual-MultiPlus-3k-230V-16A-50A-(firmware-xxxx4xx)-EN-NL-FR-DE-ES-SE.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus 12/3000, 24/3000, 48/3000 (230V); firmware xxxx4xx+'),

('Victron', 'MultiPlus Inverter/Charger', 'manual', 'MultiPlus 2kVA 230V Manual',
 'https://www.victronenergy.com/upload/documents/MultiPlus_2kVA_230V/24547-MultiPlus_2kVA-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus 12/2000, 24/2000 (230V)'),

('Victron', 'MultiPlus Inverter/Charger', 'installation_guide', 'Quick Install Guide — MultiPlus 12V/24V/48V 3000VA',
 'https://www.victronenergy.com/upload/documents/Quick-Install-Guide-MultiPlus-12V-24V-48V-3000VA-50A-EN_outlines.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'MultiPlus Compact', 'installation_guide', 'Quick Install Guide — Compact MultiPlus 12V/24V 2000VA',
 'https://www.victronenergy.com/upload/documents/Quick-Install-Guide-Compact-Multiplus-12V-24V-2000VA-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus Compact 12/2000, 24/2000'),

-- ============================================================
-- VICTRON — MultiPlus-II Inverter/Charger
-- ============================================================

('Victron', 'MultiPlus-II Inverter/Charger', 'datasheet', 'MultiPlus-II Inverter/Charger 230V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-MultiPlus-II-inverter-charger-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus-II 12/3000, 24/3000, 48/3000, 48/5000 (230V)'),

('Victron', 'MultiPlus-II Inverter/Charger', 'datasheet', 'MultiPlus-II GX Inverter/Charger Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-MultiPlus-II-GX-inverter-charger-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus-II 48/3000 GX, 48/5000 GX'),

('Victron', 'MultiPlus-II Inverter/Charger', 'datasheet', 'MultiPlus-II 8k/10k/15k Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-MultiPlus-II-inverter-charger-8k-10k-15k-AU-EN-AUS.pdf',
 'pending_review', 'victronenergy.com', 'Covers MultiPlus-II 48/8000, 48/10000, 48/15000'),

('Victron', 'MultiPlus-II Inverter/Charger', 'manual', 'MultiPlus-II 230V Installation & User Manual (Rev 13)',
 'https://www.victronenergy.com/upload/documents/MultiPlus-II_230V/32424-MultiPlus-II___Quattro-II-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'All MultiPlus-II 230V models incl. 48/8000, 48/10000, 48/15000; Rev 13 May 2025'),

('Victron', 'MultiPlus-II Inverter/Charger', 'manual', 'MultiPlus-II GX Manual (Rev 12)',
 'https://www.victronenergy.com/upload/documents/MultiPlus-II_GX/2983-MultiPlus-II_GX-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'MultiPlus-II 48/3000 GX, 48/5000 GX; Rev 12 Aug 2024'),

('Victron', 'MultiPlus-II Inverter/Charger', 'installation_guide', 'Quick Install Guide — MultiPlus-II 24V/48V 3000VA & 48V 5000VA',
 'https://www.victronenergy.com/upload/documents/Quick-Install-Guide-MultiPlus-II-24V48V-3000VA-48V-5000VA-230Vac-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'MultiPlus-II Inverter/Charger', 'certification', 'IEC 62477 Certificate — MultiPlus-II 48V 8kVA/10kVA/15kVA 230V',
 'https://www.victronenergy.com/upload/documents/Certificate-IEC-62477-MultiPlus-II--48V-8kVA,-10kVA-and-15kVA-230V.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'MultiPlus-II Inverter/Charger', 'certification', 'EU Declaration of Conformity — MultiPlus-II (GX) 3k–15k',
 'https://www.victronenergy.com/upload/documents/MultiPlus-II-(GX)-3k-5k-8k-10k-15k-2024-02-12.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — Quattro Inverter/Charger
-- ============================================================

('Victron', 'Quattro Inverter/Charger', 'datasheet', 'Quattro Inverter/Charger 3kVA–15kVA Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Quattro-3kVA-15kVA-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers Quattro 24/5000, 24/8000, 48/5000, 48/8000, 48/10000, 48/15000'),

('Victron', 'Quattro Inverter/Charger', 'manual', 'Quattro-II 230V Manual (Rev 04)',
 'https://www.victronenergy.com/upload/documents/Quattro-II_230V/32424-MultiPlus-II___Quattro-II-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Quattro-II range; Rev 04 May 2025'),

('Victron', 'Quattro Inverter/Charger', 'installation_guide', 'Quick Install Guide — Quattro 24V/48V 5000VA 230Vac',
 'https://www.victronenergy.com/upload/documents/Quick-Install-Guide-Quattro-24V-48V-5000VA-230Vac-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — Phoenix Inverter VE.Direct
-- ============================================================

('Victron', 'Phoenix Inverter VE.Direct', 'datasheet', 'Inverter VE.Direct 250VA–1600VA Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Inverter-VE.Direct-250VA-1600VA-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Phoenix Inverter VE.Direct 12/250–12/1200, 24/250–24/500, 48/375'),

('Victron', 'Phoenix Inverter VE.Direct', 'manual', 'Inverter VE.Direct 230V Manual HW15 (Rev 03)',
 'https://www.victronenergy.com/upload/documents/Inverter_VE.Direct_230V_-_HW15/106668-Inverter_VE_Direct__Smart_and_SUN-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'All VE.Direct inverter 230V models 250VA–1200VA; Rev 03 Apr 2026'),

('Victron', 'Phoenix Inverter VE.Direct', 'drawing', 'Dimensions — Phoenix Inverter 350',
 'https://www.victronenergy.com/upload/documents/Dimensions-Phoenix-Inverter-350.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — Phoenix Inverter Smart
-- ============================================================

('Victron', 'Phoenix Inverter Smart', 'datasheet', 'Inverter Smart 1600VA–5000VA Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Inverter-Smart-1600VA-5000VA-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Phoenix Inverter Smart 12/2000, 12/3000, 24/3000, 48/3000'),

('Victron', 'Phoenix Inverter Smart', 'manual', 'Inverter Smart Manual (Rev 02)',
 'https://www.victronenergy.com/upload/documents/Inverter_Smart/106668-Inverter_VE_Direct__Smart_and_SUN-pdf-en.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Phoenix Inverter Smart', '3d_model', 'Phoenix Inverter Smart 12V 3000VA — 3D Model',
 'https://www.victronenergy.com/upload/documents/Phoenix-Inverter-12V-3000VA-Smart-(3D).PDF',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — EasySolar-II GX
-- ============================================================

('Victron', 'EasySolar-II GX', 'datasheet', 'EasySolar-II GX Datasheet (24V/48V 3kVA, 48V 5kVA)',
 'https://www.victronenergy.com/upload/documents/Datasheet-EasySolar-II-24V-48V-3kVA-48V-5kVA-MPPT-250-70-100-GX-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers EasySolar-II GX 24/3000, 48/3000, 48/5000'),

('Victron', 'EasySolar-II GX', 'manual', 'EasySolar-II GX Product Manual',
 'https://www.victronenergy.com/upload/documents/EasySolar-II_GX/11230-EasySolar-II_GX-pdf-en.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — Multi RS Solar
-- ============================================================

('Victron', 'Multi RS Solar', 'datasheet', 'Multi RS Solar 48/6000/100 Hybrid Inverter Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Multi-RS-Solar-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Multi RS Solar', 'manual', 'Multi RS Solar Manual (Rev 18)',
 'https://www.victronenergy.com/upload/documents/Multi_RS_Solar/62787-Multi_RS_Solar-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 18 Mar 2026'),

('Victron', 'Inverter RS Smart Solar', 'datasheet', 'Inverter RS Smart Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Inverter-RS-Smart-EN.pdf',
 'pending_review', 'victronenergy.com', 'Inverter RS Smart Solar 48/6000'),

('Victron', 'Inverter RS Smart Solar', 'manual', 'Inverter RS Smart Solar Manual (Rev 12)',
 'https://www.victronenergy.com/upload/documents/Inverter_RS_Smart_Solar/11676-Inverter_RS_Smart_Solar-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 12 Jun 2025'),

-- ============================================================
-- VICTRON — SmartSolar MPPT Charge Controllers
-- ============================================================

('Victron', 'SmartSolar MPPT 75/10–100/20', 'datasheet', 'SmartSolar MPPT 75/10, 75/15, 100/15, 100/20-48V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-75-10,-75-15,-100-15,-100-20_48V-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'SmartSolar MPPT 75/10–100/20', 'manual', 'SmartSolar MPPT 75/10 up to 100/20 Manual (Rev 10)',
 'https://www.victronenergy.com/upload/documents/Manual_SmartSolar_MPPT_75-10_up_to_100-20/29694-MPPT_solar_charger_manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 10 Feb 2026'),

('Victron', 'SmartSolar MPPT 100/30–100/50', 'datasheet', 'SmartSolar MPPT 100/30 & 100/50 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-100-30-&-100-50-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'SmartSolar MPPT 100/30–100/50', 'manual', 'SmartSolar MPPT 100/30 & 100/50 Manual (Rev 07)',
 'https://www.victronenergy.com/upload/documents/Manual_SmartSolar_MPPT_100-30__100-50/29694-MPPT_solar_charger_manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 07 Aug 2024'),

('Victron', 'SmartSolar MPPT 150/35–150/45', 'datasheet', 'SmartSolar MPPT 150/35 & 150/45 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-150-35-&-150-45-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'SmartSolar MPPT 150/60–250/70', 'datasheet', 'SmartSolar MPPT 150/60 & 150/70 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-150-60-&-150-70-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers SmartSolar MPPT 150/60-Tr, 150/60-MC4, 150/70-Tr'),

('Victron', 'SmartSolar MPPT 150/60–250/70', 'datasheet', 'SmartSolar MPPT 250/60 & 250/70 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-250-60-and-250-70-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'SmartSolar MPPT 150/60–250/70', 'manual', 'SmartSolar MPPT 150/60 up to 250/70 Manual (Rev 09)',
 'https://www.victronenergy.com/upload/documents/Manual_SmartSolar_MPPT_150-60_up_to_250-70/29694-MPPT_solar_charger_manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 09 Feb 2025'),

('Victron', 'SmartSolar MPPT 150/70–250/100 VE.Can', 'datasheet', 'SmartSolar MPPT 250/70 to 250/100 VE.Can Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-250-70-up-to-250-100-VE.Can-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers 150/70 through 250/100 VE.Can range'),

('Victron', 'SmartSolar MPPT 150/70–250/100 VE.Can', 'manual', 'SmartSolar MPPT 150/70 up to 250/100 VE.Can Manual',
 'https://www.victronenergy.com/upload/documents/Manual_SmartSolar_MPPT_150-70_up_to_250-100_VE.Can/29694-MPPT_solar_charger_manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'SmartSolar MPPT RS 450', 'datasheet', 'SmartSolar MPPT RS 450/100 & 450/200 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-MPPT-RS-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers SmartSolar MPPT RS 450/100-MC4, 450/200-MC4'),

('Victron', 'SmartSolar MPPT RS 450', 'manual', 'SmartSolar MPPT RS Manual',
 'https://www.victronenergy.com/upload/documents/SmartSolar_MPPT_RS/13860-SmartSolar_MPPT_RS-pdf-en.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — BlueSolar MPPT Charge Controllers
-- ============================================================

('Victron', 'BlueSolar MPPT', 'datasheet', 'BlueSolar MPPT Overview (BlueSolar + SmartSolar)',
 'https://www.victronenergy.com/upload/documents/Datasheet-BlueSolar-and-SmartSolar-charge-controller-overview-EN.pdf',
 'pending_review', 'victronenergy.com', 'Full range overview'),

('Victron', 'BlueSolar MPPT 75/15–100/20', 'datasheet', 'BlueSolar MPPT 75/10, 75/15, 100/15, 100/20-48V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Blue-Solar-Charge-Controller-MPPT-75-10,-75-15,-100-15,-100-20_48V-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers BlueSolar MPPT 75/15, 100/15, 100/20'),

('Victron', 'BlueSolar MPPT 75/15–100/20', 'manual', 'BlueSolar MPPT 75/10 up to 100/20 Manual (Rev 10)',
 'https://www.victronenergy.com/upload/documents/Manual_BlueSolar_MPPT_75-10_up_to_100-20/29694-MPPT_solar_charger_manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 10 Feb 2026'),

('Victron', 'BlueSolar MPPT 150/60–150/70', 'datasheet', 'BlueSolar MPPT 150/60 and 150/70 Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-BlueSolar-charge-controller-MPPT-150-60-and-150-70-EN.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — Battery Chargers
-- ============================================================

('Victron', 'Blue Smart IP22 Charger', 'datasheet', 'Blue Smart IP22 Charger 230V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Blue-Smart-IP22-Charger-230-VAC-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Blue Smart IP22 12/15(1), 12/30(1), 12/30(3), 24/12(1), 24/16(1)'),

('Victron', 'Blue Smart IP22 Charger', 'manual', 'Blue Smart IP22 Charger 230V Manual',
 'https://www.victronenergy.com/upload/documents/Blue_Smart_IP22_Charger_230V_manual/181363-Blue_Smart_Charger-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Covers IP22 12/15–12/30, 24/8–24/16 all output variants'),

('Victron', 'Blue Smart IP22 Charger', 'drawing', 'Dimension Drawing — Blue Smart IP22 Charger',
 'https://www.victronenergy.com/upload/documents/DimensionDrawing-BSC-IP22.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Blue Smart IP65 Charger', 'datasheet', 'Blue Smart IP65 Charger 12/25 & 24/13 230V/120V Datasheet',
 'https://www.victronenergy.com/upload/documents/Blue-Smart-IP65-12-25-24-13-230V-120V-Charger.pdf',
 'pending_review', 'victronenergy.com', 'Covers Blue Smart IP65 12/4–12/25, 24/5–24/13 (all CEE variants)'),

('Victron', 'Blue Smart IP65 Charger', 'manual', 'Blue Smart IP65 Charger 230V Manual',
 'https://www.victronenergy.com/upload/documents/Blue_Smart_IP65_Charger_230V_manual/181363-Blue_Smart_Charger-pdf-en.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Blue Smart IP67 Charger', 'datasheet', 'Blue Smart IP67 Charger 230V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Blue-Smart-IP67-Charger-230VAC-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Blue Smart IP67 12/7, 12/13, 12/25, 24/8, 24/12'),

('Victron', 'Phoenix Smart IP43 Charger', 'datasheet', 'Phoenix Smart IP43 Charger 230V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Phoenix-Smart-IP43-Charger-120-240V-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers Phoenix Smart IP43 Charger 24/25'),

('Victron', 'Phoenix Smart IP43 Charger', 'manual', 'Smart IP43 Charger 230V Manual (Rev 13)',
 'https://www.victronenergy.com/upload/documents/Smart_IP43_Charger_230V/22097-Smart_IP43_Charger_230V-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 13 Nov 2025'),

('Victron', 'Skylla-TG Charger', 'datasheet', 'Skylla TG Charger 24/48V Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Skylla-Charger-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Skylla-TG 48/25, 48/50'),

-- ============================================================
-- VICTRON — Orion DC-DC Converters
-- ============================================================

('Victron', 'Orion-Tr DC-DC', 'datasheet', 'Orion-Tr DC-DC Converters Isolated (100–400W) Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Orion-Tr-DC-DC-converters-isolated-100-250-400W-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers 12/12, 12/24, 24/12, 24/24, 24/48, 48/12, 48/24, 48/48 isolated variants'),

('Victron', 'Orion-Tr DC-DC', 'manual', 'Manual — Orion-Tr Isolated DC-DC Converters',
 'https://www.victronenergy.com/upload/documents/Manual-Orion-Tr-isolated-DC-DC-converters-EN-FR-NL-ES-IT-DE.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Orion-Tr Smart DC-DC', 'datasheet', 'Orion-Tr Smart DC-DC Charger Isolated (250–400W) Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Orion-Tr-Smart-DC-DC-chargers-isolated-250-400W-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers 12/12 18A/30A, 12/24 10A/15A, 24/12 20A/30A, 24/24-17A'),

('Victron', 'Orion-Tr Smart DC-DC', 'datasheet', 'Orion-Tr Smart DC-DC Charger Non-Isolated (360–400W) Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Orion-Tr-Smart-DC-DC-chargers-non-isolated-360-400W-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers Orion-Tr Smart Non-Isolated 12/12-30A'),

('Victron', 'Orion-Tr Smart DC-DC', 'manual', 'Orion-Tr Smart DC-DC Charger Isolated Manual (Rev 14)',
 'https://www.victronenergy.com/upload/documents/Orion-Tr_Smart_DC-DC_Charger_-_Isolated/34439-Orion-Tr_Smart_DC-DC_Charger-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 14 Feb 2026'),

('Victron', 'Orion-Tr Smart DC-DC', 'manual', 'Orion-Tr Smart DC-DC Charger Non-Isolated Manual (Rev 07)',
 'https://www.victronenergy.com/upload/documents/Orion-Tr_Smart_DC-DC_Charger_-_Non-Isolated/34439-Orion-Tr_Smart_DC-DC_Charger-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 07 Feb 2026'),

('Victron', 'Orion XS DC-DC', 'datasheet', 'Orion XS DC-DC Battery Charger Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Orion-XS-DC-DC-battery-charger-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Covers Orion XS 12/12-50A'),

('Victron', 'Orion XS DC-DC', 'manual', 'Orion XS 12/12-50A DC-DC Battery Charger Manual (Rev 10)',
 'https://www.victronenergy.com/upload/documents/Orion_XS_12-12-50A_DC-DC_battery_charger/124067-Orion_XS_DC-DC_battery_charger-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 10 Jan 2026'),

-- ============================================================
-- VICTRON — GX Monitoring Devices
-- ============================================================

('Victron', 'Cerbo GX', 'datasheet', 'Cerbo GX & GX Touch Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Cerbo-GX-GX-Touch-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers Cerbo GX, Cerbo GX MK2, GX Touch 50, GX Touch 70'),

('Victron', 'Cerbo GX', 'manual', 'Cerbo GX Manual (includes Venus GX, Ekrano GX)',
 'https://www.victronenergy.com/upload/documents/Cerbo_GX/140558-Ekrano_GX__Venus_GX__Cerbo_GX__Cerbo-S_GX_Manual-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Covers Cerbo GX, Cerbo GX MK2, Venus GX, Ekrano GX'),

('Victron', 'Cerbo GX', 'drawing', 'Dimension Drawing — GX Touch 50',
 'https://www.victronenergy.com/upload/documents/GX-Touch-50.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Cerbo GX', 'drawing', 'Dimension Drawing — GX Touch 70',
 'https://www.victronenergy.com/upload/documents/GX-Touch-70.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'Cerbo GX', '3d_model', 'GX Touch 50 — 3D Model',
 'https://www.victronenergy.com/upload/documents/GX-Touch-50-(3D).PDF',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'GX Devices', 'certification', 'EU Declaration of Conformity — All GX Devices',
 'https://www.victronenergy.com/upload/documents/GX-devices-Cerbo-Ekrano-Color-Control-Venus-Octo-EU-DOC-RED.pdf',
 'pending_review', 'victronenergy.com', 'Covers Cerbo, Ekrano, Color Control, Venus, Octo GX'),

-- ============================================================
-- VICTRON — Battery Monitors
-- ============================================================

('Victron', 'BMV Battery Monitor', 'datasheet', 'Battery Monitor BMV & SmartShunt Datasheet (2024)',
 'https://www.victronenergy.com/upload/documents/Battery-Monitor-BMV-&-SmartShunt-2024-08-27.pdf',
 'pending_review', 'victronenergy.com', 'Covers BMV-700, BMV-702, BMV-712 Smart, SmartShunt 500A, SmartShunt 1000A'),

('Victron', 'BMV-700', 'manual', 'BMV-700 Battery Monitor Manual (Rev 18)',
 'https://www.victronenergy.com/upload/documents/BMV_-700/9172-Manual_BMV_and_SmartShunt-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 18 Jan 2026'),

('Victron', 'BMV-712 Smart', 'manual', 'BMV-712 Smart Battery Monitor Manual (Rev 17)',
 'https://www.victronenergy.com/upload/documents/BMV-712_Smart/9172-Manual_BMV_and_SmartShunt-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 17 Jul 2025'),

('Victron', 'SmartShunt', 'manual', 'SmartShunt Battery Monitor Manual (Rev 17)',
 'https://www.victronenergy.com/upload/documents/SmartShunt/9172-Manual_BMV_and_SmartShunt-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Covers SmartShunt 500A/50mV, SmartShunt 1000A/50mV; Rev 17 Jul 2025'),

-- ============================================================
-- VICTRON — Energy Meters
-- ============================================================

('Victron', 'Energy Meter', 'datasheet', 'Energy Meter Selection Guide Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-Energy-Meters-Selection-Guide-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers ET112, ET340, EM24, VM-3P75CT selection guide'),

('Victron', 'Energy Meter ET112', 'manual', 'Energy Meter ET112 Manual (Rev 07)',
 'https://www.victronenergy.com/upload/documents/Energy_Meter_ET112/113406-Energy_Meters-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Energy Meter ET112 1-Phase 100A; Rev 07 Sep 2024'),

('Victron', 'Energy Meter ET340', 'manual', 'Energy Meter ET340 Manual (Rev 07)',
 'https://www.victronenergy.com/upload/documents/Energy_Meter_ET340/113406-Energy_Meters-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Energy Meter ET340 3-Phase 65A; Rev 07 Sep 2024'),

-- ============================================================
-- VICTRON — EV Charging Stations
-- ============================================================

('Victron', 'EV Charging Station', 'datasheet', 'EV Charging Station 22kW Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-EV-Charging-Station-EN-.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'EV Charging Station NS', 'datasheet', 'EV Charging Station NS 22kW Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-EV-Charging-Station-NS-EN-.pdf',
 'pending_review', 'victronenergy.com', 'Black, Blue, White colour variants'),

('Victron', 'EV Charging Station', 'manual', 'EV Charging Station Manual (Rev 18)',
 'https://www.victronenergy.com/upload/documents/EV_Charging_Station/114524-EV_Charging_Station-pdf-en.pdf',
 'pending_review', 'victronenergy.com', 'Rev 18 Mar 2026'),

('Victron', 'EV Charging Station', 'drawing', 'EV Charging Station Dimension Drawing',
 'https://www.victronenergy.com/upload/documents/EV-Charging-station.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- VICTRON — AGM Batteries
-- ============================================================

('Victron', 'AGM Super Cycle Battery', 'datasheet', 'AGM Super Cycle Battery Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-AGM-Super-Cycle-battery-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers 12V 60Ah AGM Super Cycle (M5) and 12V 125Ah (M8)'),

('Victron', 'AGM Deep Cycle Battery', 'datasheet', 'GEL and AGM Deep Cycle Batteries Datasheet',
 'https://www.victronenergy.com/upload/documents/Datasheet-GEL-and-AGM-Batteries-EN.pdf',
 'pending_review', 'victronenergy.com', 'Covers 12V 220Ah AGM Deep Cycle'),

('Victron', 'AGM Super Cycle Battery 12V 60Ah', 'drawing', 'MD — 12V/60Ah AGM Super Cycle Battery (M5)',
 'https://www.victronenergy.com/upload/documents/MD-12V-60Ah-AGM-Super-Cycle-Battery-with-threaded-input-terminals.pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'AGM Super Cycle Battery 12V 125Ah', 'drawing', '12V/125Ah AGM Super Cycle Battery (M8) — 3D Dimensional PDF',
 'https://www.victronenergy.com/upload/documents/12V-125Ah-AGM-Super-Cycle-Batt.-(M8)-(3D).pdf',
 'pending_review', 'victronenergy.com', NULL),

('Victron', 'AGM Deep Cycle Battery 12V 220Ah', 'drawing', 'MD — 12V/220Ah AGM Deep Cycle Battery',
 'https://www.victronenergy.com/upload/documents/MD-12V-220Ah-AGM-Deep-Cycle-Battery-11-2019.pdf',
 'pending_review', 'victronenergy.com', NULL),

-- ============================================================
-- SUNSYNK — Inverters
-- ============================================================

('Sunsynk', 'SUNSYNK-8K-SG01LP1', 'datasheet', 'Sunsynk 8kW Single Phase Hybrid Datasheet v.15',
 'https://powerprovider.co.za/wp-content/uploads/2023/04/Sunsynk_Hybrid_Inverter_8kW_Datasheet_v15_English.pdf',
 'pending_review', 'powerprovider.co.za', 'SUNSYNK-8K-SG01LP1 / SUNSYNK-8K-SG03LP1; SA distributor mirror'),

('Sunsynk', 'SUNSYNK-8K-SG01LP1', 'manual', 'Sunsynk 8kW Hybrid Inverter User Manual v.24',
 'https://www.liteglo.co.za/wp-content/uploads/2021/12/SUNSYNK-8KW-HYBRID-INVERTER-MANUAL.pdf',
 'pending_review', 'liteglo.co.za', 'SUNSYNK-8K-SG01LP1 / SUNSYNK-8K-SG03LP1; SA distributor mirror'),

('Sunsynk', 'SUNSYNK-10K-SG02LP1', 'datasheet', 'Sunsynk 10kW/12kW Single Phase Hybrid Datasheet v.3',
 'https://herholdts.co.za/uploads/Sunsynk_SinglePhase_10-12kW_Datasheet_v3_English.pdf',
 'pending_review', 'herholdts.co.za', 'SUNSYNK-10K-SG02LP1 / SUNSYNK-12K-SG02LP1; Herholdt''s SA mirror'),

('Sunsynk', 'SUNSYNK-10K-SG02LP1', 'manual', 'Sunsynk 10kW Single Phase Hybrid User Manual v.8',
 'https://etechcomponents.com/wp-content/uploads/2026/03/Sunsynk-10kW-1-Phase-Hybrid-Inverter-Manual.pdf',
 'pending_review', 'etechcomponents.com', 'SUNSYNK-10K-SG02LP1; UK distributor mirror v.8 Dec 2025'),

('Sunsynk', 'SUNSYNK-12K-SG04LP3', 'datasheet', 'Sunsynk Three Phase Hybrid Inverter Datasheet (8K/10K/12K) v.5',
 'https://www.solarwaysuppliers.co.za/wp-content/uploads/2014/01/Three-Phase-Hybrid-Inverter-Datasheet-v5.pdf',
 'pending_review', 'solarwaysuppliers.co.za', 'SUNSYNK-12K-SG04LP3; SA distributor mirror'),

('Sunsynk', 'SUNSYNK-12K-SG04LP3', 'manual', 'Sunsynk 12kW Three Phase Hybrid Installer Manual',
 'https://solarbackup.co.za/wp-content/uploads/2022/11/Installation-Manual-Sunsynk-12kW-Three-Phase-LV-Hybrid-Inverter.pdf',
 'pending_review', 'solarbackup.co.za', 'SUNSYNK-12K-SG04LP3 LV; SA distributor mirror'),

('Sunsynk', 'SUNSYNK-16K-SG01LP1', 'datasheet', 'Sunsynk 16kW Single Phase Hybrid Datasheet v.1',
 'https://gl-e.uk/wp-content/uploads/2023/10/Sunsynk_SinglePhase_12-16kW_Datasheet_v1_English.pdf',
 'pending_review', 'gl-e.uk', 'SUNSYNK-16K-SG01LP1 (Sunsynk MAX); UK distributor mirror'),

('Sunsynk', 'SUNSYNK-25K-SG01HP3', 'datasheet', 'Sunsynk 25kW Three Phase HV Hybrid Datasheet v.4',
 'https://greenenergysolutions.co.za/wp-content/uploads/2024/04/Sunsynk-three-phase-inverter_datasheet.pdf',
 'pending_review', 'greenenergysolutions.co.za', 'SUNSYNK-25K-SG01HP3; SA distributor mirror v.4 Mar 2024'),

('Sunsynk', 'SUNSYNK-25K-SG01HP3', 'manual', 'Sunsynk 25kW Three Phase Hybrid User Manual v.8',
 'https://www.bimblesolar.com/docs/Sunsynk_ThreePhaseHI_5_25K_UserManual_v8_English.pdf',
 'pending_review', 'bimblesolar.com', 'SH5–25K series; UK distributor mirror'),

-- ============================================================
-- SUNGROW — Inverters & Batteries
-- ============================================================

('Sungrow', 'SH15/20/25T Series', 'datasheet', 'Sungrow SH15/20/25T Datasheet V3 EN (December 2023)',
 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20231201_SH15_20_25T_Datasheet_V3_EN.pdf',
 'pending_review', 'sungrowpower.com', 'Covers SH15T, SH20T, SH25T; official Sungrow support CDN'),

('Sungrow', 'SH15/20/25T Series', 'manual', 'Sungrow 3-Phase Hybrid Inverter User Manual SH5-25T Ver17 (April 2025)',
 'https://info-support.sungrowpower.com/application/pdf/2025/07/17/SH5-25T-EN-Ver17-202504.pdf',
 'pending_review', 'sungrowpower.com', 'Covers SH5T–SH25T full range; official Sungrow support CDN'),

('Sungrow', 'SH15/20/25T Series', 'installation_guide', 'Quick Installation Guide 3-Phase Hybrid Inverter SH15T/20T/25T',
 'https://ger.sungrowpower.com/upload/file/20240426/EN_DE_IT_FR_NL_PL_ES_PT_SE_QG_SH15T_20T_25T%20Quick_Installation_Guide.pdf',
 'pending_review', 'sungrowpower.com', 'Multilingual EN included; official Sungrow German regional site'),

('Sungrow', 'SBR Series Battery', 'datasheet', 'Sungrow SBR064/096/128/160/192/224/256 HV LFP Battery Datasheet V5',
 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
 'pending_review', 'sungrowpower.com', 'Sep 2024; official Sungrow support CDN'),

('Sungrow', 'SBR Series Battery', 'manual', 'Sungrow HV LFP Battery User Manual SBR064–256 (May 2025)',
 'https://info-support.sungrowpower.com/application/pdf/2025/05/12/SBR064%20User%20Manual.pdf',
 'pending_review', 'sungrowpower.com', 'Official Sungrow support CDN'),

('Sungrow', 'SBR Series Battery', 'installation_guide', 'Quick Installation Guide HV LFP Battery SBR096–256 Ver17',
 'https://info-support.sungrowpower.com/application/pdf/2022/12/27/SBR096-256-QIMUL-Ver17-202211.pdf',
 'pending_review', 'sungrowpower.com', 'Official Sungrow support CDN'),

('Sungrow', 'SBH Series Battery', 'manual', 'Sungrow HV LFP Battery User Manual SBH100/150/200/250/300/350/400 Ver13',
 'https://info-support.sungrowpower.com/application/pdf/2024/12/03/SBH100-400-UEN-Ver13-202410.pdf',
 'pending_review', 'sungrowpower.com', 'Oct 2024; official Sungrow support CDN'),

-- ============================================================
-- DEYE — Inverters & Batteries
-- ============================================================

('Deye', 'SUN-16K-SG01LP1-EU', 'datasheet', 'Deye Single Phase Hybrid Inverter Datasheet SUN-12/14/16/18K (April 2025)',
 'https://www.deyeinverter.com/deyeinverter/2025/04/30/datasheet_sun-12-18k-sg01lp1-eu-am3-p_250427_en.pdf',
 'pending_review', 'deyeinverter.com', 'Official Deye; covers SUN-12K/14K/16K/18K-SG01LP1-EU-AM3-P'),

('Deye', 'SUN-16K-SG01LP1-EU', 'manual', 'Deye Hybrid Inverter User Manual SUN-12K/14K/16K-SG01LP1-EU (August 2025)',
 'https://www.deyeinverter.com/deyeinverter/2025/08/19/rand/221/%E3%80%90b%E3%80%91manual_sun-12-16k-sg01lp1-eu_20250819_en.pdf',
 'pending_review', 'deyeinverter.com', 'Official Deye Aug 2025'),

('Deye', 'SE-G5.3 Battery', 'datasheet', 'Deye SE-G5.3 Cobalt Free LFP Battery Datasheet',
 'https://solar.co.za/wp-content/uploads/2023/08/Deye-5.3kWh-Datasheet.pdf',
 'pending_review', 'solar.co.za', 'SE-G5.3 5.32kWh; SA distributor mirror'),

('Deye', 'SE-G5.3 Battery', 'other', 'Deye Approved Battery List (January 2024)',
 'https://www.deyeinverter.com/deyeinverter/2024/01/04/deyeapprovedbatterylistdy-lv48-0076.pdf',
 'pending_review', 'deyeinverter.com', 'Batteries approved for use with Deye inverters; cross-reference for compatibility'),

-- ============================================================
-- SOLIS — Inverters
-- ============================================================

('Solis', 'S6-EH1P(3-6)K-L-PRO', 'datasheet', 'Solis S6-EH1P(3-6)K-L-PRO Single Phase LV Inverter Datasheet V2.8',
 'https://www.solisinverters.com/uploads/file/Solis_datasheet_S6-EH1P(3-6)K-L-PRO_Global_V2,8_2023_06.pdf',
 'pending_review', 'solisinverters.com', 'Official solisinverters.com; covers 3kW–6kW PRO variant'),

('Solis', 'S6-EH1P(3-6)K-L-PRO', 'datasheet', 'Solis RHI-(3-6)K-48ES-5G Datasheet ZAF V1.2 (South Africa)',
 'https://www.solisinverters.com/uploads/file/Solis_datasheet_RHI-(3-6)K-48ES-5G_ZAF_V1,2_2021_11.pdf',
 'pending_review', 'solisinverters.com', 'ZAF South Africa edition; lists NRS 097-2-1'),

('Solis', 'S6-EH1P(3-8)K-L-PRO', 'manual', 'Solis S6-EH1P(3-8)K-L-PRO User Manual EUR V1.1 (February 2024)',
 'https://www.solisinverters.com/uploads/file/Solis_Manual_S6-EH1P(3-8)K-L-PRO_EUR_V1,1(20240228).pdf',
 'pending_review', 'solisinverters.com', 'Official solisinverters.com'),

('Solis', 'S6-EH1P8K-L-PLUS', 'datasheet', 'Solis S6-EH1P8K-L-PLUS Datasheet GBR V1.4',
 'https://www.solisinverters.com/uploads/file/Solis_datasheet_S6-EH1P8K-L-PLUS_GBR_V1,4_202406.pdf',
 'pending_review', 'solisinverters.com', 'Official solisinverters.com; 8kW PLUS variant'),

('Solis', 'S6-EH1P8K-L-PLUS', 'manual', 'Solis S6-EH1P8K-L-PLUS User Manual EUR',
 'https://www.solisinverters.com/uploads/file/Solis_Manual_S6-EH1P8K-L-PLUS_EUR_V1,0(20241104).pdf',
 'pending_review', 'solisinverters.com', 'Official solisinverters.com Nov 2024'),

('Solis', 'S6-EH1P(3-6)K-L-PRO', 'certification', 'Solis IEC 62109-1/2 Safety Certificate (RHI/S5/S6 series)',
 'https://www.solisinverters.com/uploads/file/Solis_certificate_IEC_EN_62109-1(-2)_RHI-(3-6)K-48ES(-5G)(-5G-NS)_S5-EH1P(3-6)K-L(-NS)(-BE)_Safety_V01.pdf',
 'pending_review', 'solisinverters.com', 'Covers RHI-5G, S5-EH1P, and related series'),

('Solis', 'S6-EH3P(8-15)K LV', 'datasheet', 'Solis S6-EH3P(8-15)K02-NV-YD-L Datasheet (NasTech Solar SA)',
 'https://nastechsolar.com/content/INVERTERS/SOLIS/PRODUCT%20DATASHEET/ENERGY%20STORAGE%20INVERTER/S6-EH3P(8-15)K02-NV-YD-L/Datasheet%20Solis%20S6-EH3P(8-15)K02-NV-YD-L.pdf',
 'pending_review', 'nastechsolar.com', 'SA distributor (NasTech Solar); 8kW–15kW 3-phase LV'),

('Solis', 'S6-EH3P(8-15)K LV', 'manual', 'Solis S6 3-Phase Hybrid Inverter User Manual V1.3 (August 2025)',
 'https://139708663.fs1.hubspotusercontent-eu1.net/hubfs/139708663/Fiches%20techniques/Solis/Solis_Manual_S6-EH3P(8-15)K02-NV-YD-L_EUR_V1,3(20250821).pdf',
 'pending_review', 'solisinverters.com', 'S6-EH3P(8-15)K02-NV-YD-L EUR V1.3'),

-- ============================================================
-- LUXPOWER — Inverters
-- ============================================================

('LuxPower', 'SNA 3–6K Off-Grid', 'datasheet', 'LuxPower SNA 3–6K Single-Phase Off-Grid Inverter Specification Sheet',
 'https://luxpowertek.com/wp-content/uploads/2023/07/SNA-3-6k-Single-phase-specification.pdf',
 'pending_review', 'luxpowertek.com', 'Official luxpowertek.com; covers SNA3000WPV–SNA6000WPV'),

('LuxPower', 'SNA 3–6K Off-Grid', 'manual', 'Off-Grid Inverter SNA 3000–6000 WPV User Manual (December 2025)',
 'https://luxpowertek.com/wp-content/uploads/2025/12/SNA-3-6K-User-manual-English-OffGrid-Single-Phase-LuxpowerTek.pdf',
 'pending_review', 'luxpowertek.com', 'Official luxpowertek.com; UM-SNA01001E03'),

('LuxPower', 'LXP 3–6K Hybrid', 'manual', 'LuxPower Hybrid Inverter User Manual LXP 3–6K (August 2025)',
 'https://luxpowertek.com/wp-content/uploads/2025/08/LXP-3-6K-User-Manual-2024.8.28.pdf',
 'pending_review', 'luxpowertek.com', 'Official luxpowertek.com; UM-LXP01001E'),

-- ============================================================
-- JA SOLAR — Additional docs (datasheet for 585–645W series already in 018)
-- ============================================================

('JA Solar', 'JAM72D42 Series', 'datasheet', 'JAM72D42 LB Full Series Datasheet (EU Edition)',
 'https://www.jasolar.eu/fileadmin/data/products/4.0/JAM72D42_LB.pdf',
 'pending_review', 'jasolar.eu', 'EU full-series PDF covering all /LB variants 585W–650W'),

('JA Solar', 'JAM72D42 Series', 'installation_guide', 'JA Solar PV Bifacial Double-Glass Modules Installation Manual (2024)',
 'https://www.jasolar.com/uploadfile/fujian/2024/1120/c86f730ceafbac9.pdf',
 'pending_review', 'jasolar.com', 'Covers all JAM72D42 /LB bifacial double-glass models'),

('JA Solar', 'JAM66D45 Series', 'installation_guide', 'JA Solar PV Bifacial Double-Glass Modules Installation Manual (2024)',
 'https://www.jasolar.com/uploadfile/fujian/2024/1120/c86f730ceafbac9.pdf',
 'pending_review', 'jasolar.com', 'Covers JAM66D45 bifacial double-glass models'),

('JA Solar', 'JAM72D42 Series', 'warranty', 'JA Solar Limited Warranty for PV Double-Glass Modules',
 'https://www.jasolar.com/uploadfile/2018/0518/20180518102313951.pdf',
 'pending_review', 'jasolar.com', '15-year product / 30-year linear performance — confirm 2024/2025 version on jasolar.com'),

-- ============================================================
-- AIKO SOLAR — Datasheets & Installation Guides
-- ============================================================

('Aiko', 'Comet 2N+ Dual-Glass 600–625W', 'datasheet', 'AIKO Comet 2N+ MAH72Dw 600W–625W Dual-Glass Datasheet V6.3',
 'https://mspd.africa/wp-content/uploads/2024/12/Aiko-Comet-2NA-MAH72Dw-600-625W_2323x1134x30mm%EF%BC%88cable350mm%EF%BC%89_V6.3.pdf',
 'pending_review', 'mspd.africa', 'Model AIKO-A-MAH72Dw; 2323×1134×30mm; MSPD Africa distributor'),

('Aiko', 'Comet 2N Mono-Glass 600–625W', 'datasheet', 'AIKO Comet 2N MAH72Mw 600W–625W Mono-Glass Datasheet V6.1',
 'https://www.vicoexport.com/wp-content/uploads/2024/07/AIKO-A-MAH72Mw-600-620W-350mm-Vico-Export-Solar-Energy.pdf',
 'pending_review', 'vicoexport.com', 'Model AIKO-A-MAH72Mw; 2323×1134×30mm; 625W variant at top of band'),

('Aiko', 'Neostar 2S 500W Mono-Glass Black', 'datasheet', 'AIKO Neostar 2S MAH60Mb 500W–520W Full-Black Datasheet',
 'https://aikosolar.com/wp-content/uploads/2024/10/Neostar-2S_188-AIKO-A-MAH60Mb-500-520W_1954x1134x30mm_AUS-Fullblack.pdf',
 'pending_review', 'aikosolar.com', 'Model AIKO-A-MAH60Mb; 1954×1134×30mm; official AIKO PDF'),

('Aiko', 'Stellar 1N+ Dual-Glass 650W', 'datasheet', 'AIKO Stellar 1N+ MCH72Dw 620W–650W Dual-Glass Bifacial Datasheet',
 'https://aikosolar.com/wp-content/uploads/2024/06/Datasheet-AIKO-Gxxx-MCH72Dw_AU_12.06.24.pdf',
 'pending_review', 'aikosolar.com', 'Model AIKO-G-MCH72Dw; 2382×1134×30mm; official AIKO PDF Jun 2024'),

('Aiko', 'Comet 2N Dual-Glass', 'installation_guide', 'AIKO PV Module Installation Manual — Dual Glass Module',
 'https://midsummerwholesale.co.uk/pdfs/dual-glass-installation-manual-gen-ii-en-aiko-energy-v1.0-compressed.pdf',
 'pending_review', 'aikosolar.com', 'Covers all AIKO dual-glass bifacial modules'),

('Aiko', 'Comet 2N Mono-Glass', 'installation_guide', 'AIKO PV Module Installation Manual — Mono Glass Module',
 'https://pimassetsprdst.blob.core.windows.net/assets/apc_Original/82/41/93648241.pdf',
 'pending_review', 'aikosolar.com', 'Covers all AIKO mono-glass modules'),

-- ============================================================
-- LONGI — Datasheets, Install Manual & Warranty
-- ============================================================

('LONGi', 'Hi-MO 6 LR5-72HTH 560M', 'datasheet', 'LONGi Hi-MO 6 Explorer LR5-72HTH 565–585M Datasheet V19',
 'https://static.longi.com/L_Gi_LE_PM_T_PMD_059_F138_LR_5_72_HTH_565_585_M_V2_30_30_and_15_Frame_Explorer_V19_fb7474efd7.pdf',
 'pending_review', 'longi.com', 'Official static.longi.com; 144 half-cut cells; covers 560M band'),

('LONGi', 'Hi-MO 6 LR5-72HTH 605M', 'datasheet', 'LONGi Hi-MO 6 Scientist LR5-72HTH 590–600M Datasheet V19',
 'https://static.longi.com/L_Gi_LE_PM_T_PMD_059_F133_LR_5_72_HTH_590_600_M_V2_30_30_and_15_Frame_Scientist_V19_EN_pdf_26bcba7569.pdf',
 'pending_review', 'longi.com', 'Official static.longi.com; LR5 Scientist variant; closest to 605M'),

('LONGi', 'Hi-MO 6 LR7-72HTH 605M', 'datasheet', 'LONGi Hi-MO X6 Max Explorer LR7-72HTH 605–615M Datasheet (May 2024)',
 'https://static.longi.com/LR_7_72_HTH_605_615_M_30_30_and_15_Frame_Explorer_20240511_V2_d0c9b7df55.pdf',
 'pending_review', 'longi.com', 'Official static.longi.com; LR7 variant (210mm cells)'),

('LONGi', 'Hi-MO 6 Series', 'installation_guide', 'Installation Manual for LONGi Solar PV Modules V19 (2025)',
 'https://static.longi.com/L_Gi_LE_PM_T_PRD_013_Installation_Manual_for_LON_Gi_Solar_PV_Modules_2025_5_6_194948ea9e.pdf',
 'pending_review', 'longi.com', 'Official static.longi.com; V19 2025 update; covers all LONGi module series'),

('LONGi', 'Hi-MO 6 Series', 'warranty', 'LONGi Solar Modules Limited Warranty — Distributed Generation Market (2024)',
 'https://static.longi.com/Limited_Warranty_for_LON_Gi_Solar_Modules_Distributed_Generation_Market_1_8e5cdaf54e.pdf',
 'pending_review', 'longi.com', 'Official static.longi.com; 25-year product / 30-year linear (≥85% at year 30)'),

-- ============================================================
-- TRINA SOLAR — Datasheets, Install Manual & Warranty
-- ============================================================

('Trina', 'Vertex N NEG19RC.20', 'datasheet', 'Trina Solar Vertex N TSM-NEG19RC.20 590–625W Datasheet 2024A',
 'https://static.trinasolar.com/sites/default/files/Datasheet_210R_NEG19RC.20_EN_2024A_web.pdf',
 'pending_review', 'trinasolar.com', 'Official static.trinasolar.com; covers TSM-615DE21R.20 and TSM-620DE21R.20; 132-cell 210R N-type'),

('Trina', 'Vertex N NEG19RC.20', 'datasheet', 'Trina Solar Vertex N TSM-NEG19RC.20 Datasheet 2025',
 'https://static.trinasolar.com/sites/default/files/DT-M-0071%20C%20Datasheet_Vertex_NEG19RC.20_NA_EN_2025_A.pdf',
 'pending_review', 'trinasolar.com', 'Official static.trinasolar.com; 2025 NA version'),

('Trina', 'Vertex N Series', 'installation_guide', 'Trina Solar Vertex Series User Manual (UM-M-0002 H)',
 'https://static.trinasolar.com/sites/default/files/UM-M-0002%20H%20Trina%20Solar%20Vertex%20Series%20User%20Manual_EN.pdf',
 'pending_review', 'trinasolar.com', 'Official static.trinasolar.com; latest version'),

('Trina', 'Vertex N Series', 'warranty', 'Trina Solar Global Limited Warranty (PS-M-0135 Z)',
 'https://static.trinasolar.com/sites/default/files/PS-M-0135%20Z%20%20Global%20Limited%20Warranty%20Trinasolar%20Modules_EN.pdf',
 'pending_review', 'trinasolar.com', 'Official static.trinasolar.com; 12-year product / 30-year linear (~87.4% at year 30)'),

-- ============================================================
-- FREEDOMWON — Batteries
-- ============================================================

('FreedomWon', 'eTower Battery', 'datasheet', 'FreedomWon eTOWER Range Overview Sheet',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Won-eTOWER-Range-Overview-Sheet-3.pdf',
 'pending_review', 'freedomwon.co.za', 'eTower full range overview'),

('FreedomWon', 'eTower Battery', 'datasheet', 'FreedomWon LiTE / eTower Combined Spec Sheet',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Won-Spec-sheet_LiTE_eTower_.pdf',
 'pending_review', 'freedomwon.co.za', NULL),

('FreedomWon', 'eTower Battery', 'installation_guide', 'FreedomWon eTower Installation Manual v3',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Won-eTower-Installation-Manual-v3.pdf',
 'pending_review', 'freedomwon.co.za', 'Covers eTower 5kWh and modular stacking'),

('FreedomWon', 'eTower Battery', 'other', 'FreedomWon Inverter Integration & Interfacing Guide (May 2025)',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Won-Inverter-Integration-Interfacing-Guide-Global-May-2025.pdf',
 'pending_review', 'freedomwon.co.za', 'Covers compatibility with all major inverter brands'),

('FreedomWon', 'eTower Battery', 'warranty', 'FreedomWon eTower Battery Guarantee',
 'https://www.freedomwon.co.za/wp-content/uploads/eTower-Guarantee.pdf',
 'pending_review', 'freedomwon.co.za', '10-year / 4,000 cycle guarantee; 60% EOL capacity threshold'),

('FreedomWon', 'LiTE Home 10/8', 'datasheet', 'FreedomWon Spec Sheet — LiTE Home 52V 10/8',
 'https://www.freedomwon.co.za/wp-content/uploads/Spec-Sheet-LiTE-Home-52V-B-10_8.pdf',
 'pending_review', 'freedomwon.co.za', 'LiTE Home 52V 10kWh total / 8kWh usable'),

('FreedomWon', 'LiTE Home Range', 'datasheet', 'FreedomWon LiTE Home and Business 52V Range Overview',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Won-Spec-sheet_LiTE-Home_Overview-1.pdf',
 'pending_review', 'freedomwon.co.za', NULL),

('FreedomWon', 'LiTE Home Range', 'installation_guide', 'FreedomWon LiTE Home and Business Installation Manual Rev 14',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-Lite-Installation-Manual-Rev-14-005_V2.pdf',
 'pending_review', 'freedomwon.co.za', NULL),

('FreedomWon', 'LiTE Home Range', 'installation_guide', 'FreedomWon LiTE 2 Home and Business Installation Manual',
 'https://www.freedomwon.co.za/wp-content/uploads/FW_LiTE-2-Home-Business_Installation.pdf',
 'pending_review', 'freedomwon.co.za', 'Second-generation LiTE 2 series'),

('FreedomWon', 'LiTE Home Range', 'warranty', 'FreedomWon LiTE Battery Guarantee',
 'https://www.freedomwon.co.za/wp-content/uploads/Freedom-LiTE-Guarantee.pdf',
 'pending_review', 'freedomwon.co.za', NULL),

-- ============================================================
-- BSL BATTERY
-- ============================================================

('BSL Battery', 'BSL Neuro 10', 'datasheet', 'BSLBATT 2025 Energy Storage Product Brochure',
 'https://bslbatt.com/wp-content/uploads/2025/05/Energy-Storage-Product-Brochure-2025-EN-250407.pdf',
 'pending_review', 'bslbatt.com', 'Includes Neuro range; official bslbatt.com'),

('BSL Battery', 'BSL Neuro 10', 'manual', 'BSLBATT B-LFP48 Powerwall Battery User Manual V2.7',
 'https://bslbatt.com/wp-content/uploads/2024/09/B-LFP48-User-Manual-V2.7-Powerwall-Battery.pdf',
 'pending_review', 'bslbatt.com', 'Covers Powerwall/wall-mount form factor — confirm applicability to Neuro 10'),

-- ============================================================
-- EENOVANCE BATTERIES
-- ============================================================

('Eenovance', 'MANA 5.12 / RT5320', 'datasheet', 'Eenovance MANA 5.12 / 10.24 / 16.0 Residential Battery Datasheet (May 2025)',
 'https://www.eenovance.com/Public/Uploads/uploadfile/files/20250526/EenovanceMANA5.1210.2416.0Datasheet2025.5.23.pdf',
 'pending_review', 'eenovance.com', 'Official eenovance.com; covers MANA 5.12, 10.24, and 16.0 variants'),

('Eenovance', 'MANA 5.12 ecco / MANA 10.24 ecco', 'datasheet', 'Eenovance MANA 5.12 ecco / 10.24 ecco Datasheet (April 2025)',
 'https://www.eenovance.com/Public/Uploads/uploadfile2/files/20250427/EenovanceMANA5.12eccoMANA10.24eccoDatasheet2025.4.18.pdf',
 'pending_review', 'eenovance.com', 'Official eenovance.com'),

('Eenovance', 'RT5320 / RT11.77', 'datasheet', 'Eenovance Residential Battery RT5320 / RT11.77 Datasheet',
 'https://www.eenovance.com/Public/Uploads/uploadfile/files/20241211/EenovanceRT5320RT11.77Datasheet20241113.pdf',
 'pending_review', 'eenovance.com', 'RT5320 = 5.32kWh SA-market name; RT11.77 = 10.65kWh SA name'),

-- ============================================================
-- IES (INFINITE ENERGY STORAGE) BATTERIES
-- ============================================================

('IES', 'IES BATT 7.68', 'datasheet', 'IES BATT 7.68 — Premium LFP 6,000 Cycles Datasheet',
 'https://ies.co.za/wp-content/uploads/2025/05/IES-BATT-7.68.pdf',
 'pending_review', 'ies.co.za', 'Official ies.co.za; 7.68kWh LiFePO4'),

('IES', 'IES BATT 14.33', 'datasheet', 'IES BATT 143R Datasheet',
 'https://ies.co.za/wp-content/uploads/2025/04/IES-BATT-143R.pdf',
 'pending_review', 'ies.co.za', 'Official ies.co.za; 14.33kWh (R-Range designation)'),

('IES', 'IES BATT 14.33', 'installation_guide', 'IES-BATT-143R Installation Manual (Herholdt''s)',
 'https://herholdts.co.za/uploads/IES-BATT-143R-1.pdf',
 'pending_review', 'herholdts.co.za', 'Hosted on Herholdt''s — official IES document'),

('IES', 'IES BATT Series', 'warranty', 'IES Battery Limited Product Warranty — LV Series',
 'https://ies.co.za/wp-content/uploads/2024/06/IES-Series-Battery-System-Product-Warranty-SA20240220-V2.3-LV.pdf',
 'pending_review', 'ies.co.za', 'Official ies.co.za; covers BATT 7.68 and BATT 14.33 LV series'),

-- ============================================================
-- PHOTON BATTERIES
-- ============================================================

('Photon', 'PTN-BAT-05K-WM-LFP 100A', 'manual', 'Photon PTN-BAT-05K-WM-LFP Lithium Ion Storage Battery — Owner''s Instructions',
 'https://manuals.plus/photon/ptn-bat-05k-wm-lfp-lithium-ion-storage-battery-manual.pdf',
 'pending_review', 'manuals.plus', '5.12kWh 51.2V 100Ah; confirm this is official Photon document');
