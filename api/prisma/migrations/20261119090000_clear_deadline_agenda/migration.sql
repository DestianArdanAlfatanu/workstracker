-- Agenda "Batas akhir melamar" hanya berguna selama lamaran masih Wishlist.
-- Bersihkan agenda itu dari lamaran yang sudah Applied atau sesudahnya (data lama sebelum aturan ini).
UPDATE `applications`
SET `next_action_date` = NULL, `next_action_note` = NULL
WHERE `status` <> 'wishlist' AND `next_action_note` = 'Batas akhir melamar';
