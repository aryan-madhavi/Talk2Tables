# Logistics & Supply Chain Database (PostgreSQL)
**Database Name:** `logistics_db`

## Overview
This database manages regional warehouses, tracks in-transit shipments, and monitors SKU-level inventory across global locations.

## Tables & Schema

### 1. `warehouses`
Master record of distribution centers.
- `id`: Primary Key (Serial)
- `city`: Location (e.g., Mumbai, Delhi)
- `region`: Regional office (West, North, South)
- `max_capacity_m3`: Total volumetric space in cubic meters

### 2. `shipments`
Real-time tracking of cargo movement.
- `shipment_id`: Primary Key
- `origin_city`: Departure location
- `destination_city`: Arrival location
- `weight_kg`: Total weight of the cargo
- `status`: Current stage (`in_transit`, `delivered`, `pending`)
- `dispatch_date`: Date the shipment was sent

### 3. `inventory`
Detailed stock levels per warehouse.
- `item_id`: Primary Key
- `warehouse_id`: Foreign Key to `warehouses`
- `sku`: Unique Product ID (e.g., ELECT-001)
- `quantity`: Number of units currently on-site
- `last_updated`: Last stock-count timestamp

## Business Rules & Logic
- **Capacity Overflow:** Any `shipment` with destination `city` must be checked against the `max_capacity_m3` of the corresponding `warehouse`.
- **Region-Lock:** Inventory transfers are only permitted between `warehouses` in the same `region`.
- **Delivery Status:** Once `shipment` status changes to `delivered`, the `inventory` quantity for the destination warehouse must be incremented.
- **SKU Uniqueness:** Each `sku` must be unique across all warehouses in the system.
