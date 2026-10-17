-- Suggestions are versioned proposals; source attribution never changes on review.
CREATE FUNCTION careousel_record_suggestion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."importId",NEW."recordId",NEW.excerpt,NEW."originalFields",NEW.method,NEW.explanation,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."importId",OLD."recordId",OLD.excerpt,OLD."originalFields",OLD.method,OLD.explanation,OLD."createdAt") THEN RAISE EXCEPTION 'Suggestion source is immutable'; END IF;
  IF OLD.state<>'PENDING' OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Only pending suggestions can receive versioned review'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "MedicalRecordImport" i JOIN "ImportedMedicalRecord" r ON r."importId"=i.id WHERE i.id=NEW."importId" AND i.state='ACTIVE' AND r.id=NEW."recordId" AND length(NEW.excerpt)>0 AND strpos(r.text,NEW.excerpt)>0) THEN RAISE EXCEPTION 'Suggestion requires an active original source excerpt'; END IF;
 IF NEW."reviewedById" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "User" u JOIN "MedicalRecordImport" i ON u."clinicId"=i."clinicId" WHERE i.id=NEW."importId" AND u.id=NEW."reviewedById" AND u.role='STAFF') THEN RAISE EXCEPTION 'Review requires own-clinic staff'; END IF;
 IF NEW.state='APPROVED' AND NOT EXISTS(SELECT 1 FROM "MedicalTag" t WHERE t.id=NEW."tagId" AND t."sourceImportId"=NEW."importId" AND t."sourceRecordId"=NEW."recordId" AND t.state='APPROVED') THEN RAISE EXCEPTION 'Approved suggestion must link its reviewed source tag'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_suggestion_guard BEFORE INSERT OR UPDATE ON "ImportedTagSuggestion" FOR EACH ROW EXECUTE FUNCTION careousel_record_suggestion_guard();
