-- AI素案生成時の応答には元々confidence（explicit|inferred）が含まれていたが、
-- requirement_itemsへの保存時に書き込んでおらず、データとして保存されていなかった。
-- 以後生成される項目から保存を開始する（過去に生成済みの項目はconfidenceがnullのまま残る）。
alter table requirement_items add column if not exists confidence text check (confidence in ('explicit', 'inferred'));
