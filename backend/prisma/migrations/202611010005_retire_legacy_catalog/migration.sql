-- Hide former catalogue while preserving every session and booking unchanged.
UPDATE "Trainer" SET archived=1 WHERE id NOT IN ('club-polina-t','club-darya-t','club-georgy-b','club-polina-d');
UPDATE "Venue" SET archived=1 WHERE id NOT IN ('club-youth','club-dynamo-sporta');
UPDATE "Court" SET archived=1 WHERE "venueId" NOT IN ('club-youth','club-dynamo-sporta');
