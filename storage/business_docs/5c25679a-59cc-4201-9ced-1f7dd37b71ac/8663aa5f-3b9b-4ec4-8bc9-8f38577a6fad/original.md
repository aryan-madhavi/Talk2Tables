# Factory Operations Database (MySQL)
**Database Name:** `factory_db`

## Overview
This database manages the core manufacturing floor operations, including inventory of raw parts, status of production lines, and quality control logs.

## Tables & Schema

### 1. `parts`
Tracks individual components and raw materials.
- `part_id`: Primary Key (Auto-increment)
- `name`: Component name (e.g., Sensor-A1, Valve-B2)
- `category`: Classification (Electronics, Hardware, Materials)
- `stock_quantity`: Current units in stock
- `unit_price`: Cost per single unit

### 2. `production_lines`
Monitors the state of the factory floor zones.
- `line_id`: Primary Key
- `location`: Physical zone in the factory (e.g., Floor 1 - Zone A)
- `status`: Current state (`active`, `maintenance`, `idle`)
- `daily_capacity`: Maximum units the line can process per day

### 3. `quality_logs`
Historical record of part inspections.
- `log_id`: Primary Key
- `part_id`: Foreign Key to `parts`
- `check_date`: Timestamp of inspection
- `status`: Result (`passed`, `failed`)
- `inspector_name`: Name of the employee who performed the check

## Business Rules & Logic
- **Maintenance Lock:** Production lines marked as `maintenance` cannot be assigned new work orders in the system.
- **QC Threshold:** Any part with a `failed` status in `quality_logs` is automatically flagged for disposal and subtracted from `stock_quantity`.
- **Restock Alert:** If `stock_quantity` falls below 100 units, the system should trigger a procurement request.
