-- Sumber lamaran per portal loker (Chrome Extension & Insight per portal)
ALTER TABLE `applications` MODIFY `source` ENUM('linkedin', 'jobstreet', 'glints', 'kalibrr', 'dealls', 'kitalulus', 'loker_id', 'indeed', 'karirhub', 'company_site', 'instagram', 'referral', 'other') NOT NULL DEFAULT 'other';
