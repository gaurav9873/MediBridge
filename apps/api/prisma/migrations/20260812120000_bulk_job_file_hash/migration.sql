-- ---------------------------------------------------------------------------
-- Remember what was uploaded, so a repeat can be recognised.
--
-- SHA-256 of the uploaded bytes. Nullable on purpose: jobs that ran before
-- this column existed have no bytes left to hash, and inventing a value for
-- them would make them look like duplicates of each other.
--
-- Hand-written, like every migration here: Prisma's diff of this schema also
-- wants to drop the GiST, GIN and trigram indexes it cannot see.
-- ---------------------------------------------------------------------------
ALTER TABLE "bulk_jobs" ADD COLUMN "fileHash" VARCHAR(64);

-- Finding a previous upload of the same bytes by the same person.
CREATE INDEX "bulk_jobs_createdById_fileHash_idx" ON "bulk_jobs"("createdById", "fileHash");
