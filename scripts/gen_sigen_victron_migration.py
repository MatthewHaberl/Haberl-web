"""
Generate migration 017: Sigenergy (missing) + Victron products
Reads Items (1).csv, filters Sigen/Victron, outputs SQL INSERT.
Price = Price Exclusive column (ex-VAT selling price) * 100 cents.
"""

import csv
import re
import os

CSV_PATH = r"C:\Users\User\OneDrive - Haberl\HABERL\Items (1).csv"
OUT_PATH = r"C:\Users\User\OneDrive - Haberl\BMG\haberl-web\supabase\migrations\017_sigen_victron_products.sql"

# SKUs already seeded (from existing products table query)
ALREADY_SEEDED = {
    "Sig 5kw", "SIG-BAT-06K", "SIG-BAT-08K", "SIG-BAT-10K", "SIG-BAT-12K",
    "SIG-INV-05K-S", "SIG-INV-06K-S", "SIG-INV-08K-S", "SIG-INV-10K-S",
    "SIG-INV-12K-T", "SIG-INV-15K-T", "SIG-INV-20K-T", "SIG-INV-25K-T",
    "SIG-INV-30K-T", "SIG-INV-H-05K-S", "SIG-INV-H-06K-S", "SIG-INV-H-12K-T",
}

def slugify(brand, sku):
    raw = brand + "-" + sku
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", raw).lower().strip("-")
    return slug

def get_category_sigen(sku, desc):
    sku = sku.upper()
    if "SIG-BAT" in sku or "STACK" in sku:
        return "batteries"
    if "SIG-EV" in sku:
        return "ev-chargers"
    if "SIG-GW" in sku:
        return "gateways"
    if "SIG-INS" in sku:
        return "accessories"
    if "SIG-INV" in sku or "5KW" in sku.upper():
        return "inverters"
    if "SIG-LOG" in sku:
        return "monitoring"
    if "SIG-PS" in sku or "SIG-TPX" in sku:
        return "monitoring"
    if "SIG-COM" in sku:
        return "accessories"
    return "accessories"

def get_category_victron(sku, desc):
    sku = sku.upper()
    d = desc.upper()
    if any(x in sku for x in ["VE-PMP", "VE-QUA", "VE-CMP", "VE-CIN", "VE-PIN", "VE-PMR", "VE-SIN"]):
        return "inverters"
    if any(x in sku for x in ["VE-SCC"]):
        return "charge-controllers"
    if any(x in sku for x in ["VE-BPC", "VE-PSC", "VE-SDTG"]):
        return "chargers"
    if any(x in sku for x in ["VE-BAT"]):
        return "batteries"
    if any(x in sku for x in ["VE-BPP", "VE-BAM", "VE-SHU", "VE-REL"]):
        return "monitoring"
    if any(x in sku for x in ["VE-ORI"]):
        return "converters"
    if any(x in sku for x in ["VE-EVC"]):
        return "ev-chargers"
    return "accessories"

def get_kwh(desc):
    m = re.search(r"(\d+(?:\.\d+)?)\s*kwh", desc, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None

def get_watts(desc):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:kw|kva)\b", desc, re.IGNORECASE)
    if m:
        val = float(m.group(1)) * 1000
        return int(val)
    m = re.search(r"(\d+)\s*w\b", desc, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None

def sql_str(val):
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def sql_num(val):
    if val is None:
        return "NULL"
    return str(val)

rows = []
with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        sku = row["Code"].strip()
        desc = row["Description"].strip()
        active_str = row["Active"].strip()
        price_str = row["Price Exclusive"].strip()

        active = active_str.lower() == "true"
        if not active:
            continue

        try:
            price_excl = float(price_str)
        except ValueError:
            continue

        if price_excl <= 0:
            continue

        is_sigen = sku.upper().startswith("SIG") or "SIGEN" in desc.upper()
        is_victron = sku.upper().startswith("VE-") or "VICTRON" in desc.upper()

        if not is_sigen and not is_victron:
            continue

        if is_sigen and sku in ALREADY_SEEDED:
            continue

        brand = "Sigenergy" if is_sigen else "Victron"
        category = get_category_sigen(sku, desc) if is_sigen else get_category_victron(sku, desc)
        slug = slugify(brand, sku)
        price_cents = int(round(price_excl * 100))
        kwh = get_kwh(desc)
        watts = get_watts(desc)

        rows.append({
            "slug": slug,
            "name": desc,
            "description": desc,
            "price": price_cents,
            "category": category,
            "sku": sku,
            "brand": brand,
            "kwh": kwh,
            "watts": watts,
        })

print(f"Generated {len(rows)} products ({sum(1 for r in rows if r['brand']=='Sigenergy')} Sigenergy, {sum(1 for r in rows if r['brand']=='Victron')} Victron)")

header = """\
-- ============================================================
-- Migration 017: Sigenergy (missing) + Victron products
-- Source: Items (1).csv from Haberl accounting system
-- Price: Price Exclusive (ex-VAT selling price) in cents
-- ============================================================

insert into public.products (
  slug, name, description, price, category, sku, stock_qty, active,
  weight_kg, brand, kwh, meta
) values
"""

value_lines = []
for r in rows:
    meta = "{}"
    line = (
        f"  ({sql_str(r['slug'])}, {sql_str(r['name'])}, {sql_str(r['description'])}, "
        f"{sql_num(r['price'])}, {sql_str(r['category'])}, {sql_str(r['sku'])}, "
        f"99, true, 1.0, {sql_str(r['brand'])}, "
        f"{sql_num(r['kwh'])}, '{meta}'::jsonb)"
    )
    value_lines.append(line)

footer = "\non conflict (slug) do update set\n  name = excluded.name,\n  price = excluded.price,\n  category = excluded.category,\n  brand = excluded.brand,\n  active = excluded.active;\n"

sql = header + ",\n".join(value_lines) + footer

with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(sql)

print(f"Written to {OUT_PATH}")
