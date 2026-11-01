-- Ensure an upgrade from any old version immediately exposes the confirmed catalogue.
INSERT INTO "Trainer" (id,name,bio,archived) VALUES
 ('club-polina-t','Полина Т.','Тренер клуба VLAD SMASH.',0),
 ('club-darya-t','Дарья Т.','Тренер клуба VLAD SMASH.',0),
 ('club-georgy-b','Георгий Б.','Тренер клуба VLAD SMASH.',0),
 ('club-polina-d','Полина Д.','Тренер клуба VLAD SMASH.',0)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,archived=0;
INSERT INTO "Venue" (id,name,address,archived) VALUES
 ('club-youth','СК «Молодежный»','Адрес уточняется',0),
 ('club-dynamo-sporta','СК «Динамо спорта»','Адрес уточняется',0)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,archived=0;
