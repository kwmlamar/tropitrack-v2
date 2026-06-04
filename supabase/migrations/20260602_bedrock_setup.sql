-- ============================================================
-- BEDROCK SETUP — apply once in Supabase Dashboard SQL Editor
-- ============================================================

-- ─── GANTT PHASES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gantt_phases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  order_index   integer NOT NULL DEFAULT 0,
  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,
  progress      integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  crew_size     integer,
  notes         text,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── MATERIALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id            text PRIMARY KEY,
  division_code text NOT NULL,
  division_name text NOT NULL,
  category      text NOT NULL,
  name          text NOT NULL,
  unit          text NOT NULL,
  unit_cost     numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  supplier      text,
  notes         text,
  updated_at    date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── RECEIPTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  submitted_by  uuid,
  image_url     text NOT NULL,
  vendor        text,
  receipt_date  date,
  total_amount  numeric(10,2),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── RECEIPT LINE ITEMS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  material_id       text REFERENCES materials(id) ON DELETE SET NULL,
  receipt_name      text NOT NULL,
  qty               numeric(10,3),
  unit              text,
  unit_cost         numeric(10,2),
  total_cost        numeric(10,2),
  match_confidence  text CHECK (match_confidence IN ('high','medium','low','none')),
  applied           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── EXPORTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  export_type   text NOT NULL CHECK (export_type IN ('estimate','payroll','progress','timesheet')),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  file_url      text NOT NULL,
  file_name     text NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── COMPANY DOCS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  title         text NOT NULL,
  doc_type      text NOT NULL DEFAULT 'note' CHECK (doc_type IN ('compass','sop','goal','note')),
  content       text NOT NULL DEFAULT '',
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── BUSINESS GOALS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','paused')),
  target_date   date,
  progress      integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  notes         text,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gantt_phases_project   ON gantt_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_gantt_phases_company   ON gantt_phases(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_division     ON materials(division_code);
CREATE INDEX IF NOT EXISTS idx_receipts_company       ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_receipts_project       ON receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt  ON receipt_line_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_exports_company        ON exports(company_id);
CREATE INDEX IF NOT EXISTS idx_company_docs_company   ON company_docs(company_id);
CREATE INDEX IF NOT EXISTS idx_business_goals_company ON business_goals(company_id);

-- ─── GRANTS ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON gantt_phases       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON materials          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipts           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exports            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_docs       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON business_goals     TO authenticated;
GRANT SELECT ON materials TO anon;

NOTIFY pgrst, 'reload schema';

-- ─── MATERIALS SEED — Eleuthera Pricing Database (165 items) ─────────────────
INSERT INTO materials (id, division_code, division_name, category, name, unit, unit_cost, supplier, notes) VALUES
('S001','03','Concrete','Ready-Mix','Ready-Mix Concrete 3000 PSI','CY',280,'Nassau/Local','Delivered. Price varies with freight.'),
('S002','03','Concrete','Ready-Mix','Ready-Mix Concrete 4000 PSI','CY',315,'Nassau/Local','Structural elements.'),
('S003','03','Concrete','Block','CMU 8" Standard Block','EA',3.50,'Local','8x8x16 CMU.'),
('S004','03','Concrete','Block','CMU 6" Standard Block','EA',2.75,'Local','6x8x16 CMU.'),
('S005','03','Concrete','Block','CMU 4" Standard Block','EA',2.25,'Local','4x8x16 solid block.'),
('S006','03','Concrete','Cement & Aggregates','Portland Cement 94lb Bag','BAG',18.50,'Local/Nassau','Type I/II.'),
('S007','03','Concrete','Cement & Aggregates','Masonry Sand','CY',65,'Local','Washed masonry sand.'),
('S008','03','Concrete','Cement & Aggregates','3/4" Crushed Gravel','CY',85,'Local/Nassau','Coarse aggregate.'),
('S009','03','Concrete','Reinforcement','Rebar #3 (3/8") 20'' Stick','EA',14,'Nassau','Grade 60 deformed.'),
('S010','03','Concrete','Reinforcement','Rebar #4 (1/2") 20'' Stick','EA',22,'Nassau','Grade 60 deformed.'),
('S011','03','Concrete','Reinforcement','Rebar #5 (5/8") 20'' Stick','EA',32,'Nassau','Grade 60 deformed.'),
('S012','03','Concrete','Reinforcement','Wire Mesh 6x6 W1.4 4x8 Sheet','SHEET',48,'Nassau','Welded wire mesh for slabs.'),
('S013','03','Concrete','Reinforcement','Tie Wire 16ga 3.5lb Roll','ROLL',22,'Nassau','For rebar tying.'),
('S014','04','Masonry','Mortar & Grout','Type S Mortar 80lb Bag','BAG',17,'Nassau','Structural masonry.'),
('S015','04','Masonry','Mortar & Grout','Masonry Grout 80lb Bag','BAG',19,'Nassau','CMU cell filling.'),
('S016','04','Masonry','Stone','Coral Rock (Dug)','CY',45,'Local','Local coral fill.'),
('S017','04','Masonry','Accessories','Masonry Ties Box/100','BOX',38,'Nassau','Wall ties and anchors.'),
('S018','04','Masonry','Accessories','Foam Block Fill Insulation','BF',1.20,'Nassau','CMU cell insulation.'),
('S019','06','Wood & Plastics','Dimensional Lumber','2x4x8 Pressure Treated','EA',12,'Nassau','Ground contact rated.'),
('S020','06','Wood & Plastics','Dimensional Lumber','2x4x10 Pressure Treated','EA',15,'Nassau',''),
('S021','06','Wood & Plastics','Dimensional Lumber','2x6x8 Pressure Treated','EA',18,'Nassau',''),
('S022','06','Wood & Plastics','Dimensional Lumber','2x6x10 Pressure Treated','EA',22,'Nassau',''),
('S023','06','Wood & Plastics','Dimensional Lumber','2x8x8 Pressure Treated','EA',24,'Nassau',''),
('S024','06','Wood & Plastics','Dimensional Lumber','2x10x8 Pressure Treated','EA',30,'Nassau',''),
('S025','06','Wood & Plastics','Dimensional Lumber','2x12x8 Pressure Treated','EA',38,'Nassau',''),
('S026','06','Wood & Plastics','Dimensional Lumber','4x4x8 PT Post','EA',26,'Nassau',''),
('S027','06','Wood & Plastics','Dimensional Lumber','4x6x8 PT Post','EA',36,'Nassau',''),
('S028','06','Wood & Plastics','Sheet Goods','3/4" CDX Plywood 4x8','SHEET',78,'Nassau','Sheathing grade.'),
('S029','06','Wood & Plastics','Sheet Goods','1/2" CDX Plywood 4x8','SHEET',62,'Nassau',''),
('S030','06','Wood & Plastics','Sheet Goods','3/4" OSB 4x8','SHEET',58,'Nassau',''),
('S031','06','Wood & Plastics','Sheet Goods','1/2" OSB 4x8','SHEET',42,'Nassau',''),
('S032','06','Wood & Plastics','Sheet Goods','1/4" Luan Plywood 4x8','SHEET',35,'Nassau',''),
('S033','06','Wood & Plastics','Engineered Lumber','LVL 1.75x9.5 per LF','LF',30,'Nassau','Price varies by volume.'),
('S034','06','Wood & Plastics','Engineered Lumber','LVL 1.75x11.25 per LF','LF',36,'Nassau',''),
('S035','06','Wood & Plastics','Engineered Lumber','LVL 1.75x14 per LF','LF',45,'Nassau',''),
('S036','06','Wood & Plastics','Fasteners & Hardware','Hurricane Strap H2.5','EA',4.50,'Nassau',''),
('S037','06','Wood & Plastics','Fasteners & Hardware','Hurricane Strap H10','EA',7.50,'Nassau',''),
('S038','06','Wood & Plastics','Fasteners & Hardware','Post Cap 4x4 BC','EA',18,'Nassau',''),
('S039','06','Wood & Plastics','Fasteners & Hardware','Joist Hanger 2x6','EA',5.50,'Nassau',''),
('S040','06','Wood & Plastics','Fasteners & Hardware','Joist Hanger 2x8','EA',6.50,'Nassau',''),
('S041','06','Wood & Plastics','Fasteners & Hardware','3" Structural Screws Box/100','BOX',28,'Nassau',''),
('S042','06','Wood & Plastics','Fasteners & Hardware','16d Galv Nails 5lb Box','BOX',24,'Nassau',''),
('S043','07','Thermal & Moisture','Insulation','R-13 Batt Insulation 3.5"','SF',0.95,'Nassau','2x4 wall cavities.'),
('S044','07','Thermal & Moisture','Insulation','R-19 Batt Insulation 6"','SF',1.25,'Nassau','2x6 walls and floors.'),
('S045','07','Thermal & Moisture','Insulation','R-30 Batt Insulation','SF',1.75,'Nassau','Ceiling/attic.'),
('S046','07','Thermal & Moisture','Insulation','2" Rigid ISO Board 4x8','SHEET',55,'Nassau','Foil-faced polyisocyanurate.'),
('S047','07','Thermal & Moisture','Roofing','Standing Seam Metal 24ga','SF',8.50,'Nassau','Galvalume. Material only.'),
('S048','07','Thermal & Moisture','Roofing','Corrugated Galvalume 26ga','SF',4.50,'Nassau','Standard corrugated sheet.'),
('S049','07','Thermal & Moisture','Roofing','Architectural Shingles 30yr','SQUARE',275,'Nassau','Per 100 SF.'),
('S050','07','Thermal & Moisture','Roofing','Ice & Water Shield','SF',1.60,'Nassau','Self-adhering membrane.'),
('S051','07','Thermal & Moisture','Roofing','30lb Felt Underlayment','SF',0.28,'Nassau',''),
('S052','07','Thermal & Moisture','Roofing','Ridge Cap Metal per LF','LF',18,'Nassau','Pre-formed metal.'),
('S053','07','Thermal & Moisture','Roofing','Roofing Screws w/Washer Box/250','BOX',45,'Nassau','Self-drilling.'),
('S054','07','Thermal & Moisture','Waterproofing','House Wrap 9''x100'' Roll','ROLL',185,'Nassau','Vapor permeable weather barrier.'),
('S055','07','Thermal & Moisture','Waterproofing','Elastomeric Waterproofing','GAL',65,'Nassau','Below-grade/wet areas.'),
('S056','07','Thermal & Moisture','Sealants','Paintable Latex Caulk','TUBE',8,'Nassau',''),
('S057','07','Thermal & Moisture','Sealants','Silicone Caulk','TUBE',14,'Nassau','Wet areas.'),
('S058','07','Thermal & Moisture','Sealants','Expanding Foam Sealant','CAN',20,'Nassau',''),
('S059','08','Openings','Impact Windows','Impact Single-Hung Alum 2x4','EA',385,'Nassau','Hurricane rated DP50+.'),
('S060','08','Openings','Impact Windows','Impact Single-Hung Alum 3x4','EA',495,'Nassau','Hurricane rated DP50+.'),
('S061','08','Openings','Impact Windows','Impact Single-Hung Alum 4x4','EA',645,'Nassau','Hurricane rated DP50+.'),
('S062','08','Openings','Impact Windows','Impact Casement 3x4','EA',755,'Nassau','Hurricane rated.'),
('S063','08','Openings','Impact Windows','Impact Slider 6x4','EA',875,'Nassau','Hurricane rated.'),
('S064','08','Openings','Impact Windows','Impact Slider 8x4','EA',1150,'Nassau','Hurricane rated.'),
('S065','08','Openings','Exterior Doors','Impact Entry Door Steel 3/0x6/8','EA',1950,'Nassau','Impact-rated, incl. frame.'),
('S066','08','Openings','Exterior Doors','Impact French Doors 6/0x6/8','EA',3400,'Nassau','Double impact, incl. frame.'),
('S067','08','Openings','Exterior Doors','Impact French Doors 8/0x6/8','EA',4200,'Nassau',''),
('S068','08','Openings','Interior Doors','Interior Door HM 2/8x6/8','EA',155,'Nassau','Hollow core w/ jamb.'),
('S069','08','Openings','Interior Doors','Interior Door HM 3/0x6/8','EA',175,'Nassau','Hollow core w/ jamb.'),
('S070','08','Openings','Interior Doors','Bifold Door Set 4/0','EA',205,'Nassau','With track hardware.'),
('S071','08','Openings','Interior Doors','Pocket Door Kit 3/0','EA',245,'Nassau','Frame kit included.'),
('S072','08','Openings','Door Hardware','Passage Knob Set','EA',48,'Nassau',''),
('S073','08','Openings','Door Hardware','Privacy Knob Set Bath/Bed','EA',62,'Nassau',''),
('S074','08','Openings','Door Hardware','Deadbolt Single Cylinder','EA',88,'Nassau',''),
('S075','08','Openings','Door Hardware','Door Closer Heavy Duty','EA',95,'Nassau','For exterior/commercial.'),
('S076','09','Finishes','Drywall','5/8" Type X Drywall 4x8','SHEET',34,'Nassau','Fire-rated.'),
('S077','09','Finishes','Drywall','1/2" Regular Drywall 4x8','SHEET',28,'Nassau',''),
('S078','09','Finishes','Drywall','5/8" Mold-Resistant Drywall 4x8','SHEET',40,'Nassau','Wet areas/green board equiv.'),
('S079','09','Finishes','Drywall','Cement Board 1/2" 3x5','SHEET',32,'Nassau','Shower/tile backer.'),
('S080','09','Finishes','Drywall','Drywall Compound 5 Gal','PAIL',48,'Nassau',''),
('S081','09','Finishes','Drywall','Drywall Tape Paper 300''','ROLL',9,'Nassau',''),
('S082','09','Finishes','Drywall','Metal Corner Bead 10''','EA',5.50,'Nassau',''),
('S083','09','Finishes','Tile','Ceramic Tile 12x12 Basic','SF',4.50,'Nassau','Builder grade.'),
('S084','09','Finishes','Tile','Porcelain Tile 12x12','SF',5.75,'Nassau',''),
('S085','09','Finishes','Tile','Porcelain Tile 24x24','SF',7.50,'Nassau','Large format, polished.'),
('S086','09','Finishes','Tile','Subway Tile 3x6 White','SF',6.50,'Nassau',''),
('S087','09','Finishes','Tile','Tile Adhesive/Mastic 3.5 Gal','PAIL',58,'Nassau',''),
('S088','09','Finishes','Tile','Unsanded Grout 25lb','BAG',34,'Nassau','Joints under 1/8".'),
('S089','09','Finishes','Tile','Sanded Grout 25lb','BAG',34,'Nassau','Joints over 1/8".'),
('S090','09','Finishes','Tile','Aluminum Tile Trim L-Piece 8''','EA',18,'Nassau',''),
('S091','09','Finishes','Flooring','LVP Flooring Mid-Grade 5mm','SF',5.25,'Nassau',''),
('S092','09','Finishes','Flooring','3/4" Oak Hardwood Prefinished','SF',9.50,'Nassau',''),
('S093','09','Finishes','Flooring','Carpet Mid-Grade w/Pad','SY',22,'Nassau',''),
('S094','09','Finishes','Paint','Interior Latex Paint 5 Gal','PAIL',98,'Nassau','Mid-grade.'),
('S095','09','Finishes','Paint','Exterior Paint 5 Gal','PAIL',125,'Nassau','100% acrylic.'),
('S096','09','Finishes','Paint','PVA Primer 5 Gal','PAIL',78,'Nassau','Drywall primer.'),
('S097','09','Finishes','Paint','Masonry Paint 5 Gal','PAIL',115,'Nassau','CMU/concrete block.'),
('S098','22','Plumbing','DWV Pipe','4" PVC DWV Sch40 10''','EA',52,'Nassau',''),
('S099','22','Plumbing','DWV Pipe','3" PVC DWV Sch40 10''','EA',38,'Nassau',''),
('S100','22','Plumbing','DWV Pipe','2" PVC DWV Sch40 10''','EA',24,'Nassau',''),
('S101','22','Plumbing','DWV Pipe','1.5" PVC DWV Sch40 10''','EA',19,'Nassau',''),
('S102','22','Plumbing','Supply Pipe','3/4" CPVC Pipe 10''','EA',30,'Nassau',''),
('S103','22','Plumbing','Supply Pipe','1/2" CPVC Pipe 10''','EA',24,'Nassau',''),
('S104','22','Plumbing','Supply Pipe','3/4" PEX Tubing 100'' Roll','ROLL',145,'Nassau',''),
('S105','22','Plumbing','Supply Pipe','1" PVC Sch80 Pressure 10''','EA',28,'Nassau','Supply mains.'),
('S106','22','Plumbing','Fixtures & Equipment','Water Heater 40gal Electric','EA',895,'Nassau',''),
('S107','22','Plumbing','Fixtures & Equipment','Water Heater 50gal Electric','EA',1095,'Nassau',''),
('S108','22','Plumbing','Fixtures & Equipment','Tankless Water Heater Electric','EA',1550,'Nassau','Whole-house.'),
('S109','22','Plumbing','Fixtures & Equipment','Toilet Standard 1.28 GPF','EA',395,'Nassau',''),
('S110','22','Plumbing','Fixtures & Equipment','Kitchen Faucet Mid-Grade','EA',195,'Nassau','Single handle.'),
('S111','22','Plumbing','Fixtures & Equipment','Bathroom Vanity Faucet','EA',135,'Nassau',''),
('S112','22','Plumbing','Fixtures & Equipment','Shower Valve w/Trim','EA',265,'Nassau','Pressure-balanced.'),
('S113','22','Plumbing','Fixtures & Equipment','Utility/Laundry Sink','EA',175,'Nassau',''),
('S114','22','Plumbing','Fixtures & Equipment','Bathtub Alcove 60"','EA',485,'Nassau',''),
('S115','23','HVAC','Mini-Split Systems','Mini-Split 9000 BTU Single Zone','EA',1350,'Nassau','Inverter, incl. lineset.'),
('S116','23','HVAC','Mini-Split Systems','Mini-Split 12000 BTU Single Zone','EA',1650,'Nassau',''),
('S117','23','HVAC','Mini-Split Systems','Mini-Split 18000 BTU Single Zone','EA',2250,'Nassau',''),
('S118','23','HVAC','Mini-Split Systems','Mini-Split 24000 BTU Single Zone','EA',2850,'Nassau',''),
('S119','23','HVAC','Mini-Split Systems','Mini-Split 36000 BTU Single Zone','EA',3650,'Nassau',''),
('S120','23','HVAC','Mini-Split Systems','Multi-Zone Head Unit 9000 BTU','EA',650,'Nassau','Additional zone head.'),
('S121','23','HVAC','Ventilation','Ceiling Fan 52" w/Light Kit','EA',195,'Nassau',''),
('S122','23','HVAC','Ventilation','Bathroom Exhaust Fan 110 CFM','EA',72,'Nassau',''),
('S123','23','HVAC','Ventilation','Kitchen Range Hood Duct 30"','EA',285,'Nassau',''),
('S124','23','HVAC','Accessories','Mini-Split Lineset 1/4"x1/2" 15''','SET',85,'Nassau','Pre-flared copper.'),
('S125','23','HVAC','Accessories','Condensate Drain Line 3/4" per LF','LF',3.50,'Nassau',''),
('S126','26','Electrical','Service & Panels','200A Main Breaker Panel 40-Space','EA',825,'Nassau','120/240V.'),
('S127','26','Electrical','Service & Panels','100A Sub-Panel 20-Space','EA',445,'Nassau',''),
('S128','26','Electrical','Service & Panels','60A Sub-Panel','EA',295,'Nassau',''),
('S129','26','Electrical','Breakers','15A Single Pole Breaker','EA',24,'Nassau',''),
('S130','26','Electrical','Breakers','20A Single Pole Breaker','EA',28,'Nassau',''),
('S131','26','Electrical','Breakers','30A Double Pole Breaker','EA',48,'Nassau',''),
('S132','26','Electrical','Breakers','50A Double Pole Breaker','EA',68,'Nassau',''),
('S133','26','Electrical','Wire & Cable','12/2 NM-B Romex 250'' Roll','ROLL',195,'Nassau',''),
('S134','26','Electrical','Wire & Cable','14/2 NM-B Romex 250'' Roll','ROLL',155,'Nassau',''),
('S135','26','Electrical','Wire & Cable','12/3 NM-B Romex 250'' Roll','ROLL',265,'Nassau','MWBC circuits.'),
('S136','26','Electrical','Wire & Cable','10/2 NM-B Romex 50'' Roll','ROLL',78,'Nassau','Dryers, ranges.'),
('S137','26','Electrical','Wire & Cable','6/3 SE Cable 50'' Roll','ROLL',145,'Nassau','Sub-panels.'),
('S138','26','Electrical','Devices & Boxes','Duplex Outlet 15A','EA',8.50,'Nassau',''),
('S139','26','Electrical','Devices & Boxes','GFCI Outlet 20A','EA',32,'Nassau','Required in wet areas.'),
('S140','26','Electrical','Devices & Boxes','AFCI Outlet/Breaker','EA',55,'Nassau',''),
('S141','26','Electrical','Devices & Boxes','Single Pole Switch 15A','EA',8.50,'Nassau',''),
('S142','26','Electrical','Devices & Boxes','3-Way Switch','EA',16,'Nassau',''),
('S143','26','Electrical','Devices & Boxes','Dimmer Switch','EA',38,'Nassau',''),
('S144','26','Electrical','Devices & Boxes','Single Gang Box','EA',3.50,'Nassau',''),
('S145','26','Electrical','Devices & Boxes','Double Gang Box','EA',5.50,'Nassau',''),
('S146','26','Electrical','Devices & Boxes','4" Junction Box','EA',8.50,'Nassau',''),
('S147','26','Electrical','Lighting','6" LED Recessed Light Dimmable','EA',48,'Nassau','Incl. trim.'),
('S148','26','Electrical','Lighting','4" LED Recessed Light Dimmable','EA',38,'Nassau',''),
('S149','26','Electrical','Lighting','Exterior Light Fixture Mid-Grade','EA',125,'Nassau',''),
('S150','26','Electrical','Conduit','1/2" EMT Conduit 10''','EA',24,'Nassau',''),
('S151','26','Electrical','Conduit','3/4" EMT Conduit 10''','EA',32,'Nassau',''),
('S152','26','Electrical','Conduit','1" EMT Conduit 10''','EA',48,'Nassau',''),
('S153','31','Earthwork','Fill Materials','Fill Dirt','CY',48,'Local',''),
('S154','31','Earthwork','Fill Materials','Crushed Limestone','CY',68,'Local',''),
('S155','31','Earthwork','Fill Materials','Marl','CY',58,'Local',''),
('S156','31','Earthwork','Fill Materials','Crushed Shell Rock','CY',55,'Local',''),
('S157','31','Earthwork','Fill Materials','Landscape Sand','CY',55,'Local',''),
('S158','32','Exterior Improvements','Paving','Concrete Paver 12x12','SF',3.75,'Nassau','Tumbled concrete.'),
('S159','32','Exterior Improvements','Paving','Brick Paver 4x8','EA',1.95,'Nassau',''),
('S160','32','Exterior Improvements','Paving','Poured Concrete Sidewalk/Drive','SF',9.50,'Local Mix','Material incl. rebar.'),
('S161','32','Exterior Improvements','Fencing','Chain Link Fence 4'' w/Posts','LF',22,'Nassau','Galvanized, incl. hardware.'),
('S162','32','Exterior Improvements','Fencing','PT Privacy Fence 6''','LF',32,'Nassau','Dog-ear picket w/posts.'),
('S163','32','Exterior Improvements','Fencing','Aluminum Fence Panel 4''','LF',38,'Nassau','Ornamental style.'),
('S164','32','Exterior Improvements','Landscaping','Landscape Gravel','CY',78,'Local/Nassau',''),
('S165','32','Exterior Improvements','Landscaping','Landscaping Mulch','CY',65,'Nassau','')
ON CONFLICT (id) DO NOTHING;

-- ─── DEMO: Master & Kids Bathroom Shower Renovation Gantt ────────────────────
-- Run ONLY if the project already exists in your projects table.
-- Replace the project_id below with the actual ID from your projects table.
-- You can find it in: Jobs → Master and Kid's Bathroom Shower Renovation → URL

-- INSERT INTO gantt_phases (company_id, project_id, name, order_index, planned_start, planned_end, actual_start, progress, crew_size, notes)
-- VALUES
--   ('<your-company-id>', '<bathroom-project-id>', 'Demo & Tear-Out', 0, '2026-06-09', '2026-06-10', '2026-06-09', 100, 3, 'Strip old tile, remove fixtures, demo existing shower enclosures'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Rough Plumbing', 1, '2026-06-11', '2026-06-12', '2026-06-11', 80, 2, 'Relocate shower valve, extend supply lines, install new drain bodies'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Cement Board & Waterproofing', 2, '2026-06-13', '2026-06-14', NULL, 0, 2, 'Install cement board backer, apply waterproofing membrane'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Floor Tile', 3, '2026-06-16', '2026-06-17', NULL, 0, 2, 'Porcelain 12x12 floor tile, both bathrooms'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Wall Tile', 4, '2026-06-16', '2026-06-20', NULL, 0, 3, 'Porcelain 12x24 wall tile, floor-to-ceiling in shower areas'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Grout & Curing', 5, '2026-06-21', '2026-06-22', NULL, 0, 2, 'Sanded grout all joints, 48hr cure'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Glass Enclosure & Fixtures', 6, '2026-06-23', '2026-06-24', NULL, 0, 2, 'Install frameless glass doors, shower valves and hardware'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Paint & Finishes', 7, '2026-06-25', '2026-06-26', NULL, 0, 2, 'Touch-up paint, caulk perimeter, install accessories'),
--   ('<your-company-id>', '<bathroom-project-id>', 'Punch List & Handover', 8, '2026-06-27', '2026-06-27', NULL, 0, 1, 'Final walk-through, client sign-off');
